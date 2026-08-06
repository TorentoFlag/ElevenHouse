import { randomUUID } from "node:crypto";

import {
  createOnlineWalletRefundPendingConfirmedJournal,
  digestFinanceCanonicalValueV1,
  type ApplyCanonicalApprovedOnlineWalletRefundCommand,
  type OnlineWalletRefundTerminalUnitOfWork,
  type WebhookSemanticCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeOnlineSaleCaptureApplications,
  financeOnlineSaleCaptureReceipts,
  financeOnlineWalletHeads
} from "../../schema/finance/online-sale-capture.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletMutations
} from "../../schema/finance/online-wallet-mutations.schema";
import { financeOnlineWalletRefundApplications } from "../../schema/finance/online-wallet-refund-applications.schema";
import {
  financeOnlineWalletRefundCaseAllocations,
  financeOnlineWalletRefundCases,
  financeOnlineWalletRefundCaseTransitions
} from "../../schema/finance/online-wallet-refund-cases.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletProviderAstrologerJournal } from "./drizzle-online-wallet-journal-writer";
import { issuePersistenceTransactionBoundaryRef } from "./drizzle-sealed-wallet-journal-commit-uow";
import {
  applyVerifiedWebhookSemanticFactInTransaction,
  WebhookInboxProcessingPersistenceError
} from "./drizzle-webhook-inbox-processing-uow";

export type OnlineWalletRefundTerminalPersistenceReason =
  | "invalid_command"
  | "semantic_refund_conflict"
  | "refund_case_not_approved"
  | "refund_case_conflict"
  | "refund_pending_allocation_conflict"
  | "wallet_conflict"
  | "terminal_replay_conflict"
  | "persistence_write_incomplete"
  | "retryable_concurrency_conflict";

export class OnlineWalletRefundTerminalPersistenceError extends Error {
  readonly code = "online_wallet_refund_terminal_persistence_error";

  constructor(readonly reason: OnlineWalletRefundTerminalPersistenceReason) {
    super("Approved online-wallet refund could not be terminally applied atomically");
    this.name = "OnlineWalletRefundTerminalPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  semanticFact: ApplyCanonicalApprovedOnlineWalletRefundCommand["semanticFact"];
  refundCaseId: string;
  providerPaymentId: string;
  providerRefundId: string;
  previousCumulativeRefundedMinor: number;
  cumulativeRefundedMinor: number;
  occurredAt: string;
}>;

type RefundCase = typeof financeOnlineWalletRefundCases.$inferSelect;

type PendingAllocation = Readonly<{
  refundPendingAllocationId: string;
  rootLotId: string;
  amountMinor: number;
}>;

/**
 * The V2 terminal refund boundary deliberately consumes only allocations frozen by the V2
 * approval transaction. It does not read or call the legacy refund-case/application path, and
 * it never reconstructs a plan from mutable wallet balances after ArcPay has acted.
 */
export function createDrizzleOnlineWalletRefundTerminalUnitOfWork(input: Readonly<{
  database: ElevenHouseDatabase;
  workerId: string;
}>): OnlineWalletRefundTerminalUnitOfWork {
  const workerId = identifier(input.workerId, "invalid_command");
  return Object.freeze({
    async applyCanonicalApprovedOnlineWalletRefund(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          persist(transaction, workerId, normalized)
        );
      } catch (error) {
        if (
          error instanceof OnlineWalletRefundTerminalPersistenceError ||
          error instanceof WebhookInboxProcessingPersistenceError
        ) {
          throw error;
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("terminal_replay_conflict");
        if (code === "23503" || code === "23514" || code === "55000") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletRefundTerminalUnitOfWork);
}

function normalizeCommand(
  command: ApplyCanonicalApprovedOnlineWalletRefundCommand
): NormalizedCommand {
  const previousCumulativeRefundedMinor = nonNegativeMinor(
    command.previousCumulativeRefundedMinor,
    "invalid_command"
  );
  const cumulativeRefundedMinor = positiveMinor(
    command.cumulativeRefundedMinor,
    "invalid_command"
  );
  if (cumulativeRefundedMinor <= previousCumulativeRefundedMinor) fail("invalid_command");
  const providerRefundId = identifier(command.providerRefundId, "invalid_command");
  const evidence = command.semanticFact.semanticEvidence;
  if (
    evidence.semanticSourceKind !== "refund" ||
    evidence.semanticSourceId !== providerRefundId ||
    evidence.purpose !== "client_order" ||
    evidence.economicPaymentSessionId !== null ||
    evidence.providerPaymentId !== null ||
    evidence.amountMinor !== null ||
    evidence.currency !== null
  ) {
    fail("invalid_command");
  }
  return Object.freeze({
    semanticFact: command.semanticFact,
    refundCaseId: identifier(command.refundCaseId, "invalid_command"),
    providerPaymentId: identifier(command.providerPaymentId, "invalid_command"),
    providerRefundId,
    previousCumulativeRefundedMinor,
    cumulativeRefundedMinor,
    occurredAt: instant(command.occurredAt, "invalid_command")
  });
}

async function persist(
  transaction: FinanceTransaction,
  workerId: string,
  command: NormalizedCommand
): Promise<Readonly<{
  effect: "applied_once" | "semantic_replay";
  refundCaseId: string;
  walletId: string;
  walletRevision: string;
}>> {
  const semanticReceipt = await applyVerifiedWebhookSemanticFactInTransaction(
    transaction,
    workerId,
    command.semanticFact
  );
  assertSemanticReceipt(semanticReceipt, command);

  const [refundCase] = await transaction
    .select()
    .from(financeOnlineWalletRefundCases)
    .where(eq(financeOnlineWalletRefundCases.refundCaseId, command.refundCaseId))
    .limit(2)
    .for("update");
  if (!refundCase) fail("refund_case_not_approved");
  assertCaseIdentity(refundCase, semanticReceipt, command);
  if (refundCase.status !== "approved") return replayTerminal(transaction, refundCase, command);

  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${refundCase.walletId}, 0))`
  );
  const [head] = await transaction
    .select()
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, refundCase.walletId))
    .limit(2)
    .for("update");
  if (
    !head ||
    head.currency !== "RUB" ||
    !head.lastCommitmentDigest ||
    head.astrologerUserId.length === 0
  ) {
    fail("wallet_conflict");
  }

  const allocations = await lockExactPendingAllocations(transaction, refundCase);
  const captureIdentity = await lockCaseCaptureIdentity(transaction, refundCase);
  const payableMinor = allocations.reduce((total, allocation) => total + allocation.amountMinor, 0);
  if (
    payableMinor !== positiveMinor(refundCase.payableReservationMinor, "refund_case_conflict") ||
    payableMinor + nonNegativeMinor(refundCase.commissionReversalMinor, "refund_case_conflict") !==
      positiveMinor(refundCase.refundDeltaMinor, "refund_case_conflict") ||
    BigInt(head.refundPendingMinor) < BigInt(payableMinor)
  ) {
    fail("refund_case_conflict");
  }

  const journal = createOnlineWalletRefundPendingConfirmedJournal({
    refundCaseId: refundCase.refundCaseId,
    orderId: captureIdentity.orderId,
    providerAccountId: refundCase.providerAccountId,
    astrologerUserId: head.astrologerUserId,
    occurredAt: command.occurredAt,
    postedAt: command.occurredAt,
    commissionReversalMinor: nonNegativeMinor(
      refundCase.commissionReversalMinor,
      "refund_case_conflict"
    ),
    grossAmountMinor: positiveMinor(refundCase.refundDeltaMinor, "refund_case_conflict"),
    consumptions: allocations
  });
  const journalReceipt = await writeOnlineWalletProviderAstrologerJournal(transaction, {
    journal,
    astrologerUserId: head.astrologerUserId,
    providerAccount: {
      versionId: captureIdentity.providerAccountVersionId,
      seriesId: refundCase.providerAccountSeriesId,
      providerAccountId: refundCase.providerAccountId,
      identityVersion: refundCase.providerIdentityVersion
    }
  });
  const mutationId = randomUUID();
  const nextWalletRevision = (BigInt(head.revision) + 1n).toString();
  const commitmentDigest = digestFinanceCanonicalValueV1({
    kind: "online_wallet_refund_terminal",
    version: 1,
    refundCaseId: refundCase.refundCaseId,
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    previousCommitmentDigest: head.lastCommitmentDigest,
    providerRefundId: command.providerRefundId,
    providerPaymentId: command.providerPaymentId,
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    consumptions: allocations
  });
  await transaction.insert(financeOnlineWalletMutations).values({
    mutationId,
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    operationKind: "refund_confirmed",
    previousCommitmentDigest: head.lastCommitmentDigest,
    commitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: new Date(command.occurredAt),
    committedAt: new Date(command.occurredAt)
  });
  await transaction.insert(financeOnlinePayableSourceConsumptions).values(
    allocations.map((allocation) => ({
      consumptionId: randomUUID(),
      mutationId,
      rootLotId: allocation.rootLotId,
      walletId: head.id,
      sourceKind: "allocation" as const,
      sourceAllocationId: allocation.refundPendingAllocationId,
      disposedMinor: String(allocation.amountMinor),
      dispositionKind: "refund_confirmed" as const
    }))
  );
  const [updatedHead] = await transaction
    .update(financeOnlineWalletHeads)
    .set({
      revision: nextWalletRevision,
      refundPendingMinor: (BigInt(head.refundPendingMinor) - BigInt(payableMinor)).toString(),
      lastCommitmentId: mutationId,
      lastCommitmentDigest: commitmentDigest
    })
    .where(
      and(
        eq(financeOnlineWalletHeads.id, head.id),
        eq(financeOnlineWalletHeads.revision, head.revision),
        eq(financeOnlineWalletHeads.lastCommitmentDigest, head.lastCommitmentDigest)
      )
    )
    .returning({ id: financeOnlineWalletHeads.id });
  if (!updatedHead) fail("wallet_conflict");

  const boundary = await issuePersistenceTransactionBoundaryRef(transaction);
  const applicationId = await insertApplication(transaction, {
    semanticReceipt,
    refundCase,
    command,
    walletRevision: nextWalletRevision,
    walletMutationId: mutationId,
    journalTransactionId: journalReceipt.journalTransactionId,
    boundary
  });
  const [updatedCase] = await transaction
    .update(financeOnlineWalletRefundCases)
    .set({
      status: "succeeded",
      version: "2",
      providerRefundId: command.providerRefundId,
      terminalApplicationId: applicationId,
      terminalAt: new Date(command.occurredAt),
      updatedAt: new Date(command.occurredAt)
    })
    .where(
      and(
        eq(financeOnlineWalletRefundCases.refundCaseId, refundCase.refundCaseId),
        eq(financeOnlineWalletRefundCases.status, "approved"),
        eq(financeOnlineWalletRefundCases.version, "1")
      )
    )
    .returning({ refundCaseId: financeOnlineWalletRefundCases.refundCaseId });
  if (!updatedCase) fail("refund_case_conflict");
  await transaction.insert(financeOnlineWalletRefundCaseTransitions).values({
    refundCaseId: refundCase.refundCaseId,
    version: "2",
    status: "succeeded",
    transitionKind: "provider_succeeded",
    authorityDigest: semanticReceipt.canonicalFactDigest,
    occurredAt: new Date(command.occurredAt),
    createdAt: new Date(command.occurredAt)
  });
  return Object.freeze({
    effect: "applied_once",
    refundCaseId: refundCase.refundCaseId,
    walletId: head.id,
    walletRevision: nextWalletRevision
  });
}

function assertSemanticReceipt(
  receipt: WebhookSemanticCommitReceipt,
  command: NormalizedCommand
): void {
  if (
    (receipt.businessEffect !== "applied_once" && receipt.businessEffect !== "semantic_replay") ||
    receipt.semanticSourceKind !== "refund" ||
    receipt.semanticSourceId !== command.providerRefundId ||
    receipt.purpose !== "client_order" ||
    receipt.economicPaymentSessionId !== null ||
    receipt.providerPaymentId !== null ||
    receipt.amountMinor !== null ||
    receipt.currency !== null
  ) {
    fail("semantic_refund_conflict");
  }
}

function assertCaseIdentity(
  refundCase: RefundCase,
  receipt: WebhookSemanticCommitReceipt,
  command: NormalizedCommand
): void {
  if (
    refundCase.providerPaymentId !== command.providerPaymentId ||
    refundCase.previousCumulativeRefundedMinor !== String(command.previousCumulativeRefundedMinor) ||
    refundCase.approvedCumulativeRefundedMinor !== String(command.cumulativeRefundedMinor) ||
    refundCase.refundDeltaMinor !==
      String(command.cumulativeRefundedMinor - command.previousCumulativeRefundedMinor) ||
    refundCase.economicPaymentIntentId !== receipt.economicPaymentIntentId ||
    refundCase.providerAccountSeriesId !== receipt.providerAccount.seriesId ||
    refundCase.providerAccountId !== receipt.providerAccount.providerAccountId ||
    refundCase.providerIdentityVersion !== receipt.providerAccount.identityVersion
  ) {
    fail("refund_case_conflict");
  }
}

async function lockExactPendingAllocations(
  transaction: FinanceTransaction,
  refundCase: RefundCase
): Promise<readonly PendingAllocation[]> {
  const allocations = await transaction
    .select()
    .from(financeOnlineWalletRefundCaseAllocations)
    .where(eq(financeOnlineWalletRefundCaseAllocations.refundCaseId, refundCase.refundCaseId))
    .orderBy(financeOnlineWalletRefundCaseAllocations.ordinal)
    .for("share");
  if (allocations.length === 0) fail("refund_pending_allocation_conflict");
  const resolved: PendingAllocation[] = [];
  for (const expected of allocations) {
    const [actual] = await transaction
      .select()
      .from(financeOnlinePayableSourceAllocations)
      .where(
        and(
          eq(
            financeOnlinePayableSourceAllocations.allocationId,
            expected.refundPendingAllocationId
          ),
          eq(financeOnlinePayableSourceAllocations.walletId, refundCase.walletId)
        )
      )
      .limit(2)
      .for("update");
    if (
      !actual ||
      actual.rootLotId !== expected.rootLotId ||
      actual.bucket !== "refund_pending" ||
      actual.amountMinor !== expected.amountMinor
    ) {
      fail("refund_pending_allocation_conflict");
    }
    const consumed = await transaction
      .select({ id: financeOnlinePayableSourceConsumptions.consumptionId })
      .from(financeOnlinePayableSourceConsumptions)
      .where(
        and(
          eq(
            financeOnlinePayableSourceConsumptions.sourceAllocationId,
            expected.refundPendingAllocationId
          ),
          eq(financeOnlinePayableSourceConsumptions.sourceKind, "allocation")
        )
      )
      .limit(1)
      .for("share");
    if (consumed.length > 0) fail("refund_pending_allocation_conflict");
    resolved.push(
      Object.freeze({
        refundPendingAllocationId: expected.refundPendingAllocationId,
        rootLotId: expected.rootLotId,
        amountMinor: positiveMinor(expected.amountMinor, "refund_pending_allocation_conflict")
      })
    );
  }
  return Object.freeze(resolved);
}

async function insertApplication(
  transaction: FinanceTransaction,
  input: Readonly<{
    semanticReceipt: WebhookSemanticCommitReceipt;
    refundCase: RefundCase;
    command: NormalizedCommand;
    walletRevision: string;
    walletMutationId: string;
    journalTransactionId: string;
    boundary: string;
  }>
): Promise<string> {
  const canonical = {
    kind: "online_wallet_refund_terminal_application",
    version: 1,
    semanticCommitReceiptId: input.semanticReceipt.receiptId,
    semanticFactId: input.semanticReceipt.semanticFactId,
    refundCaseId: input.refundCase.refundCaseId,
    providerAccount: input.semanticReceipt.providerAccount,
    providerRefundId: input.command.providerRefundId,
    providerPaymentId: input.command.providerPaymentId,
    captureApplicationId: input.refundCase.captureApplicationId,
    rootLotId: input.refundCase.rootLotId,
    walletId: input.refundCase.walletId,
    walletRevision: input.walletRevision,
    mutationId: input.walletMutationId,
    journalTransactionId: input.journalTransactionId,
    previousRefundedMinor: String(input.command.previousCumulativeRefundedMinor),
    cumulativeRefundedMinor: String(input.command.cumulativeRefundedMinor),
    refundDeltaMinor: input.refundCase.refundDeltaMinor,
    commissionReversalMinor: input.refundCase.commissionReversalMinor,
    payableReversalMinor: input.refundCase.payableReservationMinor,
    occurredAt: input.command.occurredAt,
    persistenceTransactionBoundaryRef: input.boundary
  };
  const [application] = await transaction
    .insert(financeOnlineWalletRefundApplications)
    .values({
      semanticCommitReceiptId: input.semanticReceipt.receiptId,
      semanticFactId: input.semanticReceipt.semanticFactId,
      providerAccountSeriesId: input.refundCase.providerAccountSeriesId,
      providerAccountId: input.refundCase.providerAccountId,
      providerIdentityVersion: input.refundCase.providerIdentityVersion,
      providerRefundId: input.command.providerRefundId,
      providerPaymentId: input.command.providerPaymentId,
      captureApplicationId: input.refundCase.captureApplicationId,
      rootLotId: input.refundCase.rootLotId,
      walletId: input.refundCase.walletId,
      walletRevision: input.walletRevision,
      outcome: "applied",
      walletMutationId: input.walletMutationId,
      journalTransactionId: input.journalTransactionId,
      previousRefundedMinor: String(input.command.previousCumulativeRefundedMinor),
      cumulativeRefundedMinor: String(input.command.cumulativeRefundedMinor),
      refundDeltaMinor: input.refundCase.refundDeltaMinor,
      commissionReversalMinor: input.refundCase.commissionReversalMinor,
      payableReversalMinor: input.refundCase.payableReservationMinor,
      blockedPayoutOutcomeMinor: "0",
      canonicalPreimage: JSON.stringify(canonical),
      canonicalDigest: digestFinanceCanonicalValueV1(canonical),
      persistenceTransactionBoundaryRef: input.boundary,
      occurredAt: new Date(input.command.occurredAt),
      committedAt: new Date(input.command.occurredAt)
    })
    .returning({ id: financeOnlineWalletRefundApplications.id });
  if (!application) fail("persistence_write_incomplete");
  return application.id;
}

async function replayTerminal(
  transaction: FinanceTransaction,
  refundCase: RefundCase,
  command: NormalizedCommand
): Promise<Readonly<{
  effect: "semantic_replay";
  refundCaseId: string;
  walletId: string;
  walletRevision: string;
}>> {
  if (
    refundCase.status !== "succeeded" ||
    refundCase.version !== "2" ||
    refundCase.providerRefundId !== command.providerRefundId ||
    !refundCase.terminalApplicationId
  ) {
    fail("refund_case_not_approved");
  }
  const [application] = await transaction
    .select()
    .from(financeOnlineWalletRefundApplications)
    .where(eq(financeOnlineWalletRefundApplications.id, refundCase.terminalApplicationId))
    .limit(2)
    .for("share");
  if (
    !application ||
    application.walletId !== refundCase.walletId ||
    application.providerRefundId !== command.providerRefundId ||
    application.providerPaymentId !== command.providerPaymentId ||
    application.previousRefundedMinor !== String(command.previousCumulativeRefundedMinor) ||
    application.cumulativeRefundedMinor !== String(command.cumulativeRefundedMinor) ||
    application.outcome !== "applied"
  ) {
    fail("terminal_replay_conflict");
  }
  return Object.freeze({
    effect: "semantic_replay",
    refundCaseId: refundCase.refundCaseId,
    walletId: refundCase.walletId,
    walletRevision: application.walletRevision
  });
}

async function lockCaseCaptureIdentity(
  transaction: FinanceTransaction,
  refundCase: RefundCase
): Promise<Readonly<{ orderId: string; providerAccountVersionId: string }>> {
  const [row] = await transaction
    .select({
      orderId: financeOnlineSaleCaptureReceipts.orderId,
      rootLotId: financeOnlineSaleCaptureReceipts.rootLotId,
      walletId: financeOnlineSaleCaptureApplications.onlineWalletId,
      providerAccountSeriesId: financeOnlineSaleCaptureApplications.providerAccountSeriesId,
      providerAccountId: financeOnlineSaleCaptureApplications.providerAccountId,
      providerIdentityVersion: financeOnlineSaleCaptureApplications.providerIdentityVersion,
      providerAccountVersionId: financeProviderAccounts.id
    })
    .from(financeOnlineSaleCaptureApplications)
    .innerJoin(
      financeOnlineSaleCaptureReceipts,
      eq(
        financeOnlineSaleCaptureReceipts.receiptId,
        financeOnlineSaleCaptureApplications.onlineSaleReceiptId
      )
    )
    .innerJoin(
      financeProviderAccounts,
      and(
        eq(
          financeProviderAccounts.seriesId,
          financeOnlineSaleCaptureApplications.providerAccountSeriesId
        ),
        eq(
          financeProviderAccounts.providerAccountId,
          financeOnlineSaleCaptureApplications.providerAccountId
        ),
        eq(
          financeProviderAccounts.identityVersion,
          financeOnlineSaleCaptureApplications.providerIdentityVersion
        )
      )
    )
    .where(eq(financeOnlineSaleCaptureApplications.id, refundCase.captureApplicationId))
    .limit(2)
    .for("share");
  if (
    !row ||
    row.rootLotId !== refundCase.rootLotId ||
    row.walletId !== refundCase.walletId ||
    row.providerAccountSeriesId !== refundCase.providerAccountSeriesId ||
    row.providerAccountId !== refundCase.providerAccountId ||
    row.providerIdentityVersion !== refundCase.providerIdentityVersion
  ) {
    fail("refund_case_conflict");
  }
  return Object.freeze({
    orderId: identifier(row.orderId, "refund_case_conflict"),
    providerAccountVersionId: identifier(row.providerAccountVersionId, "refund_case_conflict")
  });
}

function identifier(value: unknown, reason: OnlineWalletRefundTerminalPersistenceReason): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || value.trim() !== value) {
    fail(reason);
  }
  return value;
}

function positiveMinor(value: unknown, reason: OnlineWalletRefundTerminalPersistenceReason): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(reason);
  return parsed;
}

function nonNegativeMinor(value: unknown, reason: OnlineWalletRefundTerminalPersistenceReason): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(reason);
  return parsed;
}

function instant(value: unknown, reason: OnlineWalletRefundTerminalPersistenceReason): string {
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) fail(reason);
  return new Date(value).toISOString();
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: OnlineWalletRefundTerminalPersistenceReason): never {
  throw new OnlineWalletRefundTerminalPersistenceError(reason);
}
