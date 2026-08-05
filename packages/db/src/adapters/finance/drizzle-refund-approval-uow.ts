import {
  deriveRefundProviderDispatchAuthorization,
  readAndAssertRefundCumulativePosition,
  readRefundPostingAllocationContext,
  readUnverifiedRefundFundingPosition,
  type ApproveRefundCommand,
  type RefundApprovalCommitReceipt,
  type RefundApprovalUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, inArray } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeRefundAllocationAuthorities,
  financeRefundCases,
  financeRefundCumulativePositions,
  financeRefundFundingPositions,
  financeRefundFundingTransitionAuthorities
} from "../../schema/finance/refund-cases.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  persistProviderOperationBeforeIoInTransaction,
  ProviderOperationIntentCreationPersistenceError
} from "./drizzle-provider-operation-intent-creation-uow";
import {
  commitSealedWalletJournalMutationInTransaction,
  issuePersistenceTransactionBoundaryRef,
  SealedWalletJournalCommitPersistenceError
} from "./drizzle-sealed-wallet-journal-commit-uow";

export type RefundApprovalPersistenceReason =
  | "invalid_command"
  | "refund_not_found"
  | "refund_version_conflict"
  | "refund_identity_conflict"
  | "refund_not_requested"
  | "cumulative_position_not_found"
  | "cumulative_position_conflict"
  | "prior_allocation_conflict"
  | "funding_position_conflict"
  | "funding_transition_conflict"
  | "wallet_commit_conflict"
  | "provider_dispatch_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class RefundApprovalPersistenceError extends Error {
  readonly code = "refund_approval_persistence_error";

  constructor(readonly reason: RefundApprovalPersistenceReason) {
    super("Refund approval could not be persisted atomically");
    this.name = "RefundApprovalPersistenceError";
  }
}

/**
 * Persists the review decision, exact funding reservation and provider dispatch outbox in one
 * PostgreSQL transaction. This adapter deliberately performs no ArcPay I/O: the worker can only
 * see the durable dispatch intent after this transaction commits.
 */
export function createDrizzleRefundApprovalUnitOfWork(input: {
  readonly database: ElevenHouseDatabase;
}): RefundApprovalUnitOfWork {
  return Object.freeze({
    async approveRefund(command) {
      try {
        return await input.database.transaction((transaction) =>
          approveInTransaction(transaction, command)
        );
      } catch (error) {
        if (error instanceof RefundApprovalPersistenceError) throw error;
        if (
          error instanceof SealedWalletJournalCommitPersistenceError ||
          error instanceof ProviderOperationIntentCreationPersistenceError
        ) {
          fail(
            error instanceof SealedWalletJournalCommitPersistenceError
              ? "wallet_commit_conflict"
              : "provider_dispatch_conflict"
          );
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies RefundApprovalUnitOfWork);
}

async function approveInTransaction(
  transaction: FinanceTransaction,
  command: ApproveRefundCommand
): Promise<RefundApprovalCommitReceipt> {
  const refund = await lockRefundCase(transaction, command);
  assertRefundAuthority(command, refund);

  const priorAllocation = await resolvePriorAllocation(transaction, command.execution.allocation);
  const context = readRefundPostingAllocationContext(
    {
      allocation: command.execution.allocation,
      resolvedPriorAllocation: priorAllocation,
      resolvedCumulativePosition: command.execution.resolvedCumulativePosition,
      fundingTransitionBinding: command.execution.fundingTransitionBinding
    },
    command.postingDecoderEnvelope
  );
  assertAllocationMatchesCommand(command, refund, context.allocation);
  const cumulative = readAndAssertRefundCumulativePosition(
    command.execution.resolvedCumulativePosition,
    context.allocation,
    command.postingDecoderEnvelope
  );
  await lockExactCumulativePosition(transaction, command, refund, cumulative);
  await lockAndAssertFundingPositions(
    transaction,
    command,
    refund,
    context.fundingTransitionBinding
  );

  await transaction.insert(financeRefundAllocationAuthorities).values({
    refundId: command.refundId,
    authorityId: context.allocation.authorityId,
    authorityVersion: String(context.allocation.version),
    allocationPayload: context.allocation,
    allocationDigest: context.allocation.allocationDigest
  });

  await insertReservedFundingPositions(
    transaction,
    refund.seriesId,
    context.fundingTransitionBinding
  );
  await transaction.insert(financeRefundFundingTransitionAuthorities).values({
    refundId: command.refundId,
    operation: "approved",
    bindingId: context.fundingTransitionBinding.bindingId,
    bindingPayload: context.fundingTransitionBinding,
    bindingDigest: context.fundingTransitionBinding.bindingDigest
  });

  const walletJournalCommitReceipt =
    command.execution.walletJournalMutation === null
      ? null
      : await commitSealedWalletJournalMutationInTransaction(
          transaction,
          command.execution.walletJournalMutation,
          null
        );
  const providerDispatch = await persistProviderOperationBeforeIoInTransaction(transaction, {
    ...command.execution.providerDispatch,
    dispatchAuthorization: deriveRefundProviderDispatchAuthorization(command.approvalAuthority)
  });
  if (
    providerDispatch.providerOperationIntentId !==
    command.execution.providerDispatch.providerOperationIntentId
  ) {
    fail("provider_dispatch_conflict");
  }

  const [updated] = await transaction
    .update(financeRefundCases)
    .set({
      status: "approved",
      version: String(command.expectedRefundVersion + 1),
      approvalAuthorityId: command.approvalAuthority.approvalAuthorityId,
      approvalAuthorityVersion: command.approvalAuthority.approvalAuthorityVersion,
      approvalAuthorityDigest: command.approvalAuthority.approvalAuthorityDigest,
      allocationAuthorityId: context.allocation.authorityId,
      allocationAuthorityVersion: String(context.allocation.version),
      allocationAuthorityDigest: context.allocation.allocationDigest,
      fundingCoverageDigest: context.fundingTransitionBinding.bindingDigest,
      providerOperationIntentId: providerDispatch.providerOperationIntentId,
      approvedAt: new Date(command.approvalAuthority.approvedAt),
      updatedAt: new Date()
    })
    .where(
      and(
        eq(financeRefundCases.id, command.refundId),
        eq(financeRefundCases.status, "requested"),
        eq(financeRefundCases.version, String(command.expectedRefundVersion))
      )
    )
    .returning({ version: financeRefundCases.version, approvedAt: financeRefundCases.approvedAt });
  if (!updated?.approvedAt) fail("refund_version_conflict");

  const persistenceTransactionBoundaryRef =
    await issuePersistenceTransactionBoundaryRef(transaction);
  return Object.freeze({
    kind: "refund_approval_commit_receipt" as const,
    refundId: command.refundId,
    refundVersion: Number(updated.version),
    cumulativePositionVersion: String(cumulative.version),
    approvedDeltaMinor: String(context.allocation.refundAmount.amountMinor),
    fundingCoverageDigest: context.fundingTransitionBinding.bindingDigest,
    fundingState: "provider_dispatch_ready" as const,
    providerOperationIntentId: providerDispatch.providerOperationIntentId,
    walletJournalCommitReceipt,
    persistenceTransactionBoundaryRef,
    committedAt: updated.approvedAt.toISOString()
  }) as unknown as RefundApprovalCommitReceipt;
}

async function lockRefundCase(transaction: FinanceTransaction, command: ApproveRefundCommand) {
  const [refund] = await transaction
    .select()
    .from(financeRefundCases)
    .where(eq(financeRefundCases.id, command.refundId))
    .limit(1)
    .for("update");
  if (!refund) fail("refund_not_found");
  if (refund.status !== "requested") fail("refund_not_requested");
  if (refund.version !== String(command.expectedRefundVersion)) fail("refund_version_conflict");
  if (
    refund.orderId !== command.orderId ||
    refund.economicPaymentIntentId !== command.economicPaymentIntentId ||
    refund.walletId !== command.walletId ||
    refund.currency !== command.currency ||
    refund.approvedCumulativeRefundedMinor !== command.approvedCumulativeRefundMinor
  ) {
    fail("refund_identity_conflict");
  }
  return refund;
}

function assertRefundAuthority(
  command: ApproveRefundCommand,
  refund: typeof financeRefundCases.$inferSelect
): void {
  const authority = command.approvalAuthority;
  if (
    authority.refundId !== command.refundId ||
    authority.refundVersion !== command.expectedRefundVersion ||
    authority.orderId !== command.orderId ||
    authority.economicPaymentIntentId !== command.economicPaymentIntentId ||
    authority.previousCumulativeRefundedMinor !== refund.previousCumulativeRefundedMinor ||
    authority.approvedCumulativeRefundedMinor !== command.approvedCumulativeRefundMinor
  ) {
    fail("refund_identity_conflict");
  }
}

function assertAllocationMatchesCommand(
  command: ApproveRefundCommand,
  refund: typeof financeRefundCases.$inferSelect,
  allocation: {
    refundId: string;
    orderId: string;
    providerIntentId: string;
    refundApprovalAuthorityRef: { authorityId: string; version: number; canonicalDigest: string };
    priorCumulativeRefunded: { amountMinor: number };
    nextCumulativeRefunded: { amountMinor: number };
    providerAccount: { providerAccountId: string; identityVersion: number };
    refundAmount: { currency: string };
  }
): void {
  const approval = command.approvalAuthority;
  if (
    allocation.refundId !== command.refundId ||
    allocation.orderId !== command.orderId ||
    allocation.providerIntentId !== command.execution.providerDispatch.providerOperationIntentId ||
    allocation.refundApprovalAuthorityRef.authorityId !== approval.approvalAuthorityId ||
    allocation.refundApprovalAuthorityRef.version !== Number(approval.approvalAuthorityVersion) ||
    allocation.refundApprovalAuthorityRef.canonicalDigest !== approval.approvalAuthorityDigest ||
    String(allocation.priorCumulativeRefunded.amountMinor) !==
      approval.previousCumulativeRefundedMinor ||
    String(allocation.nextCumulativeRefunded.amountMinor) !==
      approval.approvedCumulativeRefundedMinor ||
    allocation.refundAmount.currency !== command.currency ||
    allocation.providerAccount.providerAccountId !== refund.providerAccountId ||
    allocation.providerAccount.identityVersion !== refund.providerIdentityVersion
  ) {
    fail("refund_identity_conflict");
  }
}

async function resolvePriorAllocation(
  transaction: FinanceTransaction,
  allocation: ApproveRefundCommand["execution"]["allocation"]
): Promise<unknown> {
  if (allocation.priorAllocationAuthorityRef === null) return null;
  const [row] = await transaction
    .select({ payload: financeRefundAllocationAuthorities.allocationPayload })
    .from(financeRefundAllocationAuthorities)
    .where(
      and(
        eq(
          financeRefundAllocationAuthorities.authorityId,
          allocation.priorAllocationAuthorityRef.authorityId
        ),
        eq(
          financeRefundAllocationAuthorities.authorityVersion,
          String(allocation.priorAllocationAuthorityRef.version)
        ),
        eq(
          financeRefundAllocationAuthorities.allocationDigest,
          allocation.priorAllocationAuthorityRef.canonicalDigest
        )
      )
    )
    .limit(1)
    .for("share");
  if (!row) fail("prior_allocation_conflict");
  return row.payload;
}

async function lockExactCumulativePosition(
  transaction: FinanceTransaction,
  command: ApproveRefundCommand,
  refund: typeof financeRefundCases.$inferSelect,
  position: {
    positionId: string;
    version: number;
    positionDigest: string;
    providerAccount: { providerAccountId: string; identityVersion: number };
    providerPaymentId: string;
    currency: string;
  }
): Promise<void> {
  if (String(position.version) !== command.expectedCumulativePositionVersion)
    fail("cumulative_position_conflict");
  const [row] = await transaction
    .select()
    .from(financeRefundCumulativePositions)
    .where(
      and(
        eq(financeRefundCumulativePositions.positionId, position.positionId),
        eq(financeRefundCumulativePositions.version, String(position.version))
      )
    )
    .limit(1)
    .for("update");
  if (!row) fail("cumulative_position_not_found");
  if (
    row.positionDigest !== position.positionDigest ||
    row.seriesId !== refund.seriesId ||
    row.providerAccountId !== position.providerAccount.providerAccountId ||
    row.providerIdentityVersion !== position.providerAccount.identityVersion ||
    row.providerPaymentId !== position.providerPaymentId ||
    row.currency !== position.currency
  )
    fail("cumulative_position_conflict");
}

async function lockAndAssertFundingPositions(
  transaction: FinanceTransaction,
  command: ApproveRefundCommand,
  refund: typeof financeRefundCases.$inferSelect,
  binding: ApproveRefundCommand["execution"]["fundingTransitionBinding"]
): Promise<void> {
  if (
    binding.operation !== "approved" ||
    binding.priorTransitionBindingRef !== null ||
    binding.terminalAuthorityRef !== null
  ) {
    fail("funding_transition_conflict");
  }
  const byId = new Map(
    command.execution.resolvedFundingPositions.map((position) => [position.positionId, position])
  );
  if (byId.size !== binding.transitions.length) fail("funding_position_conflict");
  const expectedIds = binding.transitions.map(
    (transition) => transition.expectedPositionRef.positionId
  );
  const rows = await transaction
    .select()
    .from(financeRefundFundingPositions)
    .where(inArray(financeRefundFundingPositions.positionId, expectedIds))
    .for("update");
  if (rows.length !== expectedIds.length) fail("funding_position_conflict");
  for (const transition of binding.transitions) {
    const supplied = byId.get(transition.expectedPositionRef.positionId);
    const row = rows.find(
      (candidate) => candidate.positionId === transition.expectedPositionRef.positionId
    );
    if (!supplied || !row) fail("funding_position_conflict");
    const parsed = readUnverifiedRefundFundingPosition(supplied, command.postingDecoderEnvelope);
    if (
      parsed.version !== transition.expectedPositionRef.version ||
      parsed.positionDigest !== transition.expectedPositionRef.canonicalDigest ||
      row.version !== String(parsed.version) ||
      row.positionDigest !== parsed.positionDigest ||
      row.seriesId !== refund.seriesId ||
      row.providerAccountId !== parsed.providerAccount.providerAccountId ||
      row.providerIdentityVersion !== parsed.providerAccount.identityVersion ||
      row.providerPaymentId !== parsed.providerPaymentId ||
      row.currency !== parsed.currency
    )
      fail("funding_position_conflict");
  }
}

async function insertReservedFundingPositions(
  transaction: FinanceTransaction,
  seriesId: string,
  binding: ApproveRefundCommand["execution"]["fundingTransitionBinding"]
): Promise<void> {
  for (const transition of binding.transitions) {
    const position = transition.nextPosition;
    await transaction.insert(financeRefundFundingPositions).values({
      positionId: position.positionId,
      version: String(position.version),
      seriesId,
      providerAccountId: position.providerAccount.providerAccountId,
      providerIdentityVersion: position.providerAccount.identityVersion,
      providerPaymentId: position.providerPaymentId,
      currency: position.currency,
      sourceKind: position.source.kind,
      sourcePayload: position.source,
      capacityMinor: String(position.capacity.amountMinor),
      freeMinor: String(position.freeAmount.amountMinor),
      reservedMinor: String(position.reservedAmount.amountMinor),
      consumedMinor: String(position.consumedAmount.amountMinor),
      positionPayload: position,
      positionDigest: position.positionDigest,
      updatedAt: new Date(position.updatedAt)
    });
  }
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: RefundApprovalPersistenceReason): never {
  throw new RefundApprovalPersistenceError(reason);
}
