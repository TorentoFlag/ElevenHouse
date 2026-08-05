import {
  admitRefundResultExecutionProposal,
  buildRefundFundingTerminalTransition,
  hashFinanceCommandPayload,
  type ApplyVerifiedRefundResultCommand,
  type RefundResultApplicationCommitReceipt,
  type RefundResultApplicationUnitOfWork,
  type VerifiedWalletOperationCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq, inArray } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeRefundAllocationAuthorities,
  financeRefundCases,
  financeRefundCumulativePositions,
  financeRefundFundingPositions,
  financeRefundFundingTransitionAuthorities,
  financeRefundResultApplicationReceipts
} from "../../schema/finance/refund-cases.schema";
import { financeProviderOperationResultCommitReceipts } from "../../schema/finance/provider-operations.schema";
import {
  financeWalletCommitBindings,
  financeWalletHeads
} from "../../schema/finance/wallet.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  commitSealedWalletJournalMutationInTransaction,
  issuePersistenceTransactionBoundaryRef,
  SealedWalletJournalCommitPersistenceError
} from "./drizzle-sealed-wallet-journal-commit-uow";
import {
  mapDatabaseIssuedWalletCommitReceipt,
  prepareWalletJournalMutation
} from "./wallet-row-mapper";

export type RefundResultApplicationPersistenceReason =
  | "invalid_command"
  | "refund_not_found"
  | "refund_version_conflict"
  | "refund_not_approved"
  | "refund_identity_conflict"
  | "provider_result_not_found"
  | "provider_result_conflict"
  | "allocation_conflict"
  | "cumulative_position_conflict"
  | "funding_position_conflict"
  | "funding_transition_conflict"
  | "wallet_commit_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class RefundResultApplicationPersistenceError extends Error {
  readonly code = "refund_result_application_persistence_error";

  constructor(readonly reason: RefundResultApplicationPersistenceReason) {
    super("Verified refund result could not be applied atomically");
    this.name = "RefundResultApplicationPersistenceError";
  }
}

/**
 * Applies only a terminal result already committed by ProviderOperationResultApplicationUnitOfWork.
 * The outbound ArcPay call is intentionally outside this transaction; the provider-result receipt
 * is the idempotency authority and a repeated webhook/result replays this immutable receipt.
 */
export function createDrizzleRefundResultApplicationUnitOfWork(input: {
  readonly database: ElevenHouseDatabase;
}): RefundResultApplicationUnitOfWork {
  return Object.freeze({
    async applyVerifiedRefundResult(command) {
      let admitted: ReturnType<typeof normalizeCommand>;
      try {
        admitted = normalizeCommand(command);
      } catch {
        fail("invalid_command");
      }
      try {
        return await input.database.transaction((transaction) =>
          applyInTransaction(transaction, admitted)
        );
      } catch (error) {
        if (error instanceof RefundResultApplicationPersistenceError) throw error;
        if (error instanceof SealedWalletJournalCommitPersistenceError)
          fail("wallet_commit_conflict");
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("provider_result_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies RefundResultApplicationUnitOfWork);
}

type NormalizedCommand = Readonly<{
  command: ApplyVerifiedRefundResultCommand;
  execution: ReturnType<typeof admitRefundResultExecutionProposal>;
}>;

function normalizeCommand(command: ApplyVerifiedRefundResultCommand): NormalizedCommand {
  if (
    !Number.isSafeInteger(command.expectedRefundVersion) ||
    command.expectedRefundVersion < 1 ||
    !identifier(command.refundId) ||
    !identifier(command.walletId) ||
    !identifier(command.expectedWalletRevision) ||
    !identifier(command.expectedCumulativePositionVersion)
  ) {
    fail("invalid_command");
  }
  const execution = admitRefundResultExecutionProposal(
    command.execution,
    command.postingDecoderEnvelope
  );
  if (
    command.providerResult.operationKind !== "refund" ||
    (command.providerResult.outcome !== "succeeded" &&
      command.providerResult.outcome !== "failed") ||
    command.refundOutcome.kind !== "verified_refund_provider_outcome" ||
    command.refundOutcome.outcome !== command.providerResult.outcome ||
    command.refundOutcome.outcome !==
      (execution.terminalAuthority.kind === "refund_confirmed" ? "succeeded" : "failed") ||
    command.refundOutcome.refundId !== command.refundId ||
    command.refundOutcome.providerRefundId !== execution.terminalAuthority.providerRefundId ||
    command.refundOutcome.providerPaymentId !== execution.terminalAuthority.providerPaymentId ||
    command.refundOutcome.currency !== "RUB" ||
    command.refundOutcome.artifact.artifactId !== execution.terminalAuthority.canonicalEvidenceId ||
    command.refundOutcome.artifact.sha256Digest !==
      execution.terminalEvidenceBinding.providerIntent.canonicalEvidence.digest
  ) {
    fail("invalid_command");
  }
  if (
    execution.allocation.refundId !== command.refundId ||
    execution.terminalAuthority.refundId !== command.refundId ||
    execution.terminalAuthority.providerAccountId !==
      command.refundOutcome.providerAccount.providerAccountId ||
    execution.terminalAuthority.providerPaymentId !== command.refundOutcome.providerPaymentId
  ) {
    fail("invalid_command");
  }
  return Object.freeze({ command, execution });
}

async function applyInTransaction(
  transaction: FinanceTransaction,
  normalized: NormalizedCommand
): Promise<RefundResultApplicationCommitReceipt> {
  const { command, execution } = normalized;
  const providerReceipt = await lockProviderResultReceipt(transaction, command);
  const [existing] = await transaction
    .select()
    .from(financeRefundResultApplicationReceipts)
    .where(eq(financeRefundResultApplicationReceipts.providerResultReceiptId, providerReceipt.id))
    .limit(1)
    .for("share");
  if (existing) return replay(transaction, existing, command, execution);

  const refund = await lockRefundCase(transaction, normalized);
  await lockExactWallet(transaction, normalized, refund);
  await lockAndAssertPersistedAllocation(transaction, normalized, refund);
  const cumulativeVersion = await lockAndApplyCumulativePosition(transaction, normalized, refund);
  await lockAndAppendFundingPositions(transaction, normalized, refund);
  await transaction.insert(financeRefundFundingTransitionAuthorities).values({
    refundId: command.refundId,
    operation: execution.fundingTransitionBinding.operation,
    bindingId: execution.fundingTransitionBinding.bindingId,
    bindingPayload: execution.fundingTransitionBinding,
    bindingDigest: execution.fundingTransitionBinding.bindingDigest
  });

  const walletJournalCommitReceipt =
    execution.walletJournalMutation === null
      ? null
      : await commitSealedWalletJournalMutationInTransaction(
          transaction,
          execution.walletJournalMutation,
          null
        );
  const terminalOutcome = command.providerResult.outcome;
  const terminalAt =
    execution.terminalAuthority.kind === "refund_confirmed"
      ? execution.terminalAuthority.confirmedAt
      : execution.terminalAuthority.failedAt;
  const [updated] = await transaction
    .update(financeRefundCases)
    .set({
      status: terminalOutcome,
      version: String(command.expectedRefundVersion + 1),
      providerRefundId: execution.terminalAuthority.providerRefundId,
      resultEvidenceArtifactId: command.refundOutcome.artifact.artifactId,
      resultEvidenceDigest: command.refundOutcome.artifact.sha256Digest,
      terminalAt: new Date(terminalAt),
      updatedAt: new Date()
    })
    .where(
      and(
        eq(financeRefundCases.id, command.refundId),
        eq(financeRefundCases.status, "approved"),
        eq(financeRefundCases.version, String(command.expectedRefundVersion))
      )
    )
    .returning({ version: financeRefundCases.version, terminalAt: financeRefundCases.terminalAt });
  if (!updated?.terminalAt) fail("refund_version_conflict");

  const persistenceTransactionBoundaryRef =
    await issuePersistenceTransactionBoundaryRef(transaction);
  const [receipt] = await transaction
    .insert(financeRefundResultApplicationReceipts)
    .values({
      refundId: command.refundId,
      providerResultReceiptId: providerReceipt.id,
      terminalOutcome,
      refundVersion: updated.version,
      cumulativePositionVersion: String(cumulativeVersion),
      terminalAuthorityPayload: execution.terminalAuthority,
      terminalAuthorityDigest: hashFinanceCommandPayload(execution.terminalAuthority),
      terminalEvidencePayload: execution.terminalEvidenceBinding,
      terminalEvidenceDigest: execution.terminalEvidenceBinding.bindingDigest,
      walletCommitReceiptId: walletJournalCommitReceipt?.receiptId ?? null,
      persistenceTransactionBoundaryRef,
      committedAt: updated.terminalAt
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  return Object.freeze({
    kind: "refund_result_application_commit_receipt" as const,
    refundId: command.refundId,
    refundVersion: Number(updated.version),
    cumulativePositionVersion: String(cumulativeVersion),
    terminalOutcome,
    walletJournalCommitReceipt,
    persistenceTransactionBoundaryRef,
    committedAt: updated.terminalAt.toISOString()
  }) as RefundResultApplicationCommitReceipt;
}

async function lockProviderResultReceipt(
  transaction: FinanceTransaction,
  command: ApplyVerifiedRefundResultCommand
) {
  const [row] = await transaction
    .select()
    .from(financeProviderOperationResultCommitReceipts)
    .where(
      eq(
        financeProviderOperationResultCommitReceipts.providerOperationResultId,
        command.providerResult.providerOperationResultId
      )
    )
    .limit(1)
    .for("share");
  if (!row) fail("provider_result_not_found");
  if (
    row.providerOperationIntentId !== command.providerResult.providerOperationIntentId ||
    row.providerOperationIntentVersion !==
      String(command.providerResult.providerOperationIntentVersion) ||
    row.operationKind !== "refund" ||
    row.outcome !== command.providerResult.outcome ||
    row.economicPaymentIntentId !== command.providerResult.economicPaymentIntentId ||
    row.providerOperationId !== command.providerResult.providerOperationId ||
    row.providerPaymentId !== command.providerResult.providerPaymentId ||
    row.amountMinor !== command.providerResult.amountMinor ||
    row.currency !== command.providerResult.currency ||
    row.evidenceArtifactId !== command.providerResult.evidenceArtifactId ||
    row.evidenceArtifactDigest !== command.providerResult.evidenceArtifactDigest ||
    row.canonicalRequestDigest !== command.providerResult.canonicalRequestDigest ||
    row.persistenceTransactionBoundaryRef !==
      command.providerResult.persistenceTransactionBoundaryRef
  ) {
    fail("provider_result_conflict");
  }
  return row;
}

async function lockRefundCase(transaction: FinanceTransaction, normalized: NormalizedCommand) {
  const { command, execution } = normalized;
  const [refund] = await transaction
    .select()
    .from(financeRefundCases)
    .where(eq(financeRefundCases.id, command.refundId))
    .limit(1)
    .for("update");
  if (!refund) fail("refund_not_found");
  if (refund.status !== "approved") fail("refund_not_approved");
  if (refund.version !== String(command.expectedRefundVersion)) fail("refund_version_conflict");
  if (
    refund.walletId !== command.walletId ||
    refund.economicPaymentIntentId !== command.providerResult.economicPaymentIntentId ||
    refund.providerOperationIntentId !== command.providerResult.providerOperationIntentId ||
    refund.providerAccountId !== execution.allocation.providerAccount.providerAccountId ||
    refund.providerIdentityVersion !== execution.allocation.providerAccount.identityVersion ||
    refund.providerPaymentId !== execution.allocation.providerPaymentId ||
    refund.allocationAuthorityId !== execution.allocation.authorityId ||
    refund.allocationAuthorityVersion !== String(execution.allocation.version) ||
    refund.allocationAuthorityDigest !== execution.allocation.allocationDigest ||
    refund.fundingCoverageDigest !==
      execution.fundingTransitionBinding.priorTransitionBindingRef?.canonicalDigest
  ) {
    fail("refund_identity_conflict");
  }
  return refund;
}

async function lockExactWallet(
  transaction: FinanceTransaction,
  normalized: NormalizedCommand,
  refund: typeof financeRefundCases.$inferSelect
): Promise<void> {
  const [wallet] = await transaction
    .select()
    .from(financeWalletHeads)
    .where(eq(financeWalletHeads.id, normalized.command.walletId))
    .limit(1)
    .for("update");
  if (
    !wallet ||
    wallet.astrologerUserId !== refund.astrologerUserId ||
    wallet.currency !== refund.currency ||
    wallet.revision !== normalized.command.expectedWalletRevision
  ) {
    fail("wallet_commit_conflict");
  }
}

async function lockAndAssertPersistedAllocation(
  transaction: FinanceTransaction,
  normalized: NormalizedCommand,
  refund: typeof financeRefundCases.$inferSelect
): Promise<void> {
  const [allocation] = await transaction
    .select()
    .from(financeRefundAllocationAuthorities)
    .where(eq(financeRefundAllocationAuthorities.refundId, refund.id))
    .limit(1)
    .for("share");
  if (
    !allocation ||
    allocation.authorityId !== normalized.execution.allocation.authorityId ||
    allocation.authorityVersion !== String(normalized.execution.allocation.version) ||
    allocation.allocationDigest !== normalized.execution.allocation.allocationDigest
  ) {
    fail("allocation_conflict");
  }
}

async function lockAndApplyCumulativePosition(
  transaction: FinanceTransaction,
  normalized: NormalizedCommand,
  refund: typeof financeRefundCases.$inferSelect
): Promise<number> {
  const { command, execution } = normalized;
  const position = execution.resolvedCumulativePosition;
  if (
    String(position.version) !== command.expectedCumulativePositionVersion ||
    position.providerAccount.providerAccountId !== refund.providerAccountId ||
    position.providerAccount.identityVersion !== refund.providerIdentityVersion ||
    position.providerPaymentId !== refund.providerPaymentId
  ) {
    fail("cumulative_position_conflict");
  }
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
  if (!row || row.positionDigest !== position.positionDigest || row.seriesId !== refund.seriesId) {
    fail("cumulative_position_conflict");
  }
  const decision = execution.terminalPosting.cumulativePositionDecision;
  if (decision.transition === "unchanged") return position.version;
  const next = decision.nextPosition;
  await transaction.insert(financeRefundCumulativePositions).values({
    positionId: next.positionId,
    version: String(next.version),
    seriesId: refund.seriesId,
    providerAccountId: next.providerAccount.providerAccountId,
    providerIdentityVersion: next.providerAccount.identityVersion,
    providerPaymentId: next.providerPaymentId,
    currency: next.currency,
    confirmedCumulativeRefundedMinor: String(next.confirmedCumulativeRefunded.amountMinor),
    confirmedCumulativePayableReversedMinor: String(
      next.confirmedCumulativePayableReversed.amountMinor
    ),
    confirmedCumulativePlatformReversedMinor: String(
      next.confirmedCumulativePlatformReversed.amountMinor
    ),
    lastConfirmedAllocationAuthorityId: next.lastConfirmedAllocationRef?.authorityId ?? null,
    lastConfirmedAllocationAuthorityVersion: next.lastConfirmedAllocationRef
      ? String(next.lastConfirmedAllocationRef.version)
      : null,
    lastConfirmedAllocationAuthorityDigest:
      next.lastConfirmedAllocationRef?.canonicalDigest ?? null,
    lastConfirmedTerminalAuthorityId: next.lastConfirmedTerminalAuthorityRef?.authorityId ?? null,
    lastConfirmedTerminalAuthorityVersion: next.lastConfirmedTerminalAuthorityRef
      ? String(next.lastConfirmedTerminalAuthorityRef.version)
      : null,
    lastConfirmedTerminalAuthorityDigest:
      next.lastConfirmedTerminalAuthorityRef?.canonicalDigest ?? null,
    positionPayload: next,
    positionDigest: next.positionDigest,
    updatedAt: new Date(next.updatedAt)
  });
  return next.version;
}

async function lockAndAppendFundingPositions(
  transaction: FinanceTransaction,
  normalized: NormalizedCommand,
  refund: typeof financeRefundCases.$inferSelect
): Promise<void> {
  const binding = normalized.execution.fundingTransitionBinding;
  const [approval] = await transaction
    .select()
    .from(financeRefundFundingTransitionAuthorities)
    .where(
      and(
        eq(financeRefundFundingTransitionAuthorities.refundId, refund.id),
        eq(financeRefundFundingTransitionAuthorities.operation, "approved")
      )
    )
    .limit(1)
    .for("share");
  if (
    !approval ||
    binding.priorTransitionBindingRef === null ||
    approval.bindingId !== binding.priorTransitionBindingRef.bindingId ||
    approval.bindingDigest !== binding.priorTransitionBindingRef.canonicalDigest
  ) {
    fail("funding_transition_conflict");
  }
  let expectedBinding: ReturnType<typeof buildRefundFundingTerminalTransition>;
  try {
    expectedBinding = buildRefundFundingTerminalTransition(
      {
        allocation: normalized.execution.allocation,
        approvalTransitionBinding: approval.bindingPayload,
        resolvedPositions: normalized.execution.resolvedFundingPositions,
        terminalAuthority: normalized.execution.terminalAuthority
      },
      normalized.command.postingDecoderEnvelope
    );
  } catch {
    fail("funding_transition_conflict");
  }
  if (
    expectedBinding.bindingId !== binding.bindingId ||
    expectedBinding.bindingDigest !== binding.bindingDigest
  ) {
    fail("funding_transition_conflict");
  }
  const supplied = new Map(
    normalized.execution.resolvedFundingPositions.map((position) => [position.positionId, position])
  );
  const ids = binding.transitions.map((transition) => transition.expectedPositionRef.positionId);
  if (supplied.size !== ids.length) fail("funding_position_conflict");
  const rows = await transaction
    .select()
    .from(financeRefundFundingPositions)
    .where(inArray(financeRefundFundingPositions.positionId, ids))
    .for("update");
  const exactRows = rows.filter((row) =>
    binding.transitions.some(
      (transition) =>
        transition.expectedPositionRef.positionId === row.positionId &&
        String(transition.expectedPositionRef.version) === row.version
    )
  );
  if (exactRows.length !== ids.length) fail("funding_position_conflict");
  for (const transition of binding.transitions) {
    const prior = supplied.get(transition.expectedPositionRef.positionId);
    const row = exactRows.find(
      (candidate) =>
        candidate.positionId === transition.expectedPositionRef.positionId &&
        candidate.version === String(transition.expectedPositionRef.version)
    );
    if (
      !prior ||
      !row ||
      prior.version !== transition.expectedPositionRef.version ||
      prior.positionDigest !== transition.expectedPositionRef.canonicalDigest ||
      row.version !== String(prior.version) ||
      row.positionDigest !== prior.positionDigest ||
      row.seriesId !== refund.seriesId
    ) {
      fail("funding_position_conflict");
    }
    const next = transition.nextPosition;
    await transaction.insert(financeRefundFundingPositions).values({
      positionId: next.positionId,
      version: String(next.version),
      seriesId: refund.seriesId,
      providerAccountId: next.providerAccount.providerAccountId,
      providerIdentityVersion: next.providerAccount.identityVersion,
      providerPaymentId: next.providerPaymentId,
      currency: next.currency,
      sourceKind: next.source.kind,
      sourcePayload: next.source,
      capacityMinor: String(next.capacity.amountMinor),
      freeMinor: String(next.freeAmount.amountMinor),
      reservedMinor: String(next.reservedAmount.amountMinor),
      consumedMinor: String(next.consumedAmount.amountMinor),
      positionPayload: next,
      positionDigest: next.positionDigest,
      updatedAt: new Date(next.updatedAt)
    });
  }
}

async function replay(
  transaction: FinanceTransaction,
  receipt: typeof financeRefundResultApplicationReceipts.$inferSelect,
  command: ApplyVerifiedRefundResultCommand,
  execution: ReturnType<typeof admitRefundResultExecutionProposal>
): Promise<RefundResultApplicationCommitReceipt> {
  if (
    receipt.refundId !== command.refundId ||
    receipt.terminalOutcome !== command.providerResult.outcome ||
    receipt.terminalAuthorityDigest !== hashFinanceCommandPayload(execution.terminalAuthority) ||
    receipt.terminalEvidenceDigest !== execution.terminalEvidenceBinding.bindingDigest
  ) {
    fail("provider_result_conflict");
  }
  const walletJournalCommitReceipt = await rehydrateWalletCommitReceipt(
    transaction,
    receipt.walletCommitReceiptId,
    execution
  );
  return Object.freeze({
    kind: "refund_result_application_commit_receipt" as const,
    refundId: receipt.refundId,
    refundVersion: Number(receipt.refundVersion),
    cumulativePositionVersion: receipt.cumulativePositionVersion,
    terminalOutcome: receipt.terminalOutcome,
    walletJournalCommitReceipt,
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef,
    committedAt: receipt.committedAt.toISOString()
  }) as RefundResultApplicationCommitReceipt;
}

async function rehydrateWalletCommitReceipt(
  transaction: FinanceTransaction,
  commitReceiptId: string | null,
  execution: ReturnType<typeof admitRefundResultExecutionProposal>
): Promise<VerifiedWalletOperationCommitReceipt | null> {
  if (commitReceiptId === null) {
    if (execution.walletJournalMutation !== null) fail("provider_result_conflict");
    return null;
  }
  if (execution.walletJournalMutation === null) fail("provider_result_conflict");
  const prepared = prepareWalletJournalMutation(execution.walletJournalMutation);
  const [binding] = await transaction
    .select({
      commitReceiptId: financeWalletCommitBindings.commitReceiptId,
      commitReceiptVersion: financeWalletCommitBindings.commitReceiptVersion,
      commitReceiptCanonicalDigest: financeWalletCommitBindings.commitReceiptCanonicalDigest,
      bindingId: financeWalletCommitBindings.bindingId,
      bindingDigest: financeWalletCommitBindings.bindingDigest,
      operationReceiptId: financeWalletCommitBindings.operationReceiptId,
      journalLinkProofId: financeWalletCommitBindings.journalLinkProofId,
      journalLinkProofVersion: financeWalletCommitBindings.journalLinkProofVersion,
      journalLinkProofDigest: financeWalletCommitBindings.journalLinkProofDigest,
      walletId: financeWalletCommitBindings.nextWalletId,
      previousWalletRevision: financeWalletCommitBindings.previousWalletRevision,
      nextWalletRevision: financeWalletCommitBindings.nextWalletRevision,
      mutationSequence: financeWalletCommitBindings.mutationSequence,
      persistenceTransactionBoundaryRef:
        financeWalletCommitBindings.persistenceTransactionBoundaryRef,
      issuedAt: financeWalletCommitBindings.issuedAt
    })
    .from(financeWalletCommitBindings)
    .where(eq(financeWalletCommitBindings.commitReceiptId, commitReceiptId))
    .limit(1)
    .for("share");
  if (!binding) fail("provider_result_conflict");
  try {
    return mapDatabaseIssuedWalletCommitReceipt(prepared, {
      ...binding,
      operationReceiptDigest: prepared.receipt.canonicalDigest
    });
  } catch {
    fail("provider_result_conflict");
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
function postgresCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}
function fail(reason: RefundResultApplicationPersistenceReason): never {
  throw new RefundResultApplicationPersistenceError(reason);
}
