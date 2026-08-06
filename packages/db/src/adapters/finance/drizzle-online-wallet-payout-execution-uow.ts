import { randomUUID } from "node:crypto";

import {
  createOnlineWalletPayoutPaidJournal,
  createOnlineWalletPayoutStateTransitionPlan,
  digestFinanceCanonicalValueV1,
  type ConfirmOnlineWalletPayoutPaidCommand,
  type OnlineWalletPayoutExecutionUnitOfWork,
  type OnlineWalletPayoutManualExecutionCommitReceipt,
  type OnlineWalletPayoutPaidCommitReceipt,
  type StartOnlineWalletPayoutManualExecutionCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import {
  financeBankExposureHistory,
  financeBankExposures
} from "../../schema/finance/bank-liquidity.schema";
import {
  financeOnlinePayoutApprovalReceipts,
  financeOnlinePayoutExecutionReceipts,
  financeOnlinePayoutPaidReceipts,
  financeOnlinePayoutRequests,
  financeOnlinePayoutStateTransitions
} from "../../schema/finance/online-payouts.schema";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import {
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletMutations
} from "../../schema/finance/online-wallet-mutations.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import { payoutMethods } from "../../schema/finance/payouts.schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletManualPayoutPaidJournal } from "./drizzle-online-wallet-journal-writer";

export class OnlineWalletPayoutExecutionPersistenceError extends Error {
  readonly code = "online_wallet_payout_execution_persistence_error";

  constructor(
    readonly reason:
      | "invalid_command"
      | "payout_not_found"
      | "payout_version_conflict"
      | "payout_transition_invalid"
      | "payout_destination_changed"
      | "maker_checker_violation"
      | "approval_missing"
      | "approval_binding_invalid"
      | "bank_exposure_conflict"
      | "evidence_artifact_invalid"
      | "payout_paid_sources_invalid"
      | "wallet_commit_conflict"
      | "authority_replay_conflict"
      | "persistence_write_incomplete"
      | "retryable_concurrency_conflict",
    options?: ErrorOptions
  ) {
    super("Online wallet manual payout execution could not be persisted atomically", options);
    this.name = "OnlineWalletPayoutExecutionPersistenceError";
  }
}

type ExecutionCommand = StartOnlineWalletPayoutManualExecutionCommand &
  Readonly<{ occurredAtDate: Date; executionTransitionId: string; executionReceiptId: string }>;
type PaidCommand = ConfirmOnlineWalletPayoutPaidCommand &
  Readonly<{ occurredAtDate: Date; transferredAtDate: Date; paidTransitionId: string; paidReceiptId: string }>;
type PendingSource = Readonly<{
  payoutPendingAllocationId: string;
  rootLotId: string;
  orderId: string;
  amountMinor: string;
}>;

/**
 * The V2 manual-bank contour keeps the irreversible transfer proof separate from both approval
 * and eventual statement reconciliation. Every operation is idempotent on its consumed authority
 * triple; neither path mutates `bank_cash`.
 */
export function createDrizzleOnlineWalletPayoutExecutionUnitOfWork(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutExecutionUnitOfWork {
  return Object.freeze({
    async startOnlineWalletPayoutManualExecution(command) {
      const normalized = normalizeExecution(command);
      try {
        return await input.database.transaction((transaction) => persistExecution(transaction, normalized));
      } catch (error) {
        throwMapped(error);
      }
    },
    async confirmOnlineWalletPayoutPaid(command) {
      const normalized = normalizePaid(command);
      try {
        return await input.database.transaction((transaction) => persistPaid(transaction, normalized));
      } catch (error) {
        throwMapped(error);
      }
    }
  } satisfies OnlineWalletPayoutExecutionUnitOfWork);
}

function normalizeExecution(command: StartOnlineWalletPayoutManualExecutionCommand): ExecutionCommand {
  if (
    !identifier(command.payoutRequestId, 160) ||
    !positiveRevision(command.expectedPayoutVersion) ||
    !positiveRevision(command.expectedBankExposureVersion) ||
    !approvalRef(command.approval) ||
    !uuid(command.executorActorUserId) ||
    !authority(command.authority) ||
    !instant(command.occurredAt)
  ) {
    fail("invalid_command");
  }
  return Object.freeze({
    ...command,
    occurredAtDate: new Date(command.occurredAt),
    executionTransitionId: randomUUID(),
    executionReceiptId: randomUUID()
  });
}

function normalizePaid(command: ConfirmOnlineWalletPayoutPaidCommand): PaidCommand {
  if (
    !identifier(command.payoutRequestId, 160) ||
    !positiveRevision(command.expectedPayoutVersion) ||
    !positiveRevision(command.expectedWalletRevision) ||
    !positiveRevision(command.expectedBankExposureVersion) ||
    !approvalRef(command.approval) ||
    !identifier(command.bankReference, 240) ||
    !identifier(command.evidenceArtifactId, 160) ||
    !digest(command.evidenceArtifactDigest) ||
    !uuid(command.confirmerActorUserId) ||
    !authority(command.authority) ||
    !instant(command.transferredAt) ||
    !instant(command.occurredAt)
  ) {
    fail("invalid_command");
  }
  const occurredAtDate = new Date(command.occurredAt);
  const transferredAtDate = new Date(command.transferredAt);
  if (transferredAtDate.getTime() > occurredAtDate.getTime()) fail("invalid_command");
  return Object.freeze({
    ...command,
    occurredAtDate,
    transferredAtDate,
    paidTransitionId: randomUUID(),
    paidReceiptId: randomUUID()
  });
}

async function persistExecution(
  transaction: FinanceTransaction,
  command: ExecutionCommand
): Promise<OnlineWalletPayoutManualExecutionCommitReceipt> {
  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("update");
  if (!payout) fail("payout_not_found");
  const replay = await readExecutionReplay(transaction, command, payout);
  if (replay) return replay;
  if (payout.version !== command.expectedPayoutVersion) fail("payout_version_conflict");
  if (payout.status !== "approved") fail("payout_transition_invalid");
  if (payout.astrologerUserId === command.executorActorUserId) fail("maker_checker_violation");

  const approval = await lockApproval(transaction, command.approval, payout.id, payout.version);
  await assertCurrentDestination(transaction, payout);
  if (approval.approverActorUserId === command.executorActorUserId) fail("maker_checker_violation");

  const exposure = await lockExposure(
    transaction,
    approval,
    payout.id,
    command.expectedBankExposureVersion,
    "committed"
  );
  const statePlan = transitionPlan(payout.id, payout.status, payout.version, "processing_manual");
  const exposureHistory = await lockExposureHistory(transaction, exposure.exposureId, exposure.version);
  const nextExposureVersion = (BigInt(exposure.version) + 1n).toString();
  const boundary = await transactionBoundary(transaction);
  const executionCanonical = {
    kind: "online_wallet_payout_manual_execution_commit_receipt",
    version: 1,
    receiptId: command.executionReceiptId,
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    executionTransitionId: command.executionTransitionId,
    approvalReceipt: { receiptId: approval.receiptId, canonicalDigest: approval.canonicalDigest },
    bankExposureId: exposure.exposureId,
    bankExposureVersion: nextExposureVersion,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency,
    executorActorUserId: command.executorActorUserId,
    authorization: command.authority,
    persistenceTransactionBoundaryRef: boundary,
    initiatedAt: command.occurredAt
  } as const;
  const canonicalDigest = digestFinanceCanonicalValueV1(executionCanonical);

  const [updatedExposure] = await transaction
    .update(financeBankExposures)
    .set({ state: "initiated_unreflected", version: nextExposureVersion, updatedAt: command.occurredAtDate })
    .where(
      and(
        eq(financeBankExposures.exposureId, exposure.exposureId),
        eq(financeBankExposures.version, exposure.version),
        eq(financeBankExposures.state, "committed")
      )
    )
    .returning({ exposureId: financeBankExposures.exposureId });
  if (!updatedExposure) fail("bank_exposure_conflict");
  await transaction.insert(financeBankExposureHistory).values({
    previousHistoryId: exposureHistory.historyId,
    exposureId: exposure.exposureId,
    payoutRequestId: payout.id,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency,
    amountMinor: payout.immutableAmountMinor,
    version: nextExposureVersion,
    previousState: "committed",
    state: "initiated_unreflected",
    transitionKind: "bank_work_initiated",
    transitionAuthorityKind: "online_wallet_payout_execution_receipt",
    transitionAuthorityId: command.executionReceiptId,
    transitionAuthorityVersion: 1,
    transitionAuthorityDigest: canonicalDigest,
    bankStatementEntryId: null,
    occurredAt: command.occurredAtDate
  });
  await appendPayoutTransition(transaction, {
    transitionId: command.executionTransitionId,
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    previousStatus: "approved",
    status: "processing_manual",
    actorUserId: command.executorActorUserId,
    authority: command.authority,
    occurredAt: command.occurredAtDate
  });
  await updatePayoutHead(transaction, payout.id, statePlan, command.occurredAtDate);
  await transaction.insert(financeOnlinePayoutExecutionReceipts).values({
    receiptId: command.executionReceiptId,
    receiptVersion: 1,
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    executionTransitionId: command.executionTransitionId,
    approvalReceiptId: approval.receiptId,
    bankExposureId: exposure.exposureId,
    bankExposureVersion: nextExposureVersion,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency,
    executorActorUserId: command.executorActorUserId,
    authorizationId: command.authority.authorityId,
    authorizationVersion: command.authority.authorityVersion,
    authorizationDigest: command.authority.authorityDigest,
    persistenceTransactionBoundaryRef: boundary,
    canonicalPreimage: JSON.stringify(executionCanonical),
    canonicalDigest,
    initiatedAt: command.occurredAtDate
  });
  return Object.freeze({
    kind: "online_wallet_payout_manual_execution_commit_receipt",
    effect: "applied_once",
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    bankExposureId: exposure.exposureId,
    bankExposureVersion: nextExposureVersion,
    state: "processing_manual",
    persistenceTransactionBoundaryRef: boundary
  }) as OnlineWalletPayoutManualExecutionCommitReceipt;
}

async function persistPaid(
  transaction: FinanceTransaction,
  command: PaidCommand
): Promise<OnlineWalletPayoutPaidCommitReceipt> {
  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("update");
  if (!payout) fail("payout_not_found");
  const replay = await readPaidReplay(transaction, command, payout);
  if (replay) return replay;
  if (payout.version !== command.expectedPayoutVersion) fail("payout_version_conflict");
  if (payout.status !== "processing_manual") fail("payout_transition_invalid");
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${payout.walletId}, 0))`);
  const [head] = await transaction
    .select()
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, payout.walletId))
    .limit(2)
    .for("update");
  if (
    !head ||
    head.astrologerUserId !== payout.astrologerUserId ||
    head.currency !== "RUB" ||
    head.revision !== command.expectedWalletRevision ||
    !head.lastCommitmentDigest
  ) {
    fail("wallet_commit_conflict");
  }

  const approval = await lockApproval(transaction, command.approval, payout.id, undefined);
  if (approval.currency !== "RUB") fail("approval_binding_invalid");
  const execution = await lockExecutionReceipt(transaction, payout.id, approval.receiptId);
  if (
    execution.payoutVersion !== payout.version ||
    execution.executorActorUserId === command.confirmerActorUserId ||
    approval.approverActorUserId === command.confirmerActorUserId
  ) {
    fail("maker_checker_violation");
  }
  const exposure = await lockExposure(
    transaction,
    approval,
    payout.id,
    command.expectedBankExposureVersion,
    "initiated_unreflected"
  );
  if (execution.bankExposureId !== exposure.exposureId || execution.bankExposureVersion !== exposure.version) {
    fail("approval_binding_invalid");
  }
  const evidence = await lockBankTransferEvidence(transaction, {
    artifactId: command.evidenceArtifactId,
    expectedDigest: command.evidenceArtifactDigest,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency
  });
  const sources = await readPendingSources(transaction, payout.id, payout.walletId);
  const total = sources.reduce((sum, source) => sum + BigInt(source.amountMinor), 0n);
  if (total <= 0n || total !== BigInt(payout.immutableAmountMinor)) fail("payout_paid_sources_invalid");
  const statePlan = transitionPlan(payout.id, payout.status, payout.version, "paid");
  const journal = createOnlineWalletPayoutPaidJournal({
    payoutRequestId: payout.id,
    astrologerUserId: payout.astrologerUserId,
    bankCashPoolId: approval.bankCashPoolId,
    occurredAt: command.transferredAt,
    postedAt: command.occurredAt,
    pendingSources: sources.map((source) => ({ ...source, amountMinor: safePositiveMinor(source.amountMinor) }))
  });
  const journalReceipt = await writeOnlineWalletManualPayoutPaidJournal(transaction, {
    journal,
    astrologerUserId: payout.astrologerUserId,
    bankCashPoolId: approval.bankCashPoolId
  });
  const mutationId = randomUUID();
  const nextWalletRevision = (BigInt(head.revision) + 1n).toString();
  const commitmentDigest = digestFinanceCanonicalValueV1({
    kind: "online_wallet_mutation",
    version: 2,
    mutationId,
    operationKind: "payout_paid",
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    previousCommitmentDigest: head.lastCommitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    payoutRequestId: payout.id,
    sourceAllocationIds: sources.map((source) => source.payoutPendingAllocationId)
  });
  await transaction.insert(financeOnlineWalletMutations).values({
    mutationId,
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    operationKind: "payout_paid",
    previousCommitmentDigest: head.lastCommitmentDigest,
    commitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: command.transferredAtDate,
    committedAt: command.occurredAtDate
  });
  await transaction.insert(financeOnlinePayableSourceConsumptions).values(
    sources.map((source) => ({
      consumptionId: randomUUID(),
      mutationId,
      rootLotId: source.rootLotId,
      walletId: head.id,
      sourceKind: "allocation" as const,
      sourceAllocationId: source.payoutPendingAllocationId,
      disposedMinor: source.amountMinor,
      dispositionKind: "payout_paid" as const
    }))
  );
  const exposureHistory = await lockExposureHistory(transaction, exposure.exposureId, exposure.version);
  const nextExposureVersion = (BigInt(exposure.version) + 1n).toString();
  const boundary = await transactionBoundary(transaction);
  const paidCanonical = {
    kind: "online_wallet_payout_paid_receipt",
    version: 1,
    receiptId: command.paidReceiptId,
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    paidTransitionId: command.paidTransitionId,
    executionReceiptId: execution.receiptId,
    approvalReceipt: { receiptId: approval.receiptId, canonicalDigest: approval.canonicalDigest },
    walletId: head.id,
    walletRevision: nextWalletRevision,
    walletMutationId: mutationId,
    journalTransactionId: journalReceipt.journalTransactionId,
    bankExposureId: exposure.exposureId,
    bankExposureVersion: nextExposureVersion,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency,
    bankReference: command.bankReference,
    transferredAt: command.transferredAt,
    evidenceArtifact: { artifactId: command.evidenceArtifactId, sha256Digest: command.evidenceArtifactDigest },
    confirmerActorUserId: command.confirmerActorUserId,
    authorization: command.authority,
    persistenceTransactionBoundaryRef: boundary,
    confirmedAt: command.occurredAt
  } as const;
  const canonicalDigest = digestFinanceCanonicalValueV1(paidCanonical);

  const [updatedExposure] = await transaction
    .update(financeBankExposures)
    .set({ state: "paid_unreflected", version: nextExposureVersion, updatedAt: command.occurredAtDate })
    .where(
      and(
        eq(financeBankExposures.exposureId, exposure.exposureId),
        eq(financeBankExposures.version, exposure.version),
        eq(financeBankExposures.state, "initiated_unreflected")
      )
    )
    .returning({ exposureId: financeBankExposures.exposureId });
  if (!updatedExposure) fail("bank_exposure_conflict");
  await transaction.insert(financeBankExposureHistory).values({
    previousHistoryId: exposureHistory.historyId,
    exposureId: exposure.exposureId,
    payoutRequestId: payout.id,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency,
    amountMinor: payout.immutableAmountMinor,
    version: nextExposureVersion,
    previousState: "initiated_unreflected",
    state: "paid_unreflected",
    transitionKind: "paid_proven",
    transitionAuthorityKind: "online_wallet_payout_paid_receipt",
    transitionAuthorityId: command.paidReceiptId,
    transitionAuthorityVersion: 1,
    transitionAuthorityDigest: canonicalDigest,
    bankStatementEntryId: null,
    occurredAt: command.occurredAtDate
  });
  await appendPayoutTransition(transaction, {
    transitionId: command.paidTransitionId,
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    previousStatus: "processing_manual",
    status: "paid",
    actorUserId: command.confirmerActorUserId,
    authority: command.authority,
    occurredAt: command.occurredAtDate
  });
  await updatePayoutHead(transaction, payout.id, statePlan, command.occurredAtDate);
  const [updatedHead] = await transaction
    .update(financeOnlineWalletHeads)
    .set({
      revision: nextWalletRevision,
      payoutPendingMinor: (BigInt(head.payoutPendingMinor) - total).toString(),
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
  if (!updatedHead) fail("wallet_commit_conflict");
  await transaction.insert(financeOnlinePayoutPaidReceipts).values({
    receiptId: command.paidReceiptId,
    receiptVersion: 1,
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    paidTransitionId: command.paidTransitionId,
    executionReceiptId: execution.receiptId,
    walletId: head.id,
    walletRevision: nextWalletRevision,
    walletMutationId: mutationId,
    journalTransactionId: journalReceipt.journalTransactionId,
    approvalReceiptId: approval.receiptId,
    bankExposureId: exposure.exposureId,
    bankExposureVersion: nextExposureVersion,
    bankCashPoolId: approval.bankCashPoolId,
    currency: approval.currency,
    bankReference: command.bankReference,
    transferredAt: command.transferredAtDate,
    evidenceArtifactId: command.evidenceArtifactId,
    evidenceArtifactDigest: evidence.sha256Digest,
    confirmerActorUserId: command.confirmerActorUserId,
    authorizationId: command.authority.authorityId,
    authorizationVersion: command.authority.authorityVersion,
    authorizationDigest: command.authority.authorityDigest,
    persistenceTransactionBoundaryRef: boundary,
    canonicalPreimage: JSON.stringify(paidCanonical),
    canonicalDigest,
    confirmedAt: command.occurredAtDate
  });
  return Object.freeze({
    ref: Object.freeze({
      kind: "online_wallet_payout_paid_receipt",
      receiptId: command.paidReceiptId,
      version: 1,
      canonicalDigest
    }),
    kind: "online_wallet_payout_paid_commit_receipt",
    effect: "applied_once",
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    walletId: head.id,
    walletRevision: nextWalletRevision,
    walletMutationId: mutationId,
    journalTransactionId: journalReceipt.journalTransactionId,
    bankExposureId: exposure.exposureId,
    bankExposureVersion: nextExposureVersion,
    bankExposureState: "paid_unreflected",
    persistenceTransactionBoundaryRef: boundary
  }) as OnlineWalletPayoutPaidCommitReceipt;
}

async function lockApproval(
  transaction: FinanceTransaction,
  approval: StartOnlineWalletPayoutManualExecutionCommand["approval"],
  payoutRequestId: string,
  payoutVersion: string | undefined
) {
  const [row] = await transaction
    .select()
    .from(financeOnlinePayoutApprovalReceipts)
    .where(
      and(
        eq(financeOnlinePayoutApprovalReceipts.receiptId, approval.receiptId),
        eq(financeOnlinePayoutApprovalReceipts.canonicalDigest, approval.canonicalDigest),
        eq(financeOnlinePayoutApprovalReceipts.payoutRequestId, payoutRequestId)
      )
    )
    .limit(2)
    .for("share");
  if (!row) fail("approval_missing");
  if ((payoutVersion !== undefined && row.payoutVersion !== payoutVersion) || row.currency !== "RUB") {
    fail("approval_binding_invalid");
  }
  return row;
}

async function assertCurrentDestination(
  transaction: FinanceTransaction,
  payout: typeof financeOnlinePayoutRequests.$inferSelect
): Promise<void> {
  const [method] = await transaction
    .select()
    .from(payoutMethods)
    .where(
      and(
        eq(payoutMethods.id, payout.payoutMethodId),
        eq(payoutMethods.astrologerUserId, payout.astrologerUserId),
        eq(payoutMethods.currency, payout.currency)
      )
    )
    .limit(2)
    .for("share");
  if (!method || method.version !== String(payout.payoutMethodVersion)) fail("payout_destination_changed");
}

async function lockExposure(
  transaction: FinanceTransaction,
  approval: typeof financeOnlinePayoutApprovalReceipts.$inferSelect,
  payoutRequestId: string,
  expectedVersion: string,
  expectedState: "committed" | "initiated_unreflected"
) {
  const [row] = await transaction
    .select()
    .from(financeBankExposures)
    .where(eq(financeBankExposures.exposureId, approval.bankExposureId))
    .limit(2)
    .for("update");
  if (!row) fail("bank_exposure_conflict");
  if (
    row.payoutRequestId !== payoutRequestId ||
    row.bankCashPoolId !== approval.bankCashPoolId ||
    row.currency !== approval.currency ||
    row.version !== expectedVersion ||
    row.state !== expectedState
  ) {
    fail("bank_exposure_conflict");
  }
  return row;
}

async function lockExposureHistory(
  transaction: FinanceTransaction,
  exposureId: string,
  version: string
) {
  const [row] = await transaction
    .select()
    .from(financeBankExposureHistory)
    .where(
      and(
        eq(financeBankExposureHistory.exposureId, exposureId),
        eq(financeBankExposureHistory.version, version)
      )
    )
    .limit(2)
    .for("share");
  if (!row) fail("bank_exposure_conflict");
  return row;
}

async function lockBankTransferEvidence(
  transaction: FinanceTransaction,
  input: Readonly<{
    artifactId: string;
    expectedDigest: string;
    bankCashPoolId: string;
    currency: "RUB";
  }>
) {
  const [artifact] = await transaction
    .select()
    .from(financeArtifacts)
    .where(eq(financeArtifacts.id, input.artifactId))
    .limit(2)
    .for("share");
  if (
    !artifact ||
    artifact.artifactClass !== "bank_transfer_evidence" ||
    artifact.bindingKind !== "bank_cash_pool" ||
    artifact.bankCashPoolId !== input.bankCashPoolId ||
    artifact.currency !== input.currency ||
    artifact.sha256Digest !== input.expectedDigest
  ) {
    fail("evidence_artifact_invalid");
  }
  return artifact;
}

async function lockExecutionReceipt(
  transaction: FinanceTransaction,
  payoutRequestId: string,
  approvalReceiptId: string
) {
  const [row] = await transaction
    .select()
    .from(financeOnlinePayoutExecutionReceipts)
    .where(
      and(
        eq(financeOnlinePayoutExecutionReceipts.payoutRequestId, payoutRequestId),
        eq(financeOnlinePayoutExecutionReceipts.approvalReceiptId, approvalReceiptId)
      )
    )
    .limit(2)
    .for("share");
  if (!row) fail("approval_binding_invalid");
  return row;
}

async function readPendingSources(
  transaction: FinanceTransaction,
  payoutRequestId: string,
  walletId: string
): Promise<readonly PendingSource[]> {
  const rows = await transaction.execute<PendingSource>(sql`
    select mapping.payout_pending_allocation_id as "payoutPendingAllocationId",
           mapping.root_lot_id as "rootLotId", pending.amount_minor::text as "amountMinor",
           receipt.order_id as "orderId"
      from finance_online_payout_request_allocations mapping
      join finance_online_payable_source_allocations pending
        on pending.allocation_id = mapping.payout_pending_allocation_id
      join finance_online_sale_capture_root_lots root on root.lot_id = mapping.root_lot_id
      join finance_online_sale_capture_receipts receipt on receipt.receipt_id = root.receipt_id
     where mapping.payout_request_id = ${payoutRequestId}
       and pending.wallet_id = ${walletId}
       and pending.bucket = 'payout_pending'
       and pending.return_bucket = 'available'
       and not exists (
         select 1 from finance_online_payable_source_consumptions consumption
          where consumption.source_kind = 'allocation'
            and consumption.source_allocation_id = pending.allocation_id
       )
     order by mapping.ordinal
     for update of pending
  `);
  return Object.freeze(rows.rows.map((row) => Object.freeze(row)));
}

async function appendPayoutTransition(
  transaction: FinanceTransaction,
  input: Readonly<{
    transitionId: string;
    payoutRequestId: string;
    payoutVersion: string;
    previousStatus: "approved" | "processing_manual";
    status: "processing_manual" | "paid";
    actorUserId: string;
    authority: StartOnlineWalletPayoutManualExecutionCommand["authority"];
    occurredAt: Date;
  }>
): Promise<void> {
  await transaction.insert(financeOnlinePayoutStateTransitions).values({
    transitionId: input.transitionId,
    payoutRequestId: input.payoutRequestId,
    payoutVersion: input.payoutVersion,
    previousStatus: input.previousStatus,
    status: input.status,
    transitionKind: input.status,
    actorKind: "user",
    actorUserId: input.actorUserId,
    authorityId: input.authority.authorityId,
    authorityVersion: input.authority.authorityVersion,
    authorityDigest: input.authority.authorityDigest,
    adminNote: null,
    failureReason: null,
    occurredAt: input.occurredAt,
    createdAt: input.occurredAt
  });
}

async function updatePayoutHead(
  transaction: FinanceTransaction,
  payoutRequestId: string,
  statePlan: ReturnType<typeof createOnlineWalletPayoutStateTransitionPlan>,
  occurredAt: Date
): Promise<void> {
  const [updated] = await transaction
    .update(financeOnlinePayoutRequests)
    .set({ status: statePlan.nextStatus, version: statePlan.nextVersion, updatedAt: occurredAt })
    .where(
      and(
        eq(financeOnlinePayoutRequests.id, payoutRequestId),
        eq(financeOnlinePayoutRequests.status, statePlan.previousStatus),
        eq(financeOnlinePayoutRequests.version, statePlan.expectedVersion)
      )
    )
    .returning({ id: financeOnlinePayoutRequests.id });
  if (!updated) fail("payout_version_conflict");
}

function transitionPlan(
  payoutRequestId: string,
  previousStatus: string,
  expectedVersion: string,
  nextStatus: "processing_manual" | "paid"
) {
  try {
    return createOnlineWalletPayoutStateTransitionPlan({
      payoutRequestId,
      previousStatus: previousStatus as Parameters<typeof createOnlineWalletPayoutStateTransitionPlan>[0]["previousStatus"],
      expectedVersion,
      nextStatus
    });
  } catch {
    fail("payout_transition_invalid");
  }
}

async function readExecutionReplay(
  transaction: FinanceTransaction,
  command: ExecutionCommand,
  payout: typeof financeOnlinePayoutRequests.$inferSelect
): Promise<OnlineWalletPayoutManualExecutionCommitReceipt | null> {
  const [receipt] = await transaction
    .select()
    .from(financeOnlinePayoutExecutionReceipts)
    .where(
      and(
        eq(financeOnlinePayoutExecutionReceipts.authorizationId, command.authority.authorityId),
        eq(financeOnlinePayoutExecutionReceipts.authorizationVersion, command.authority.authorityVersion),
        eq(financeOnlinePayoutExecutionReceipts.authorizationDigest, command.authority.authorityDigest)
      )
    )
    .limit(2)
    .for("share");
  if (!receipt) return null;
  if (
    receipt.payoutRequestId !== payout.id ||
    receipt.payoutVersion !== (BigInt(command.expectedPayoutVersion) + 1n).toString() ||
    receipt.approvalReceiptId !== command.approval.receiptId ||
    receipt.executorActorUserId !== command.executorActorUserId
  ) {
    fail("authority_replay_conflict");
  }
  return Object.freeze({
    kind: "online_wallet_payout_manual_execution_commit_receipt",
    effect: "replayed",
    payoutRequestId: receipt.payoutRequestId,
    payoutVersion: receipt.payoutVersion,
    bankExposureId: receipt.bankExposureId,
    bankExposureVersion: receipt.bankExposureVersion,
    state: "processing_manual",
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef
  }) as OnlineWalletPayoutManualExecutionCommitReceipt;
}

async function readPaidReplay(
  transaction: FinanceTransaction,
  command: PaidCommand,
  payout: typeof financeOnlinePayoutRequests.$inferSelect
): Promise<OnlineWalletPayoutPaidCommitReceipt | null> {
  const [receipt] = await transaction
    .select()
    .from(financeOnlinePayoutPaidReceipts)
    .where(
      and(
        eq(financeOnlinePayoutPaidReceipts.authorizationId, command.authority.authorityId),
        eq(financeOnlinePayoutPaidReceipts.authorizationVersion, command.authority.authorityVersion),
        eq(financeOnlinePayoutPaidReceipts.authorizationDigest, command.authority.authorityDigest)
      )
    )
    .limit(2)
    .for("share");
  if (!receipt) return null;
  if (
    receipt.payoutRequestId !== payout.id ||
    receipt.payoutVersion !== (BigInt(command.expectedPayoutVersion) + 1n).toString() ||
    receipt.approvalReceiptId !== command.approval.receiptId ||
    receipt.confirmerActorUserId !== command.confirmerActorUserId ||
    receipt.bankReference !== command.bankReference ||
    receipt.evidenceArtifactId !== command.evidenceArtifactId ||
    receipt.evidenceArtifactDigest !== command.evidenceArtifactDigest
  ) {
    fail("authority_replay_conflict");
  }
  return Object.freeze({
    ref: Object.freeze({
      kind: "online_wallet_payout_paid_receipt",
      receiptId: receipt.receiptId,
      version: 1,
      canonicalDigest: receipt.canonicalDigest as `sha256:${string}`
    }),
    kind: "online_wallet_payout_paid_commit_receipt",
    effect: "replayed",
    payoutRequestId: receipt.payoutRequestId,
    payoutVersion: receipt.payoutVersion,
    walletId: receipt.walletId,
    walletRevision: receipt.walletRevision,
    walletMutationId: receipt.walletMutationId,
    journalTransactionId: receipt.journalTransactionId,
    bankExposureId: receipt.bankExposureId,
    bankExposureVersion: receipt.bankExposureVersion,
    bankExposureState: "paid_unreflected",
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef
  }) as OnlineWalletPayoutPaidCommitReceipt;
}

async function transactionBoundary(transaction: FinanceTransaction): Promise<string> {
  const result = await transaction.execute<{ persistenceTransactionBoundaryRef: string }>(
    sql`select 'postgres-xid:' || pg_current_xact_id()::text as "persistenceTransactionBoundaryRef"`
  );
  const value = result.rows[0]?.persistenceTransactionBoundaryRef;
  if (!value || !/^postgres-xid:[0-9]+$/.test(value)) fail("persistence_write_incomplete");
  return value;
}

function throwMapped(error: unknown): never {
  if (error instanceof OnlineWalletPayoutExecutionPersistenceError) throw error;
  const code = postgresCode(error);
  if (code === "40001" || code === "40P01") {
    throw new OnlineWalletPayoutExecutionPersistenceError("retryable_concurrency_conflict", { cause: error });
  }
  if (code === "23505" || code === "23503" || code === "23514" || code === "55000") {
    throw new OnlineWalletPayoutExecutionPersistenceError("persistence_write_incomplete", { cause: error });
  }
  throw error;
}

function postgresCode(error: unknown): string | null {
  let current = error as { code?: unknown; cause?: unknown } | null;
  for (let index = 0; current && index < 4; index += 1) {
    if (typeof current.code === "string") return current.code;
    current = current.cause as { code?: unknown; cause?: unknown } | null;
  }
  return null;
}

function approvalRef(value: StartOnlineWalletPayoutManualExecutionCommand["approval"]): boolean {
  return value.kind === "online_wallet_payout_approval_receipt" && identifier(value.receiptId, 200) && digest(value.canonicalDigest);
}

function authority(value: StartOnlineWalletPayoutManualExecutionCommand["authority"]): boolean {
  return identifier(value.authorityId, 200) && positiveRevision(value.authorityVersion) && digest(value.authorityDigest);
}

function identifier(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maximum;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function positiveRevision(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function digest(value: string): value is `sha256:${string}` {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function instant(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function safePositiveMinor(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) fail("payout_paid_sources_invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail("payout_paid_sources_invalid");
  return parsed;
}

function fail(reason: OnlineWalletPayoutExecutionPersistenceError["reason"]): never {
  throw new OnlineWalletPayoutExecutionPersistenceError(reason);
}
