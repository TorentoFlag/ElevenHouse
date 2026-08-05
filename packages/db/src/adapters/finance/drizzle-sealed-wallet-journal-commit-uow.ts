import {
  type FinanceLedgerAccountRef,
  type FinanceProviderAccountIdentity,
  type SealedWalletJournalMutationCommand,
  type SealedWalletJournalCommitUnitOfWork,
  type VerifiedWalletOperationCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeJournalTransactions } from "../../schema/finance/ledger.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import {
  financePayableLotOperationAuthorityBindings,
  financePayableLotOperationComponentSlots,
  financePayableLotOperationEffects,
  financePayableLotOperationLineage,
  financePayableLotOperationReceipts,
  financePayableLots,
  financePayableLotTransitions,
  financeWalletCommitBindings,
  financeWalletHeads,
  financeWalletHistory,
  financeWalletLotCommitmentChain,
  financeWalletLotStateSnapshots
} from "../../schema/finance/wallet.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { writeSealedJournalTransaction } from "./journal-transaction-writer";
import {
  assertCreatedLotPreservesLockedParent,
  assertLockedLotMatchesTransition,
  assertWalletHeadMatchesCommand,
  deriveNextWalletBalances,
  mapCreatedPayableLotRows,
  mapDatabaseIssuedWalletCommitReceipt,
  prepareWalletJournalMutation,
  walletSnapshotDigest,
  type PersistedPayableLotRow,
  type PersistedWalletHeadRow,
  type PreparedWalletJournalMutation,
  type ResolvedPersistedRootCaptureAuthority
} from "./wallet-row-mapper";

export { createResolvedPersistedRootCaptureAuthority } from "./wallet-row-mapper";
export type { ResolvedPersistedRootCaptureAuthority } from "./wallet-row-mapper";

export const sealedWalletJournalWriteBoundaryValues = Object.freeze([
  "sealed_journal",
  "wallet_head",
  "operation_receipt",
  "payable_lots",
  "authority_bindings",
  "effects",
  "lineage",
  "component_slots",
  "lot_transitions",
  "wallet_history",
  "commit_binding",
  "lot_state_snapshot",
  "lot_commitment_chain"
] as const);

export type SealedWalletJournalWriteBoundary =
  (typeof sealedWalletJournalWriteBoundaryValues)[number];

export type SealedWalletJournalCommitFailureInjector = (
  boundary: SealedWalletJournalWriteBoundary
) => void | Promise<void>;

export type SealedWalletJournalCommitPersistenceReason =
  | "invalid_database_identity"
  | "wallet_identity_conflict"
  | "wallet_revision_conflict"
  | "retryable_concurrency_conflict"
  | "lot_lock_set_mismatch"
  | "lot_already_consumed"
  | "provider_identity_mismatch"
  | "capture_authority_mismatch"
  | "journal_source_scope_mismatch"
  | "persistence_write_incomplete";

export class SealedWalletJournalCommitPersistenceError extends Error {
  readonly code = "sealed_wallet_journal_commit_persistence_error";

  constructor(readonly reason: SealedWalletJournalCommitPersistenceReason) {
    super("Sealed wallet and journal mutation could not be committed atomically");
    this.name = "SealedWalletJournalCommitPersistenceError";
  }
}

export function createDrizzleSealedWalletJournalCommitUnitOfWork(input: {
  readonly database: ElevenHouseDatabase;
  readonly afterWriteBoundary?: SealedWalletJournalCommitFailureInjector;
}): SealedWalletJournalCommitUnitOfWork {
  const unitOfWork = {
    async commitSealedWalletJournalMutation(command) {
      try {
        return await input.database.transaction((transaction) =>
          commitSealedWalletJournalMutationInTransaction(
            transaction,
            command,
            null,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof SealedWalletJournalCommitPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        throw error;
      }
    }
  } satisfies SealedWalletJournalCommitUnitOfWork;
  return Object.freeze(unitOfWork);
}

/**
 * DB-internal composition seam for capability UoWs that must persist their aggregate transition
 * and the wallet/journal graph in one caller-owned PostgreSQL transaction. It is intentionally
 * not exported by the public adapter barrel.
 */
export async function commitSealedWalletJournalMutationInTransaction(
  transaction: FinanceTransaction,
  command: SealedWalletJournalMutationCommand,
  rootCaptureAuthority: ResolvedPersistedRootCaptureAuthority | null,
  afterWriteBoundary: SealedWalletJournalCommitFailureInjector = noFailureInjection
): Promise<VerifiedWalletOperationCommitReceipt> {
  const prepared = prepareWalletJournalMutation(command);
  assertUuid(prepared.walletId);
  assertUuid(prepared.astrologerUserId);
  if (
    prepared.receipt.operationKind === "sale_capture" &&
    prepared.lineage.some((entry) => entry.relation === "root_created") &&
    rootCaptureAuthority === null
  ) {
    fail("capture_authority_mismatch");
  }
  return commitInTransaction(transaction, prepared, rootCaptureAuthority, afterWriteBoundary);
}

async function commitInTransaction(
  transaction: FinanceTransaction,
  prepared: PreparedWalletJournalMutation,
  rootCaptureAuthority: ResolvedPersistedRootCaptureAuthority | null,
  afterWriteBoundary: SealedWalletJournalCommitFailureInjector
): Promise<VerifiedWalletOperationCommitReceipt> {
  await lockWalletScope(transaction, prepared);
  const walletHeadRows = await transaction
    .select(walletHeadSelection)
    .from(financeWalletHeads)
    .where(
      or(
        eq(financeWalletHeads.id, prepared.walletId),
        and(
          eq(financeWalletHeads.astrologerUserId, prepared.astrologerUserId),
          eq(financeWalletHeads.currency, "RUB")
        )
      )
    )
    .orderBy(asc(financeWalletHeads.id))
    .limit(2)
    .for("update");
  if (walletHeadRows.length > 1) fail("wallet_identity_conflict");
  const walletHead = walletHeadRows[0] ?? null;
  if (
    walletHead &&
    (walletHead.id !== prepared.walletId ||
      walletHead.astrologerUserId !== prepared.astrologerUserId ||
      walletHead.currency !== "RUB")
  ) {
    fail("wallet_identity_conflict");
  }
  const previousBalances = assertWalletHeadMatchesCommand(prepared, walletHead);

  const lockedLots = await lockBoundedLots(transaction, prepared);
  const createdLotRows = mapCreatedPayableLotRows(prepared, {
    rootCaptureAuthority,
    lockedLots
  });
  assertLockedLotSet(prepared, lockedLots, createdLotRows);
  await assertLotsRemainActive(transaction, prepared, lockedLots);

  const nextBalances = deriveNextWalletBalances(prepared, previousBalances);
  if (
    walletSnapshotDigest(prepared, prepared.nextWalletRevision, nextBalances) !==
    prepared.binding.nextWalletSnapshotDigest
  ) {
    fail("wallet_revision_conflict");
  }
  if (
    !walletHead &&
    (prepared.receipt.operationKind !== "sale_capture" ||
      !prepared.lineage.some((entry) => entry.relation === "root_created"))
  ) {
    fail("wallet_revision_conflict");
  }

  const resolvedSourceScope = await resolveJournalSourceScope(transaction, prepared);
  const journalReceipt = await writeSealedJournalTransaction(transaction, {
    transaction: prepared.transaction,
    proof: prepared.proof,
    resolvedSourceScope,
    decoderEnvelope: prepared.postingDecoderEnvelope
  });
  const persistenceTransactionBoundaryRef = journalReceipt.persistenceTransactionBoundaryRef;
  if (
    journalReceipt.journalTransactionId !== prepared.transaction.id ||
    journalReceipt.journalTransactionDigest !== prepared.binding.journalTransactionDigest ||
    journalReceipt.journalLinkProofId !== prepared.proof.proofId ||
    journalReceipt.journalLinkProofVersion !== prepared.proof.version ||
    journalReceipt.journalLinkProofDigest !== prepared.proof.proofDigest
  ) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("sealed_journal");

  const sourceRows = await transaction
    .select({ sourceIdentityId: financeJournalTransactions.sourceIdentityId })
    .from(financeJournalTransactions)
    .where(eq(financeJournalTransactions.id, prepared.transaction.id))
    .limit(2);
  if (sourceRows.length !== 1 || !sourceRows[0]) fail("persistence_write_incomplete");

  const nextHead = {
    id: prepared.walletId,
    astrologerUserId: prepared.astrologerUserId,
    currency: "RUB" as const,
    revision: prepared.nextWalletRevision,
    mutationSequence: prepared.nextWalletRevision,
    ...nextBalances,
    lotStateVersion: prepared.receipt.nextLotState.version,
    lotStateDigest: prepared.receipt.nextLotState.digest,
    snapshotDigest: prepared.binding.nextWalletSnapshotDigest,
    lastOperationId: prepared.operationId,
    lastCommitBindingId: prepared.binding.bindingId
  };
  if (!walletHead) {
    const inserted = await transaction
      .insert(financeWalletHeads)
      .values(nextHead)
      .returning({ id: financeWalletHeads.id });
    if (inserted.length !== 1 || inserted[0]?.id !== prepared.walletId) {
      fail("persistence_write_incomplete");
    }
    await afterWriteBoundary("wallet_head");
  }

  await transaction.insert(financePayableLotOperationReceipts).values({
    receiptId: prepared.receipt.receiptId,
    schemaVersion: prepared.receipt.schemaVersion,
    verificationStatus: "verified_by_persistence",
    operationId: prepared.operationId,
    operationKind: prepared.receipt.operationKind,
    sourceIdentityId: sourceRows[0].sourceIdentityId,
    walletId: prepared.walletId,
    astrologerUserId: prepared.astrologerUserId,
    currency: "RUB",
    occurredAt: databaseInstant(prepared.receipt.occurredAt),
    previousLotStateVersion: prepared.receipt.previousLotState.version,
    nextLotStateVersion: prepared.receipt.nextLotState.version,
    previousLotStateDigest: prepared.receipt.previousLotState.digest,
    nextLotStateDigest: prepared.receipt.nextLotState.digest,
    historyRecordKind: prepared.receipt.historyRecord.kind,
    historyRecordDigest: prepared.receipt.historyRecord.canonicalDigest,
    canonicalDigest: prepared.receipt.canonicalDigest,
    digestPurpose: prepared.receipt.digestPurpose,
    mutationSequence: prepared.nextWalletRevision,
    authorityCount: prepared.authorities.length,
    effectCount: prepared.effects.length,
    lineageCount: prepared.lineage.length,
    componentSlotCount: prepared.componentSlots.length
  });
  await afterWriteBoundary("operation_receipt");

  if (createdLotRows.length > 0) {
    await transaction.insert(financePayableLots).values([...createdLotRows]);
    await afterWriteBoundary("payable_lots");
  }
  await transaction
    .insert(financePayableLotOperationAuthorityBindings)
    .values([...prepared.authorities]);
  await afterWriteBoundary("authority_bindings");
  if (prepared.effects.length > 0) {
    await transaction.insert(financePayableLotOperationEffects).values([...prepared.effects]);
    await afterWriteBoundary("effects");
  }
  if (prepared.lineage.length > 0) {
    await transaction.insert(financePayableLotOperationLineage).values([...prepared.lineage]);
    await afterWriteBoundary("lineage");
  }
  if (prepared.componentSlots.length > 0) {
    await transaction
      .insert(financePayableLotOperationComponentSlots)
      .values([...prepared.componentSlots]);
    await afterWriteBoundary("component_slots");
  }
  if (prepared.transitions.length > 0) {
    await transaction.insert(financePayableLotTransitions).values(
      prepared.transitions.map((row) => ({
        ...row,
        mutationSequence: prepared.nextWalletRevision
      }))
    );
    await afterWriteBoundary("lot_transitions");
  }

  if (walletHead) {
    const updated = await transaction
      .update(financeWalletHeads)
      .set({
        revision: prepared.nextWalletRevision,
        mutationSequence: prepared.nextWalletRevision,
        ...nextBalances,
        lotStateVersion: prepared.receipt.nextLotState.version,
        lotStateDigest: prepared.receipt.nextLotState.digest,
        snapshotDigest: prepared.binding.nextWalletSnapshotDigest,
        lastOperationId: prepared.operationId,
        lastCommitBindingId: prepared.binding.bindingId
      })
      .where(
        and(
          eq(financeWalletHeads.id, prepared.walletId),
          eq(financeWalletHeads.revision, prepared.expectedWalletRevision)
        )
      )
      .returning({ id: financeWalletHeads.id });
    if (updated.length !== 1 || updated[0]?.id !== prepared.walletId) {
      fail("wallet_revision_conflict");
    }
    await afterWriteBoundary("wallet_head");
  }

  const [history] = await transaction
    .insert(financeWalletHistory)
    .values({
      walletId: prepared.walletId,
      astrologerUserId: prepared.astrologerUserId,
      currency: "RUB",
      operationId: prepared.operationId,
      operationReceiptId: prepared.receipt.receiptId,
      previousRevision: prepared.expectedWalletRevision,
      nextRevision: prepared.nextWalletRevision,
      mutationSequence: prepared.nextWalletRevision,
      previousPendingMinor: previousBalances.pendingMinor,
      nextPendingMinor: nextBalances.pendingMinor,
      previousAvailableMinor: previousBalances.availableMinor,
      nextAvailableMinor: nextBalances.availableMinor,
      previousReservedMinor: previousBalances.reservedMinor,
      nextReservedMinor: nextBalances.reservedMinor,
      previousPayoutPendingMinor: previousBalances.payoutPendingMinor,
      nextPayoutPendingMinor: nextBalances.payoutPendingMinor,
      previousRefundPendingMinor: previousBalances.refundPendingMinor,
      nextRefundPendingMinor: nextBalances.refundPendingMinor,
      previousRecoveryReceivableMinor: previousBalances.recoveryReceivableMinor,
      nextRecoveryReceivableMinor: nextBalances.recoveryReceivableMinor,
      previousLotStateVersion: prepared.receipt.previousLotState.version,
      nextLotStateVersion: prepared.receipt.nextLotState.version,
      previousLotStateDigest: prepared.receipt.previousLotState.digest,
      nextLotStateDigest: prepared.receipt.nextLotState.digest,
      previousSnapshotDigest: prepared.binding.previousWalletSnapshotDigest,
      nextSnapshotDigest: prepared.binding.nextWalletSnapshotDigest,
      occurredAt: databaseInstant(prepared.receipt.occurredAt)
    })
    .returning({ id: financeWalletHistory.id });
  if (!history) fail("persistence_write_incomplete");
  await afterWriteBoundary("wallet_history");

  const [binding] = await transaction
    .insert(financeWalletCommitBindings)
    .values({
      bindingId: prepared.binding.bindingId,
      schemaVersion: prepared.binding.schemaVersion,
      walletHistoryId: history.id,
      operationId: prepared.operationId,
      operationReceiptId: prepared.receipt.receiptId,
      journalTransactionId: prepared.transaction.id,
      journalTransactionDigest: prepared.binding.journalTransactionDigest,
      journalPersistenceReceiptId: journalReceipt.ref.receiptId,
      journalLinkProofId: prepared.proof.proofId,
      journalLinkProofVersion: prepared.proof.version,
      journalLinkProofDigest: prepared.proof.proofDigest,
      operationSnapshotId: prepared.binding.operationSnapshotId,
      operationSnapshotDigest: prepared.binding.operationSnapshotDigest,
      limitPolicyId: prepared.binding.unverifiedLimitPolicy.policyId,
      limitPolicyVersion: prepared.binding.unverifiedLimitPolicy.version,
      limitPolicyDigest: prepared.binding.unverifiedLimitPolicy.canonicalDigest,
      historyRecordDigest: prepared.binding.historyRecordDigest,
      previousLotStateDigest: prepared.binding.previousLotStateDigest,
      nextLotStateDigest: prepared.binding.nextLotStateDigest,
      previousWalletId: prepared.walletId,
      nextWalletId: prepared.walletId,
      astrologerUserId: prepared.astrologerUserId,
      currency: "RUB",
      previousWalletRevision: prepared.expectedWalletRevision,
      nextWalletRevision: prepared.nextWalletRevision,
      previousWalletSnapshotDigest: prepared.binding.previousWalletSnapshotDigest,
      nextWalletSnapshotDigest: prepared.binding.nextWalletSnapshotDigest,
      mutationSequence: prepared.nextWalletRevision,
      bindingDigest: prepared.binding.bindingDigest,
      commitReceiptVersion: "1",
      persistenceTransactionBoundaryRef
    })
    .returning({
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
    });
  if (!binding) fail("persistence_write_incomplete");
  await afterWriteBoundary("commit_binding");

  const [lotStateSnapshot] = await transaction
    .insert(financeWalletLotStateSnapshots)
    .values({
      walletId: prepared.walletId,
      astrologerUserId: prepared.astrologerUserId,
      currency: "RUB",
      walletRevision: prepared.nextWalletRevision,
      lotStateVersion: prepared.receipt.nextLotState.version,
      lotStateDigest: prepared.receipt.nextLotState.digest,
      walletHistoryId: history.id,
      operationReceiptId: prepared.receipt.receiptId,
      commitBindingId: binding.bindingId,
      commitReceiptId: binding.commitReceiptId
    })
    .returning({ id: financeWalletLotStateSnapshots.id });
  if (!lotStateSnapshot) fail("persistence_write_incomplete");
  await afterWriteBoundary("lot_state_snapshot");

  const [lotCommitment] = await transaction
    .insert(financeWalletLotCommitmentChain)
    .values({
      walletId: prepared.walletId,
      astrologerUserId: prepared.astrologerUserId,
      currency: "RUB",
      walletRevision: prepared.nextWalletRevision,
      walletHistoryId: history.id,
      operationReceiptId: prepared.receipt.receiptId,
      operationReceiptDigest: prepared.receipt.canonicalDigest,
      commitBindingId: binding.bindingId,
      commitBindingDigest: binding.bindingDigest
    })
    .returning({ id: financeWalletLotCommitmentChain.id });
  if (!lotCommitment) fail("persistence_write_incomplete");
  await afterWriteBoundary("lot_commitment_chain");

  return mapDatabaseIssuedWalletCommitReceipt(prepared, {
    ...binding,
    operationReceiptDigest: prepared.receipt.canonicalDigest
  });
}

async function lockWalletScope(
  transaction: FinanceTransaction,
  prepared: PreparedWalletJournalMutation
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`finance-wallet:${prepared.astrologerUserId}:RUB`}, 0))`
  );
}

async function lockBoundedLots(
  transaction: FinanceTransaction,
  prepared: PreparedWalletJournalMutation
): Promise<readonly PersistedPayableLotRow[]> {
  const ids = boundedLotLockIds(prepared);
  if (ids.length === 0) return Object.freeze([]);
  return transaction
    .select(payableLotSelection)
    .from(financePayableLots)
    .where(inArray(financePayableLots.lotId, ids))
    .orderBy(asc(financePayableLots.lotId))
    .for("update");
}

function boundedLotLockIds(prepared: PreparedWalletJournalMutation): string[] {
  const createdIds = new Set(prepared.transition.createdLots.map((lot) => lot.lotId));
  const ids = new Set<string>(createdIds);
  for (const lot of prepared.transition.consumedLots) {
    ids.add(lot.lotId);
    ids.add(lot.rootLotId);
    if (lot.parentLotId) ids.add(lot.parentLotId);
  }
  for (const lot of prepared.transition.createdLots) {
    ids.add(lot.rootLotId);
    if (lot.parentLotId) ids.add(lot.parentLotId);
  }
  for (const lineage of prepared.lineage) {
    if (lineage.relation === "referenced") ids.add(lineage.lotId);
  }
  if (ids.size > prepared.receiptDecoderEnvelope.maxLineage * 3) {
    fail("lot_lock_set_mismatch");
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function assertLockedLotSet(
  prepared: PreparedWalletJournalMutation,
  lockedRows: readonly PersistedPayableLotRow[],
  createdRows: readonly PersistedPayableLotRow[]
): void {
  const locked = new Map(lockedRows.map((row) => [row.lotId, row] as const));
  const createdIds = new Set(createdRows.map((row) => row.lotId));
  for (const createdId of createdIds) {
    if (locked.has(createdId)) fail("lot_lock_set_mismatch");
  }
  for (const consumed of prepared.transition.consumedLots) {
    const row = locked.get(consumed.lotId);
    if (!row) fail("lot_lock_set_mismatch");
    assertLockedLotMatchesTransition(prepared, consumed, row);
  }
  for (const lineage of prepared.lineage) {
    if (lineage.relation !== "referenced") continue;
    const row = locked.get(lineage.lotId);
    if (
      !row ||
      row.walletId !== prepared.walletId ||
      row.astrologerUserId !== prepared.astrologerUserId ||
      row.currency !== "RUB" ||
      row.rootLotId !== lineage.rootLotId
    ) {
      fail("lot_lock_set_mismatch");
    }
  }
  const createdById = new Map(createdRows.map((row) => [row.lotId, row] as const));
  for (const created of createdRows) {
    if (!created.parentLotId) continue;
    const parent = locked.get(created.parentLotId) ?? createdById.get(created.parentLotId);
    if (!parent) fail("lot_lock_set_mismatch");
    assertCreatedLotPreservesLockedParent(created, parent);
  }
}

async function assertLotsRemainActive(
  transaction: FinanceTransaction,
  prepared: PreparedWalletJournalMutation,
  lockedRows: readonly PersistedPayableLotRow[]
): Promise<void> {
  const mustBeActive = new Set<string>([
    ...prepared.transition.consumedLots.map((lot) => lot.lotId),
    ...prepared.lineage
      .filter((entry) => entry.relation === "referenced")
      .map((entry) => entry.lotId)
  ]);
  if (mustBeActive.size === 0) return;
  if ([...mustBeActive].some((id) => !lockedRows.some((row) => row.lotId === id))) {
    fail("lot_lock_set_mismatch");
  }
  const consumed = await transaction
    .select({ lotId: financePayableLotTransitions.lotId })
    .from(financePayableLotTransitions)
    .where(
      and(
        inArray(financePayableLotTransitions.lotId, [...mustBeActive].sort()),
        eq(financePayableLotTransitions.relation, "consumed")
      )
    )
    .limit(mustBeActive.size);
  if (consumed.length > 0) fail("lot_already_consumed");
}

async function resolveJournalSourceScope(
  transaction: FinanceTransaction,
  prepared: PreparedWalletJournalMutation
) {
  const providerIds = new Set<string>();
  const astrologerIds = new Set<string>();
  const refundPayoutPairs = new Set<string>();
  for (const entry of prepared.transaction.entries) {
    collectScope(entry.account, providerIds, astrologerIds, refundPayoutPairs);
  }
  if (providerIds.size > 1 || astrologerIds.size > 1 || refundPayoutPairs.size > 1) {
    fail("journal_source_scope_mismatch");
  }
  const astrologerUserId = [...astrologerIds][0] ?? null;
  if (astrologerUserId !== null && astrologerUserId !== prepared.astrologerUserId) {
    fail("journal_source_scope_mismatch");
  }
  const refundPayout = [...refundPayoutPairs][0]?.split("\u0000") ?? null;
  const providerAccountId = [...providerIds][0] ?? null;
  const providerAccount = providerAccountId
    ? await resolveProviderAccount(transaction, prepared, providerAccountId)
    : null;
  if (providerAccount && astrologerUserId && refundPayout) {
    return {
      kind: "provider_account_astrologer_refund_and_payout" as const,
      providerAccount,
      astrologerUserId,
      refundId: refundPayout[0]!,
      payoutRequestId: refundPayout[1]!
    };
  }
  if (providerAccount && astrologerUserId) {
    return { kind: "provider_account_and_astrologer" as const, providerAccount, astrologerUserId };
  }
  if (providerAccount && !astrologerUserId && !refundPayout) {
    return { kind: "provider_account" as const, providerAccount };
  }
  if (!providerAccount && astrologerUserId && !refundPayout) {
    return { kind: "astrologer" as const, astrologerUserId };
  }
  if (!providerAccount && !astrologerUserId && refundPayout) {
    return {
      kind: "refund_and_payout" as const,
      refundId: refundPayout[0]!,
      payoutRequestId: refundPayout[1]!
    };
  }
  if (!providerAccount && !astrologerUserId && !refundPayout) {
    return { kind: "internal" as const };
  }
  fail("journal_source_scope_mismatch");
}

function collectScope(
  account: FinanceLedgerAccountRef,
  providerIds: Set<string>,
  astrologerIds: Set<string>,
  refundPayoutPairs: Set<string>
): void {
  if ("bankCashPoolId" in account) fail("journal_source_scope_mismatch");
  if ("arcProviderAccountId" in account) providerIds.add(account.arcProviderAccountId);
  if ("astrologerUserId" in account) astrologerIds.add(account.astrologerUserId);
  if ("refundId" in account) {
    refundPayoutPairs.add(`${account.refundId}\u0000${account.payoutRequestId}`);
  }
}

async function resolveProviderAccount(
  transaction: FinanceTransaction,
  prepared: PreparedWalletJournalMutation,
  providerAccountId: string
) {
  const transitionProvider = deriveExactTransitionProviderIdentity(
    [...prepared.transition.consumedLots, ...prepared.transition.createdLots].map(
      (lot) => lot.captureSource.paymentIntent.providerAccount
    ),
    providerAccountId
  );
  const rows = await transaction
    .select({
      versionId: financeProviderAccounts.id,
      seriesId: financeProviderAccounts.seriesId,
      providerAccountId: financeProviderAccounts.providerAccountId,
      identityVersion: financeProviderAccounts.identityVersion
    })
    .from(financeProviderAccounts)
    .where(exactProviderAccountPredicate(transitionProvider))
    .limit(2);
  if (rows.length !== 1 || !rows[0]) fail("provider_identity_mismatch");
  if (
    transitionProvider.providerAccountId !== rows[0].providerAccountId ||
    transitionProvider.seriesId !== rows[0].seriesId ||
    transitionProvider.identityVersion !== rows[0].identityVersion
  ) {
    fail("provider_identity_mismatch");
  }
  return Object.freeze(rows[0]);
}

/** Internal deterministic seam: all source lots must bind one provider identity before DB access. */
export function deriveExactTransitionProviderIdentity(
  candidates: readonly FinanceProviderAccountIdentity[],
  ledgerProviderAccountId: string
): FinanceProviderAccountIdentity {
  const expected = candidates[0];
  if (!expected || expected.providerAccountId !== ledgerProviderAccountId) {
    fail("provider_identity_mismatch");
  }
  if (
    candidates.some(
      (candidate) =>
        candidate.seriesId !== expected.seriesId ||
        candidate.providerAccountId !== expected.providerAccountId ||
        candidate.identityVersion !== expected.identityVersion
    )
  ) {
    fail("provider_identity_mismatch");
  }
  return Object.freeze({ ...expected });
}

/** Internal deterministic seam used to prevent account-id-only provider resolution. */
export function exactProviderAccountPredicate(identity: FinanceProviderAccountIdentity) {
  return and(
    eq(financeProviderAccounts.seriesId, identity.seriesId),
    eq(financeProviderAccounts.providerAccountId, identity.providerAccountId),
    eq(financeProviderAccounts.identityVersion, identity.identityVersion)
  );
}

/** PostgreSQL owns this identity and issues it from the same transaction as every wallet write. */
export async function issuePersistenceTransactionBoundaryRef(
  transaction: FinanceTransaction
): Promise<string> {
  const result = await transaction.execute<{ persistenceTransactionBoundaryRef: string }>(
    sql`select 'postgres-xid:' || txid_current()::text as "persistenceTransactionBoundaryRef"`
  );
  const boundaryRef = result.rows[0]?.persistenceTransactionBoundaryRef;
  if (typeof boundaryRef !== "string" || !/^postgres-xid:[0-9]+$/.test(boundaryRef)) {
    fail("persistence_write_incomplete");
  }
  return boundaryRef;
}

const walletHeadSelection = {
  id: financeWalletHeads.id,
  astrologerUserId: financeWalletHeads.astrologerUserId,
  currency: financeWalletHeads.currency,
  revision: financeWalletHeads.revision,
  mutationSequence: financeWalletHeads.mutationSequence,
  pendingMinor: financeWalletHeads.pendingMinor,
  availableMinor: financeWalletHeads.availableMinor,
  reservedMinor: financeWalletHeads.reservedMinor,
  payoutPendingMinor: financeWalletHeads.payoutPendingMinor,
  refundPendingMinor: financeWalletHeads.refundPendingMinor,
  recoveryReceivableMinor: financeWalletHeads.recoveryReceivableMinor,
  lotStateVersion: financeWalletHeads.lotStateVersion,
  lotStateDigest: financeWalletHeads.lotStateDigest,
  snapshotDigest: financeWalletHeads.snapshotDigest,
  lastOperationId: financeWalletHeads.lastOperationId,
  lastCommitBindingId: financeWalletHeads.lastCommitBindingId
} satisfies Record<keyof PersistedWalletHeadRow, unknown>;

const payableLotSelection = {
  lotId: financePayableLots.lotId,
  walletId: financePayableLots.walletId,
  astrologerUserId: financePayableLots.astrologerUserId,
  currency: financePayableLots.currency,
  rootLotId: financePayableLots.rootLotId,
  parentLotId: financePayableLots.parentLotId,
  lineageDepth: financePayableLots.lineageDepth,
  originalSaleId: financePayableLots.originalSaleId,
  amountMinor: financePayableLots.amountMinor,
  bucket: financePayableLots.bucket,
  capturedAt: financePayableLots.capturedAt,
  createdAt: financePayableLots.createdAt,
  becameAvailableAt: financePayableLots.becameAvailableAt,
  createdByOperationId: financePayableLots.createdByOperationId,
  createdByReceiptId: financePayableLots.createdByReceiptId,
  createdEffectId: financePayableLots.createdEffectId,
  componentSlotId: financePayableLots.componentSlotId,
  captureIntentId: financePayableLots.captureIntentId,
  captureSessionId: financePayableLots.captureSessionId,
  providerAccountSeriesId: financePayableLots.providerAccountSeriesId,
  providerAccountId: financePayableLots.providerAccountId,
  providerIdentityVersion: financePayableLots.providerIdentityVersion,
  providerPaymentId: financePayableLots.providerPaymentId,
  canonicalCaptureEvidenceId: financePayableLots.canonicalCaptureEvidenceId,
  captureAmountMinor: financePayableLots.captureAmountMinor,
  captureCurrency: financePayableLots.captureCurrency,
  captureEvidenceAuthorityKind: financePayableLots.captureEvidenceAuthorityKind,
  captureEvidenceAuthorityId: financePayableLots.captureEvidenceAuthorityId,
  captureEvidenceArtifactId: financePayableLots.captureEvidenceArtifactId,
  captureEvidenceArtifactDigest: financePayableLots.captureEvidenceArtifactDigest,
  economicsSnapshotDigest: financePayableLots.economicsSnapshotDigest,
  riskPolicyId: financePayableLots.riskPolicyId,
  riskPolicyVersion: financePayableLots.riskPolicyVersion,
  riskPolicyDigest: financePayableLots.riskPolicyDigest,
  fulfillmentDecisionId: financePayableLots.fulfillmentDecisionId,
  fulfillmentDecisionVersion: financePayableLots.fulfillmentDecisionVersion,
  fulfillmentDecisionDigest: financePayableLots.fulfillmentDecisionDigest,
  payoutRequestId: financePayableLots.payoutRequestId,
  payoutAllocationId: financePayableLots.payoutAllocationId,
  refundId: financePayableLots.refundId
} satisfies Record<keyof PersistedPayableLotRow, unknown>;

function databaseInstant(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail("persistence_write_incomplete");
  return parsed;
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail("invalid_database_identity");
  }
}

function postgresCode(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<object>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function noFailureInjection(): void {}

function fail(reason: SealedWalletJournalCommitPersistenceReason): never {
  throw new SealedWalletJournalCommitPersistenceError(reason);
}
