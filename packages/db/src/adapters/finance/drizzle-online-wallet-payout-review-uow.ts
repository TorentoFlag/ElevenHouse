import { randomUUID } from "node:crypto";
import {
  createOnlineWalletPayoutStateTransitionPlan,
  digestFinanceCanonicalValueV1,
  type ApproveOnlineWalletPayoutCommand,
  type OnlineWalletPayoutApprovalCommitReceipt,
  type OnlineWalletPayoutReviewCommitReceipt,
  type OnlineWalletPayoutReviewUnitOfWork,
  type TransitionOnlineWalletPayoutCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import {
  financeBankExposureHistory,
  financeBankExposures,
  financeBankLiquidityHeads,
  financeBankLiquidityHistory,
  financeBankLiquiditySnapshotAdoptionReceipts,
  financeBankLiquiditySnapshots
} from "../../schema/finance/bank-liquidity.schema";

import {
  financeOnlinePayoutApprovalReceipts,
  financeOnlinePayoutRequests,
  financeOnlinePayoutStateTransitions
} from "../../schema/finance/online-payouts.schema";
import { payoutMethods } from "../../schema/finance/payouts.schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";

export class OnlineWalletPayoutReviewPersistenceError extends Error {
  readonly code = "online_wallet_payout_review_persistence_error";

  constructor(
    readonly reason:
      | "invalid_command"
      | "payout_not_found"
      | "payout_version_conflict"
      | "payout_transition_invalid"
      | "maker_checker_violation"
      | "payout_destination_changed"
      | "bank_liquidity_snapshot_missing"
      | "bank_liquidity_snapshot_expired"
      | "bank_liquidity_revision_conflict"
      | "bank_liquidity_insufficient"
      | "bank_exposure_conflict"
      | "authority_replay_conflict"
      | "persistence_write_incomplete"
      | "retryable_concurrency_conflict"
  ) {
    super("Online wallet payout review could not be persisted");
    this.name = "OnlineWalletPayoutReviewPersistenceError";
  }
}

type NormalizedCommand = TransitionOnlineWalletPayoutCommand;

/**
 * Review/approval has no wallet movement. It is still an optimistic, append-only transition so
 * the later manual execution command can bind itself to the exact reviewer/approver history.
 */
export function createDrizzleOnlineWalletPayoutReviewUnitOfWork(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutReviewUnitOfWork {
  return Object.freeze({
    async transitionOnlineWalletPayout(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => persist(transaction, normalized));
      } catch (error) {
        if (error instanceof OnlineWalletPayoutReviewPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    },
    async approveOnlineWalletPayout(command) {
      const normalized = normalizeApproval(command);
      try {
        return await input.database.transaction((transaction) => persistApproval(transaction, normalized));
      } catch (error) {
        if (error instanceof OnlineWalletPayoutReviewPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("bank_exposure_conflict");
        if (code === "23503" || code === "23514" || code === "55000") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletPayoutReviewUnitOfWork);
}

function normalize(command: TransitionOnlineWalletPayoutCommand): NormalizedCommand {
  if (
    !identifier(command.payoutRequestId, 160) ||
    !positiveRevision(command.expectedPayoutVersion) ||
    !uuid(command.actorUserId) ||
    !identifier(command.authority.authorityId, 200) ||
    !positiveRevision(command.authority.authorityVersion) ||
    !digest(command.authority.authorityDigest) ||
    (command.adminNote !== null && !boundedText(command.adminNote, 1, 2000)) ||
    !instant(command.occurredAt)
  ) {
    fail("invalid_command");
  }
  return command;
}

async function persist(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<OnlineWalletPayoutReviewCommitReceipt> {
  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("update");
  if (!payout) fail("payout_not_found");

  const replay = await readAuthorityReplay(transaction, command);
  if (replay) return replay;
  if (payout.version !== command.expectedPayoutVersion) fail("payout_version_conflict");
  let plan: ReturnType<typeof createOnlineWalletPayoutStateTransitionPlan>;
  try {
    plan = createOnlineWalletPayoutStateTransitionPlan({
      payoutRequestId: payout.id,
      previousStatus: payout.status as Parameters<typeof createOnlineWalletPayoutStateTransitionPlan>[0]["previousStatus"],
      expectedVersion: payout.version,
      nextStatus: command.nextStatus
    });
  } catch {
    fail("payout_transition_invalid");
  }
  if (command.actorUserId === payout.astrologerUserId) fail("maker_checker_violation");
  await transaction.insert(financeOnlinePayoutStateTransitions).values({
    payoutRequestId: payout.id,
    payoutVersion: plan.nextVersion,
    previousStatus: plan.previousStatus,
    status: command.nextStatus,
    transitionKind: plan.transitionKind,
    actorUserId: command.actorUserId,
    authorityId: command.authority.authorityId,
    authorityVersion: command.authority.authorityVersion,
    authorityDigest: command.authority.authorityDigest,
    adminNote: command.adminNote,
    failureReason: null,
    occurredAt: new Date(command.occurredAt),
    createdAt: new Date(command.occurredAt)
  });
  const [updated] = await transaction
    .update(financeOnlinePayoutRequests)
    .set({
      status: command.nextStatus,
      version: plan.nextVersion,
      updatedAt: new Date(command.occurredAt)
    })
    .where(
      and(
        eq(financeOnlinePayoutRequests.id, payout.id),
        eq(financeOnlinePayoutRequests.status, plan.previousStatus),
        eq(financeOnlinePayoutRequests.version, plan.expectedVersion)
      )
    )
    .returning({ id: financeOnlinePayoutRequests.id });
  if (!updated) fail("payout_version_conflict");
  return Object.freeze({
    kind: "online_wallet_payout_review_commit_receipt",
    effect: "applied_once",
    payoutRequestId: payout.id,
    previousStatus: plan.previousStatus,
    status: command.nextStatus,
    payoutVersion: plan.nextVersion
  });
}

type NormalizedApproval = ApproveOnlineWalletPayoutCommand &
  Readonly<{
    occurredAtDate: Date;
    nextPayoutVersion: string;
    approvalReceiptId: string;
    approvalTransitionId: string;
  }>;

function normalizeApproval(command: ApproveOnlineWalletPayoutCommand): NormalizedApproval {
  if (
    !identifier(command.payoutRequestId, 160) ||
    !positiveRevision(command.expectedPayoutVersion) ||
    !digest(command.expectedBeneficiaryFingerprint) ||
    !uuid(command.actorUserId) ||
    !identifier(command.bankCashPoolId, 160) ||
    command.currency !== "RUB" ||
    !nonNegativeRevision(command.expectedBankLiquidityRevision) ||
    command.adoptedLiquiditySnapshot.kind !== "bank_liquidity_snapshot_adoption_receipt" ||
    !identifier(command.adoptedLiquiditySnapshot.receiptId, 200) ||
    command.adoptedLiquiditySnapshot.version !== 1 ||
    !digest(command.adoptedLiquiditySnapshot.canonicalDigest) ||
    !identifier(command.authority.authorityId, 200) ||
    !positiveRevision(command.authority.authorityVersion) ||
    !digest(command.authority.authorityDigest) ||
    !instant(command.occurredAt) ||
    !validEnvelope(command.operationEnvelope)
  ) {
    fail("invalid_command");
  }
  const approvalReceiptId = randomUUID();
  const approvalTransitionId = randomUUID();
  return Object.freeze({
    ...command,
    occurredAtDate: new Date(command.occurredAt),
    nextPayoutVersion: (BigInt(command.expectedPayoutVersion) + 1n).toString(),
    approvalReceiptId,
    approvalTransitionId
  });
}

async function persistApproval(
  transaction: FinanceTransaction,
  command: NormalizedApproval
): Promise<OnlineWalletPayoutApprovalCommitReceipt> {
  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("update");
  if (!payout) fail("payout_not_found");

  const authorityReplay = await readApprovalReplay(transaction, command, payout);
  if (authorityReplay) return authorityReplay;
  if (payout.version !== command.expectedPayoutVersion) fail("payout_version_conflict");
  if (payout.status !== "under_review") fail("payout_transition_invalid");
  if (payout.currency !== command.currency || payout.beneficiaryFingerprint !== command.expectedBeneficiaryFingerprint) {
    fail("payout_destination_changed");
  }

  const [review] = await transaction
    .select({ actorUserId: financeOnlinePayoutStateTransitions.actorUserId })
    .from(financeOnlinePayoutStateTransitions)
    .where(
      and(
        eq(financeOnlinePayoutStateTransitions.payoutRequestId, payout.id),
        eq(financeOnlinePayoutStateTransitions.payoutVersion, payout.version),
        eq(financeOnlinePayoutStateTransitions.status, "under_review")
      )
    )
    .limit(2)
    .for("share");
  if (!review || review.actorUserId === command.actorUserId || command.actorUserId === payout.astrologerUserId) {
    fail("maker_checker_violation");
  }

  const [currentMethod] = await transaction
    .select({ version: payoutMethods.version })
    .from(payoutMethods)
    .where(
      and(
        eq(payoutMethods.id, payout.payoutMethodId),
        eq(payoutMethods.astrologerUserId, payout.astrologerUserId),
        eq(payoutMethods.currency, command.currency)
      )
    )
    .limit(2)
    .for("share");
  if (!currentMethod || currentMethod.version !== String(payout.payoutMethodVersion)) {
    fail("payout_destination_changed");
  }

  const [snapshotReceipt] = await transaction
    .select()
    .from(financeBankLiquiditySnapshotAdoptionReceipts)
    .where(
      and(
        eq(
          financeBankLiquiditySnapshotAdoptionReceipts.receiptId,
          command.adoptedLiquiditySnapshot.receiptId
        ),
        eq(financeBankLiquiditySnapshotAdoptionReceipts.receiptVersion, 1),
        eq(
          financeBankLiquiditySnapshotAdoptionReceipts.canonicalDigest,
          command.adoptedLiquiditySnapshot.canonicalDigest
        ),
        eq(financeBankLiquiditySnapshotAdoptionReceipts.bankCashPoolId, command.bankCashPoolId),
        eq(financeBankLiquiditySnapshotAdoptionReceipts.currency, command.currency)
      )
    )
    .limit(2)
    .for("share");
  if (!snapshotReceipt) fail("bank_liquidity_snapshot_missing");
  const [snapshot] = await transaction
    .select()
    .from(financeBankLiquiditySnapshots)
    .where(
      and(
        eq(financeBankLiquiditySnapshots.snapshotId, snapshotReceipt.snapshotId),
        eq(financeBankLiquiditySnapshots.bankCashPoolId, command.bankCashPoolId),
        eq(financeBankLiquiditySnapshots.currency, command.currency),
        eq(financeBankLiquiditySnapshots.snapshotVersion, snapshotReceipt.snapshotVersion),
        eq(financeBankLiquiditySnapshots.evidenceDigest, snapshotReceipt.snapshotDigest)
      )
    )
    .limit(2)
    .for("share");
  if (!snapshot) fail("bank_liquidity_snapshot_missing");
  if (snapshot.expiresAt.getTime() <= command.occurredAtDate.getTime()) {
    fail("bank_liquidity_snapshot_expired");
  }

  const [liquidityHead] = await transaction
    .select()
    .from(financeBankLiquidityHeads)
    .where(
      and(
        eq(financeBankLiquidityHeads.bankCashPoolId, command.bankCashPoolId),
        eq(financeBankLiquidityHeads.currency, command.currency)
      )
    )
    .limit(2)
    .for("update");
  if (
    !liquidityHead ||
    liquidityHead.revision !== command.expectedBankLiquidityRevision ||
    liquidityHead.snapshotState !== "adopted" ||
    liquidityHead.currentSnapshotId !== snapshot.snapshotId ||
    liquidityHead.currentSnapshotVersion !== snapshot.snapshotVersion ||
    liquidityHead.currentSnapshotDigest !== snapshot.evidenceDigest ||
    liquidityHead.availableLiquidityMinor === null
  ) {
    fail("bank_liquidity_revision_conflict");
  }
  if (BigInt(liquidityHead.availableLiquidityMinor) < BigInt(payout.immutableAmountMinor)) {
    fail("bank_liquidity_insufficient");
  }

  const bankExposureId = `online-wallet-payout-exposure:${payout.id}`;
  const nextBankLiquidityRevision = (BigInt(liquidityHead.revision) + 1n).toString();
  const boundary = await transaction.execute<{ persistenceTransactionBoundaryRef: string }>(
    sql`select 'postgres-xid:' || pg_current_xact_id()::text as "persistenceTransactionBoundaryRef"`
  );
  const persistenceTransactionBoundaryRef = boundary.rows[0]?.persistenceTransactionBoundaryRef;
  if (!persistenceTransactionBoundaryRef || !/^postgres-xid:[0-9]+$/.test(persistenceTransactionBoundaryRef)) {
    fail("persistence_write_incomplete");
  }
  const approvalReceiptCanonical = {
    kind: "online_wallet_payout_approval_commit_receipt",
    version: 1,
    approvalReceiptId: command.approvalReceiptId,
    approvalTransitionId: command.approvalTransitionId,
    payoutRequestId: payout.id,
    payoutVersion: command.nextPayoutVersion,
    immutableAmountMinor: payout.immutableAmountMinor,
    beneficiaryFingerprint: payout.beneficiaryFingerprint,
    bankExposureId,
    bankExposureVersion: "1",
    bankLiquidityRevision: nextBankLiquidityRevision,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    snapshotAdoptionReceipt: {
      receiptId: snapshotReceipt.receiptId,
      version: snapshotReceipt.receiptVersion,
      canonicalDigest: snapshotReceipt.canonicalDigest
    },
    approverActorUserId: command.actorUserId,
    authorization: command.authority,
    persistenceTransactionBoundaryRef,
    approvedAt: command.occurredAt
  } as const;
  const approvalReceiptDigest = digestFinanceCanonicalValueV1(approvalReceiptCanonical);
  await transaction.insert(financeBankExposures).values({
    exposureId: bankExposureId,
    payoutRequestId: payout.id,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    approvalSnapshotId: snapshot.snapshotId,
    approvalSnapshotVersion: snapshot.snapshotVersion,
    approvalSnapshotDigest: snapshot.evidenceDigest,
    amountMinor: payout.immutableAmountMinor,
    state: "committed",
    version: "1",
    approvedByActorId: command.actorUserId
  });
  await transaction.insert(financeBankExposureHistory).values({
    exposureId: bankExposureId,
    payoutRequestId: payout.id,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    amountMinor: payout.immutableAmountMinor,
    version: "1",
    previousState: null,
    state: "committed",
    transitionKind: "approval_committed",
    transitionAuthorityKind: "online_wallet_payout_approval_commit_receipt",
    transitionAuthorityId: command.approvalReceiptId,
    transitionAuthorityVersion: 1,
    transitionAuthorityDigest: approvalReceiptDigest,
    bankStatementEntryId: null,
    occurredAt: command.occurredAtDate
  });

  const openPayoutExposureMinor = (
    BigInt(liquidityHead.openPayoutExposureMinor) + BigInt(payout.immutableAmountMinor)
  ).toString();
  const availableLiquidityMinor = (
    BigInt(liquidityHead.availableLiquidityMinor) - BigInt(payout.immutableAmountMinor)
  ).toString();
  const [history] = await transaction
    .insert(financeBankLiquidityHistory)
    .values({
      previousHistoryId: liquidityHead.lastHistoryId,
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      expectedRevision: liquidityHead.revision,
      revision: nextBankLiquidityRevision,
      mutationKind: "payout_exposure_committed",
      mutationRefId: bankExposureId,
      snapshotState: "adopted",
      currentSnapshotId: liquidityHead.currentSnapshotId,
      currentSnapshotVersion: liquidityHead.currentSnapshotVersion,
      currentSnapshotDigest: liquidityHead.currentSnapshotDigest,
      unrestrictedAvailableMinor: liquidityHead.unrestrictedAvailableMinor,
      openPayoutExposureMinor,
      unresolvedDebitExposureMinor: liquidityHead.unresolvedDebitExposureMinor,
      safetyBufferMinor: liquidityHead.safetyBufferMinor,
      availableLiquidityMinor,
      adoptionReceiptId: null,
      adoptionReceiptVersion: null,
      adoptionReceiptDigest: null
    })
    .returning();
  if (!history) fail("persistence_write_incomplete");
  const [updatedLiquidityHead] = await transaction
    .update(financeBankLiquidityHeads)
    .set({
      revision: nextBankLiquidityRevision,
      lastHistoryId: history.historyId,
      openPayoutExposureMinor,
      availableLiquidityMinor
    })
    .where(
      and(
        eq(financeBankLiquidityHeads.id, liquidityHead.id),
        eq(financeBankLiquidityHeads.revision, liquidityHead.revision)
      )
    )
    .returning({ id: financeBankLiquidityHeads.id });
  if (!updatedLiquidityHead) fail("bank_liquidity_revision_conflict");

  await transaction.insert(financeOnlinePayoutStateTransitions).values({
    transitionId: command.approvalTransitionId,
    payoutRequestId: payout.id,
    payoutVersion: command.nextPayoutVersion,
    previousStatus: "under_review",
    status: "approved",
    transitionKind: "approved",
    actorKind: "user",
    actorUserId: command.actorUserId,
    authorityId: command.authority.authorityId,
    authorityVersion: command.authority.authorityVersion,
    authorityDigest: command.authority.authorityDigest,
    adminNote: null,
    failureReason: null,
    occurredAt: command.occurredAtDate,
    createdAt: command.occurredAtDate
  });
  const [updatedPayout] = await transaction
    .update(financeOnlinePayoutRequests)
    .set({ status: "approved", version: command.nextPayoutVersion, updatedAt: command.occurredAtDate })
    .where(
      and(
        eq(financeOnlinePayoutRequests.id, payout.id),
        eq(financeOnlinePayoutRequests.status, "under_review"),
        eq(financeOnlinePayoutRequests.version, command.expectedPayoutVersion)
      )
    )
    .returning({ id: financeOnlinePayoutRequests.id });
  if (!updatedPayout) fail("payout_version_conflict");
  const canonicalPreimage = JSON.stringify(approvalReceiptCanonical);
  await transaction.insert(financeOnlinePayoutApprovalReceipts).values({
    receiptId: command.approvalReceiptId,
    receiptVersion: 1,
    payoutRequestId: payout.id,
    payoutVersion: command.nextPayoutVersion,
    approvalTransitionId: command.approvalTransitionId,
    bankExposureId,
    bankExposureVersion: "1",
    bankLiquidityRevision: nextBankLiquidityRevision,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    snapshotAdoptionReceiptId: snapshotReceipt.receiptId,
    snapshotAdoptionReceiptVersion: snapshotReceipt.receiptVersion,
    snapshotAdoptionReceiptDigest: snapshotReceipt.canonicalDigest,
    approverActorUserId: command.actorUserId,
    authorizationId: command.authority.authorityId,
    authorizationVersion: command.authority.authorityVersion,
    authorizationDigest: command.authority.authorityDigest,
    persistenceTransactionBoundaryRef,
    canonicalPreimage,
    canonicalDigest: approvalReceiptDigest,
    approvedAt: command.occurredAtDate,
    createdAt: command.occurredAtDate
  });
  return Object.freeze({
    kind: "online_wallet_payout_approval_commit_receipt",
    effect: "applied_once",
    payoutRequestId: payout.id,
    payoutVersion: command.nextPayoutVersion,
    bankExposureId,
    bankExposureVersion: "1",
    bankLiquidityRevision: nextBankLiquidityRevision,
    approvalReceiptId: command.approvalReceiptId,
    approvalReceiptDigest,
    persistenceTransactionBoundaryRef
  });
}

async function readApprovalReplay(
  transaction: FinanceTransaction,
  command: NormalizedApproval,
  payout: typeof financeOnlinePayoutRequests.$inferSelect
): Promise<OnlineWalletPayoutApprovalCommitReceipt | null> {
  const [transition] = await transaction
    .select()
    .from(financeOnlinePayoutStateTransitions)
    .where(
      and(
        eq(financeOnlinePayoutStateTransitions.authorityId, command.authority.authorityId),
        eq(financeOnlinePayoutStateTransitions.authorityVersion, command.authority.authorityVersion),
        eq(financeOnlinePayoutStateTransitions.authorityDigest, command.authority.authorityDigest)
      )
    )
    .limit(2)
    .for("share");
  if (!transition) return null;
  if (
    transition.payoutRequestId !== payout.id ||
    transition.status !== "approved" ||
    transition.actorUserId !== command.actorUserId
  ) {
    fail("authority_replay_conflict");
  }
  const [receipt] = await transaction
    .select()
    .from(financeOnlinePayoutApprovalReceipts)
    .where(
      and(
        eq(financeOnlinePayoutApprovalReceipts.payoutRequestId, payout.id),
        eq(financeOnlinePayoutApprovalReceipts.authorizationId, command.authority.authorityId),
        eq(financeOnlinePayoutApprovalReceipts.authorizationVersion, command.authority.authorityVersion),
        eq(financeOnlinePayoutApprovalReceipts.authorizationDigest, command.authority.authorityDigest)
      )
    )
    .limit(2)
    .for("share");
  if (
    !receipt ||
    receipt.payoutVersion !== transition.payoutVersion ||
    receipt.approvalTransitionId !== transition.transitionId ||
    receipt.approverActorUserId !== command.actorUserId
  ) {
    fail("persistence_write_incomplete");
  }
  return Object.freeze({
    kind: "online_wallet_payout_approval_commit_receipt",
    effect: "replayed",
    payoutRequestId: payout.id,
    payoutVersion: transition.payoutVersion,
    bankExposureId: receipt.bankExposureId,
    bankExposureVersion: receipt.bankExposureVersion,
    bankLiquidityRevision: receipt.bankLiquidityRevision,
    approvalReceiptId: receipt.receiptId,
    approvalReceiptDigest: receipt.canonicalDigest as `sha256:${string}`,
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef
  });
}

async function readAuthorityReplay(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<OnlineWalletPayoutReviewCommitReceipt | null> {
  const [transition] = await transaction
    .select()
    .from(financeOnlinePayoutStateTransitions)
    .where(
      and(
        eq(financeOnlinePayoutStateTransitions.authorityId, command.authority.authorityId),
        eq(financeOnlinePayoutStateTransitions.authorityVersion, command.authority.authorityVersion),
        eq(financeOnlinePayoutStateTransitions.authorityDigest, command.authority.authorityDigest)
      )
    )
    .limit(2)
    .for("share");
  if (!transition) return null;
  if (
    transition.payoutRequestId !== command.payoutRequestId ||
    transition.actorUserId !== command.actorUserId ||
    transition.status !== command.nextStatus ||
    transition.previousStatus === null
  ) {
    fail("authority_replay_conflict");
  }
  return Object.freeze({
    kind: "online_wallet_payout_review_commit_receipt",
    effect: "replayed",
    payoutRequestId: transition.payoutRequestId,
    previousStatus: transition.previousStatus as OnlineWalletPayoutReviewCommitReceipt["previousStatus"],
    status: transition.status as OnlineWalletPayoutReviewCommitReceipt["status"],
    payoutVersion: transition.payoutVersion
  });
}

function identifier(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maximum;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function positiveRevision(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function nonNegativeRevision(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value);
}

function digest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function boundedText(value: string, minimum: number, maximum: number): boolean {
  return value.trim() === value && value.length >= minimum && value.length <= maximum;
}

function instant(value: string): Date | null {
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : null;
}

function validEnvelope(value: { readonly kind: string; readonly policyId: string; readonly policyVersion: number; readonly policyDigest: string; readonly maximumRows: number; readonly maximumDecimalDigits: number; readonly maximumArtifactBytes: number }): boolean {
  return (
    value.kind === "resolved_finance_operation_envelope" &&
    identifier(value.policyId, 160) &&
    Number.isSafeInteger(value.policyVersion) && value.policyVersion >= 1 &&
    digest(value.policyDigest) &&
    Number.isSafeInteger(value.maximumRows) && value.maximumRows >= 1 &&
    Number.isSafeInteger(value.maximumDecimalDigits) && value.maximumDecimalDigits >= 1 &&
    Number.isSafeInteger(value.maximumArtifactBytes) && value.maximumArtifactBytes >= 1
  );
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: ConstructorParameters<typeof OnlineWalletPayoutReviewPersistenceError>[0]): never {
  throw new OnlineWalletPayoutReviewPersistenceError(reason);
}
