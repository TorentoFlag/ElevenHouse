import {
  createLosslessSettlementEntry,
  createLosslessSettlementPayout,
  createProviderAccountIdentityBinding,
  createSettlementPageCheckpointKey,
  digestFinanceCanonicalValueV1,
  serializeSettlementPageCheckpointKey,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type FinanceSettlementStream,
  type IngestVerifiedSettlementPageCommand,
  type LosslessSettlementEntry,
  type LosslessSettlementPayout,
  type RawProviderArtifactRef,
  type ResolvedFinanceOperationEnvelope,
  type SettlementBatchIngestionCommitReceipt,
  type SettlementBatchIngestionUnitOfWork,
  type SettlementCursorLeaseReceipt,
  type SettlementPageCheckpointIdentity,
  type VerifiedSettlementPageBundle
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeArtifactTombstones,
  financeArtifacts
} from "../../schema/finance/finance-artifacts.schema";
import {
  financeSettlementBatchIngestionCommitReceipts,
  financeSettlementCursors,
  financeSettlementLedgerEntries,
  financeSettlementLedgerPageEntries,
  financeSettlementPageCheckpoints,
  financeSettlementPages,
  financeSettlementPayoutPageEntries,
  financeSettlementPayouts
} from "../../schema/finance/settlement.schema";
import {
  decodeFinancePositiveRevision,
  decodeFinanceUnsignedRevision,
  encodeFinanceNumeric38
} from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export const settlementBatchIngestionWriteBoundaryValues = Object.freeze([
  "settlement_page",
  "normalized_entries",
  "settlement_checkpoint",
  "settlement_cursor",
  "ingestion_receipt"
] as const);

export type SettlementBatchIngestionWriteBoundary =
  (typeof settlementBatchIngestionWriteBoundaryValues)[number];

export type SettlementBatchIngestionFailureInjector = (
  boundary: SettlementBatchIngestionWriteBoundary
) => void | Promise<void>;

export type SettlementBatchIngestionPersistenceReason =
  | "invalid_command"
  | "invalid_verified_bundle"
  | "artifact_binding_conflict"
  | "artifact_tombstoned"
  | "cursor_not_found"
  | "cursor_version_conflict"
  | "lease_credential_conflict"
  | "lease_expired"
  | "cursor_window_conflict"
  | "checkpoint_conflict"
  | "pagination_cycle_detected"
  | "provider_entry_identity_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SettlementBatchIngestionPersistenceError extends Error {
  readonly code = "settlement_batch_ingestion_persistence_error";

  constructor(readonly reason: SettlementBatchIngestionPersistenceReason) {
    super("Verified settlement page could not be committed atomically");
    this.name = "SettlementBatchIngestionPersistenceError";
  }
}

export function createDrizzleSettlementBatchIngestionUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly afterWriteBoundary?: SettlementBatchIngestionFailureInjector;
}): SettlementBatchIngestionUnitOfWork {
  const unitOfWork = {
    async ingestVerifiedPage(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          ingestInTransaction(
            transaction,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof SettlementBatchIngestionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("checkpoint_conflict");
        throw error;
      }
    }
  } satisfies SettlementBatchIngestionUnitOfWork;
  return Object.freeze(unitOfWork);
}

type NormalizedBundleBase = Readonly<{
  providerAccount: FinanceProviderAccountIdentity;
  checkpointIdentity: SettlementPageCheckpointIdentity;
  serializedCheckpointIdentity: string;
  rawArtifact: RawProviderArtifactRef;
  decodedEntriesDigest: FinanceDigest;
  fetchedAt: Date;
  verifiedAt: Date;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
  nextCursor: string | null;
  returnedCount: number;
}>;

type NormalizedBundle =
  | Readonly<
      NormalizedBundleBase & {
        stream: "settlement_ledger";
        rows: readonly LosslessSettlementEntry[];
      }
    >
  | Readonly<
      NormalizedBundleBase & {
        stream: "settlement_payouts";
        rows: readonly LosslessSettlementPayout[];
      }
    >;

type NormalizedCommand = Readonly<{
  expectedCursorVersion: number;
  lease: Readonly<{
    cursorKey: SettlementCursorLeaseReceipt["cursorKey"];
    cursorVersion: number;
    leaseOwnerId: string;
    leaseToken: string;
    leaseTokenDigest: FinanceDigest;
    fencingToken: number;
  }>;
  bundle: NormalizedBundle;
}>;

async function ingestInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  afterWriteBoundary: SettlementBatchIngestionFailureInjector
): Promise<SettlementBatchIngestionCommitReceipt> {
  const cursor = await lockCursor(transaction, command.bundle);
  const databaseNow = await readDatabaseClock(transaction);
  assertLease(cursor, command, databaseNow);
  await validateExactArtifact(transaction, command.bundle);

  const existingCheckpoint = await readExistingCheckpoint(transaction, cursor.id, command.bundle);
  if (existingCheckpoint) {
    return replayExistingCheckpoint(transaction, cursor, command, existingCheckpoint);
  }
  assertExpectedVersion(cursor.version, command.expectedCursorVersion);
  assertCursorWindow(cursor, command.bundle);
  await assertNextCursorHasNotBeenCheckpointed(transaction, cursor.id, command.bundle);

  const [page] = await transaction
    .insert(financeSettlementPages)
    .values({
      settlementCursorId: cursor.id,
      providerAccountSeriesId: command.bundle.providerAccount.seriesId,
      providerAccountId: command.bundle.providerAccount.providerAccountId,
      providerIdentityVersion: command.bundle.providerAccount.identityVersion,
      stream: command.bundle.stream,
      windowGeneration: String(command.bundle.checkpointIdentity.windowGeneration),
      windowStart: validDate(cursor.activeWindowStart),
      windowEnd: validDate(cursor.activeWindowEnd),
      checkpointIdentity: command.bundle.serializedCheckpointIdentity,
      providerPageCursor: command.bundle.checkpointIdentity.providerPageCursor,
      nextPageCursor: command.bundle.nextCursor,
      rawArtifactId: command.bundle.rawArtifact.artifactId,
      rawArtifactDigest: command.bundle.rawArtifact.sha256Digest,
      rawArtifactByteLength: String(command.bundle.rawArtifact.byteLength),
      decodedEntriesDigest: command.bundle.decodedEntriesDigest,
      returnedCount: command.bundle.returnedCount,
      operationPolicyId: command.bundle.operationEnvelope.policyId,
      operationPolicyVersion: command.bundle.operationEnvelope.policyVersion,
      operationPolicyDigest: command.bundle.operationEnvelope.policyDigest,
      maximumRows: command.bundle.operationEnvelope.maximumRows,
      maximumDecimalDigits: command.bundle.operationEnvelope.maximumDecimalDigits,
      maximumArtifactBytes: String(command.bundle.operationEnvelope.maximumArtifactBytes),
      fetchedAt: command.bundle.fetchedAt,
      verifiedAt: command.bundle.verifiedAt,
      committedAt: databaseNow
    })
    .returning({ id: financeSettlementPages.id });
  if (!page) fail("persistence_write_incomplete");
  await afterWriteBoundary("settlement_page");

  const counts =
    command.bundle.stream === "settlement_ledger"
      ? await persistLedgerRows(transaction, page.id, command.bundle.rows, databaseNow)
      : await persistPayoutRows(transaction, page.id, command.bundle.rows, databaseNow);
  await afterWriteBoundary("normalized_entries");

  const nextCursorVersion = command.expectedCursorVersion + 1;
  const [checkpoint] = await transaction
    .insert(financeSettlementPageCheckpoints)
    .values({
      settlementCursorId: cursor.id,
      windowGeneration: String(command.bundle.checkpointIdentity.windowGeneration),
      checkpointIdentity: command.bundle.serializedCheckpointIdentity,
      providerPageCursor: command.bundle.checkpointIdentity.providerPageCursor,
      nextPageCursor: command.bundle.nextCursor,
      settlementPageId: page.id,
      fencingToken: String(command.lease.fencingToken),
      cursorVersionBefore: String(command.expectedCursorVersion),
      cursorVersionAfter: String(nextCursorVersion),
      committedAt: databaseNow
    })
    .returning({ id: financeSettlementPageCheckpoints.id });
  if (!checkpoint) fail("persistence_write_incomplete");
  await afterWriteBoundary("settlement_checkpoint");

  const checkpointedPageCount = cursor.checkpointedPageCount + 1;
  const cursorPatch =
    command.bundle.nextCursor === null
      ? {
          highWaterMark: validDate(cursor.activeWindowEnd),
          activeWindowStart: null,
          activeWindowEnd: null,
          nextPageCursor: null,
          checkpointedPageCount: 0,
          maxPageCount: null
        }
      : {
          nextPageCursor: command.bundle.nextCursor,
          checkpointedPageCount
        };
  const [updatedCursor] = await transaction
    .update(financeSettlementCursors)
    .set({
      ...cursorPatch,
      version: String(nextCursorVersion),
      updatedAt: databaseNow
    })
    .where(
      and(
        eq(financeSettlementCursors.id, cursor.id),
        eq(financeSettlementCursors.version, String(command.expectedCursorVersion)),
        eq(financeSettlementCursors.fencingToken, String(command.lease.fencingToken)),
        eq(financeSettlementCursors.leaseOwnerId, command.lease.leaseOwnerId),
        eq(financeSettlementCursors.leaseTokenDigest, command.lease.leaseTokenDigest)
      )
    )
    .returning({ version: financeSettlementCursors.version });
  if (!updatedCursor || safePositiveVersion(updatedCursor.version) !== nextCursorVersion) {
    fail("cursor_version_conflict");
  }
  await afterWriteBoundary("settlement_cursor");

  const [receipt] = await transaction
    .insert(financeSettlementBatchIngestionCommitReceipts)
    .values({
      settlementPageId: page.id,
      settlementCheckpointId: checkpoint.id,
      settlementCursorId: cursor.id,
      providerAccountSeriesId: command.bundle.providerAccount.seriesId,
      providerAccountId: command.bundle.providerAccount.providerAccountId,
      providerIdentityVersion: command.bundle.providerAccount.identityVersion,
      stream: command.bundle.stream,
      windowGeneration: String(command.bundle.checkpointIdentity.windowGeneration),
      checkpointIdentity: command.bundle.serializedCheckpointIdentity,
      providerPageCursor: command.bundle.checkpointIdentity.providerPageCursor,
      rawArtifactId: command.bundle.rawArtifact.artifactId,
      rawArtifactDigest: command.bundle.rawArtifact.sha256Digest,
      rawArtifactByteLength: String(command.bundle.rawArtifact.byteLength),
      decodedEntriesDigest: command.bundle.decodedEntriesDigest,
      insertedEntryCount: counts.inserted,
      replayedEntryCount: counts.replayed,
      cursorVersion: String(nextCursorVersion),
      fencingToken: String(command.lease.fencingToken)
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("ingestion_receipt");
  return mapReceipt(receipt, command.bundle);
}

async function persistLedgerRows<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  pageId: string,
  rows: readonly LosslessSettlementEntry[],
  databaseNow: Date
): Promise<Readonly<{ inserted: number; replayed: number }>> {
  let inserted = 0;
  for (const [rowIndex, row] of rows.entries()) {
    const [created] = await transaction
      .insert(financeSettlementLedgerEntries)
      .values({
        providerAccountSeriesId: row.key.providerAccount.seriesId,
        providerAccountId: row.key.providerAccount.providerAccountId,
        providerIdentityVersion: row.key.providerAccount.identityVersion,
        providerEntryId: row.key.providerEntryId,
        firstSeenPageId: pageId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        direction: row.direction,
        entryType: row.entryType,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        feeAmountMinor: row.feeAmountMinor,
        balanceAfterMinor: row.balanceAfterMinor,
        occurredAt: row.occurredAt,
        organizationId: row.organizationId,
        terminalId: row.terminalId,
        bankTerminalId: row.bankTerminalId,
        bankCode: row.bankCode,
        bankRrn: row.bankRrn,
        bankAuthCode: row.bankAuthCode,
        bankInternalReference: row.bankInternalReference,
        settlementStatus: row.settlementStatus,
        rawPayloadDigest: row.rawPayloadDigest,
        firstSeenAt: databaseNow
      })
      .onConflictDoNothing({
        target: [
          financeSettlementLedgerEntries.providerAccountSeriesId,
          financeSettlementLedgerEntries.providerAccountId,
          financeSettlementLedgerEntries.providerIdentityVersion,
          financeSettlementLedgerEntries.providerEntryId
        ]
      })
      .returning({ id: financeSettlementLedgerEntries.id });
    const entryId = created?.id ?? (await loadEqualLedgerRow(transaction, row));
    if (created) inserted += 1;
    await transaction.insert(financeSettlementLedgerPageEntries).values({
      settlementPageId: pageId,
      settlementEntryId: entryId,
      stream: "settlement_ledger",
      rowIndex,
      linkedAt: databaseNow
    });
  }
  return Object.freeze({ inserted, replayed: rows.length - inserted });
}

async function persistPayoutRows<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  pageId: string,
  rows: readonly LosslessSettlementPayout[],
  databaseNow: Date
): Promise<Readonly<{ inserted: number; replayed: number }>> {
  let inserted = 0;
  for (const [rowIndex, row] of rows.entries()) {
    const [created] = await transaction
      .insert(financeSettlementPayouts)
      .values({
        providerAccountSeriesId: row.key.providerAccount.seriesId,
        providerAccountId: row.key.providerAccount.providerAccountId,
        providerIdentityVersion: row.key.providerAccount.identityVersion,
        merchantPayoutId: row.key.providerPayoutId,
        firstSeenPageId: pageId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        status: row.status,
        payoutMethod: row.payoutMethod,
        bankCode: row.bankCode,
        bankTerminalId: row.bankTerminalId,
        providerBankPayoutId: row.providerBankPayoutId,
        bankPayoutStatus: row.bankPayoutStatus,
        initiatedAt: row.initiatedAt,
        completedAt: row.completedAt,
        failedReason: row.failedReason,
        rawPayloadDigest: row.rawPayloadDigest,
        firstSeenAt: databaseNow
      })
      .onConflictDoNothing({
        target: [
          financeSettlementPayouts.providerAccountSeriesId,
          financeSettlementPayouts.providerAccountId,
          financeSettlementPayouts.providerIdentityVersion,
          financeSettlementPayouts.merchantPayoutId
        ]
      })
      .returning({ id: financeSettlementPayouts.id });
    const payoutId = created?.id ?? (await loadEqualPayoutRow(transaction, row));
    if (created) inserted += 1;
    await transaction.insert(financeSettlementPayoutPageEntries).values({
      settlementPageId: pageId,
      settlementPayoutId: payoutId,
      stream: "settlement_payouts",
      rowIndex,
      linkedAt: databaseNow
    });
  }
  return Object.freeze({ inserted, replayed: rows.length - inserted });
}

async function loadEqualLedgerRow<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  expected: LosslessSettlementEntry
): Promise<string> {
  const [row] = await transaction
    .select()
    .from(financeSettlementLedgerEntries)
    .where(
      and(
        eq(
          financeSettlementLedgerEntries.providerAccountSeriesId,
          expected.key.providerAccount.seriesId
        ),
        eq(
          financeSettlementLedgerEntries.providerAccountId,
          expected.key.providerAccount.providerAccountId
        ),
        eq(
          financeSettlementLedgerEntries.providerIdentityVersion,
          expected.key.providerAccount.identityVersion
        ),
        eq(financeSettlementLedgerEntries.providerEntryId, expected.key.providerEntryId)
      )
    )
    .limit(1)
    .for("share");
  if (!row || !sameLedgerRow(row, expected)) fail("provider_entry_identity_conflict");
  return row.id;
}

async function loadEqualPayoutRow<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  expected: LosslessSettlementPayout
): Promise<string> {
  const [row] = await transaction
    .select()
    .from(financeSettlementPayouts)
    .where(
      and(
        eq(financeSettlementPayouts.providerAccountSeriesId, expected.key.providerAccount.seriesId),
        eq(
          financeSettlementPayouts.providerAccountId,
          expected.key.providerAccount.providerAccountId
        ),
        eq(
          financeSettlementPayouts.providerIdentityVersion,
          expected.key.providerAccount.identityVersion
        ),
        eq(financeSettlementPayouts.merchantPayoutId, expected.key.providerPayoutId)
      )
    )
    .limit(1)
    .for("share");
  if (!row || !samePayoutRow(row, expected)) fail("provider_entry_identity_conflict");
  return row.id;
}

async function lockCursor<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  bundle: NormalizedBundle
): Promise<typeof financeSettlementCursors.$inferSelect> {
  const [row] = await transaction
    .select()
    .from(financeSettlementCursors)
    .where(
      and(
        eq(financeSettlementCursors.providerAccountSeriesId, bundle.providerAccount.seriesId),
        eq(financeSettlementCursors.providerAccountId, bundle.providerAccount.providerAccountId),
        eq(
          financeSettlementCursors.providerIdentityVersion,
          bundle.providerAccount.identityVersion
        ),
        eq(financeSettlementCursors.stream, bundle.stream)
      )
    )
    .limit(1)
    .for("update");
  if (!row) fail("cursor_not_found");
  return row;
}

function assertLease(
  cursor: typeof financeSettlementCursors.$inferSelect,
  command: NormalizedCommand,
  databaseNow: Date
): void {
  if (
    cursor.leaseOwnerId !== command.lease.leaseOwnerId ||
    cursor.leaseTokenDigest !== command.lease.leaseTokenDigest ||
    safeUnsignedVersion(cursor.fencingToken) !== command.lease.fencingToken ||
    cursor.leaseClaimedAt === null ||
    cursor.leaseExpiresAt === null
  ) {
    fail("lease_credential_conflict");
  }
  if (cursor.leaseExpiresAt.getTime() <= databaseNow.getTime()) fail("lease_expired");
}

function assertCursorWindow(
  cursor: typeof financeSettlementCursors.$inferSelect,
  bundle: NormalizedBundle
): void {
  if (
    cursor.activeWindowStart === null ||
    cursor.activeWindowEnd === null ||
    cursor.maxPageCount === null ||
    safeUnsignedVersion(cursor.windowGeneration) !== bundle.checkpointIdentity.windowGeneration ||
    cursor.nextPageCursor !== bundle.checkpointIdentity.providerPageCursor ||
    cursor.checkpointedPageCount >= cursor.maxPageCount ||
    (bundle.nextCursor !== null && cursor.checkpointedPageCount + 1 >= cursor.maxPageCount)
  ) {
    fail("cursor_window_conflict");
  }
}

async function validateExactArtifact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  bundle: NormalizedBundle
): Promise<void> {
  const [artifact] = await transaction
    .select({
      artifactClass: financeArtifacts.artifactClass,
      bindingKind: financeArtifacts.bindingKind,
      seriesId: financeArtifacts.seriesId,
      providerAccountId: financeArtifacts.providerAccountId,
      providerIdentityVersion: financeArtifacts.providerIdentityVersion,
      sha256Digest: financeArtifacts.sha256Digest,
      byteLength: financeArtifacts.byteLength
    })
    .from(financeArtifacts)
    .where(eq(financeArtifacts.id, bundle.rawArtifact.artifactId))
    .limit(1)
    .for("share");
  if (
    !artifact ||
    artifact.artifactClass !== "provider_settlement_page" ||
    artifact.bindingKind !== "provider" ||
    artifact.seriesId !== bundle.providerAccount.seriesId ||
    artifact.providerAccountId !== bundle.providerAccount.providerAccountId ||
    artifact.providerIdentityVersion !== bundle.providerAccount.identityVersion ||
    artifact.sha256Digest !== bundle.rawArtifact.sha256Digest ||
    encodeFinanceNumeric38(artifact.byteLength) !== String(bundle.rawArtifact.byteLength)
  ) {
    fail("artifact_binding_conflict");
  }
  const [tombstone] = await transaction
    .select({ artifactId: financeArtifactTombstones.artifactId })
    .from(financeArtifactTombstones)
    .where(eq(financeArtifactTombstones.artifactId, bundle.rawArtifact.artifactId))
    .limit(1)
    .for("share");
  if (tombstone) fail("artifact_tombstoned");
}

async function readExistingCheckpoint<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  cursorId: string,
  bundle: NormalizedBundle
): Promise<typeof financeSettlementPageCheckpoints.$inferSelect | undefined> {
  const [checkpoint] = await transaction
    .select()
    .from(financeSettlementPageCheckpoints)
    .where(
      and(
        eq(financeSettlementPageCheckpoints.settlementCursorId, cursorId),
        eq(
          financeSettlementPageCheckpoints.windowGeneration,
          String(bundle.checkpointIdentity.windowGeneration)
        ),
        eq(financeSettlementPageCheckpoints.checkpointIdentity, bundle.serializedCheckpointIdentity)
      )
    )
    .limit(1)
    .for("share");
  return checkpoint;
}

async function assertNextCursorHasNotBeenCheckpointed<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  cursorId: string,
  bundle: NormalizedBundle
): Promise<void> {
  if (bundle.nextCursor === null) return;
  const nextIdentity = serializeSettlementPageCheckpointKey(
    createSettlementPageCheckpointKey({
      cursorKey: bundle.checkpointIdentity.cursorKey,
      windowGeneration: bundle.checkpointIdentity.windowGeneration,
      providerPageCursor: bundle.nextCursor
    })
  );
  const [cycle] = await transaction
    .select({ id: financeSettlementPageCheckpoints.id })
    .from(financeSettlementPageCheckpoints)
    .where(
      and(
        eq(financeSettlementPageCheckpoints.settlementCursorId, cursorId),
        eq(
          financeSettlementPageCheckpoints.windowGeneration,
          String(bundle.checkpointIdentity.windowGeneration)
        ),
        eq(financeSettlementPageCheckpoints.checkpointIdentity, nextIdentity)
      )
    )
    .limit(1)
    .for("share");
  if (cycle) fail("pagination_cycle_detected");
}

async function replayExistingCheckpoint<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  cursor: typeof financeSettlementCursors.$inferSelect,
  command: NormalizedCommand,
  checkpoint: typeof financeSettlementPageCheckpoints.$inferSelect
): Promise<SettlementBatchIngestionCommitReceipt> {
  const currentVersion = safePositiveVersion(cursor.version);
  const versionAfter = safePositiveVersion(checkpoint.cursorVersionAfter);
  const versionBefore = safePositiveVersion(checkpoint.cursorVersionBefore);
  if (
    currentVersion !== versionAfter ||
    command.expectedCursorVersion !== versionBefore ||
    checkpoint.fencingToken !== String(command.lease.fencingToken)
  ) {
    fail("pagination_cycle_detected");
  }
  const [page] = await transaction
    .select()
    .from(financeSettlementPages)
    .where(eq(financeSettlementPages.id, checkpoint.settlementPageId))
    .limit(1)
    .for("share");
  const [receipt] = await transaction
    .select()
    .from(financeSettlementBatchIngestionCommitReceipts)
    .where(eq(financeSettlementBatchIngestionCommitReceipts.settlementCheckpointId, checkpoint.id))
    .limit(1)
    .for("share");
  if (!page || !receipt || !samePage(page, command.bundle)) fail("checkpoint_conflict");
  return mapReceipt(receipt, command.bundle);
}

function mapReceipt(
  row: typeof financeSettlementBatchIngestionCommitReceipts.$inferSelect,
  bundle: NormalizedBundle
): SettlementBatchIngestionCommitReceipt {
  const providerAccount = createProviderAccountIdentityBinding({
    seriesId: row.providerAccountSeriesId,
    providerAccountId: row.providerAccountId,
    identityVersion: row.providerIdentityVersion
  });
  if (
    row.receiptVersion !== 1 ||
    !digestPattern.test(row.canonicalDigest) ||
    !digestPattern.test(row.rawArtifactDigest) ||
    !digestPattern.test(row.decodedEntriesDigest) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !sameProvider(providerAccount, bundle.providerAccount) ||
    row.stream !== bundle.stream ||
    row.windowGeneration !== String(bundle.checkpointIdentity.windowGeneration) ||
    row.checkpointIdentity !== bundle.serializedCheckpointIdentity ||
    row.providerPageCursor !== bundle.checkpointIdentity.providerPageCursor ||
    row.rawArtifactId !== bundle.rawArtifact.artifactId ||
    row.rawArtifactDigest !== bundle.rawArtifact.sha256Digest ||
    row.rawArtifactByteLength !== String(bundle.rawArtifact.byteLength) ||
    row.decodedEntriesDigest !== bundle.decodedEntriesDigest ||
    row.insertedEntryCount + row.replayedEntryCount !== bundle.returnedCount
  ) {
    fail("persistence_write_incomplete");
  }
  const receipt = Object.freeze({
    ref: Object.freeze({
      kind: "settlement_batch_ingestion_commit_receipt" as const,
      receiptId: row.receiptId,
      version: 1 as const,
      canonicalDigest: row.canonicalDigest as FinanceDigest
    }),
    providerAccount,
    stream: bundle.stream,
    checkpointIdentity: bundle.checkpointIdentity,
    rawArtifact: bundle.rawArtifact,
    decodedEntriesDigest: row.decodedEntriesDigest as FinanceDigest,
    insertedEntryCount: nonNegativeSafeInteger(row.insertedEntryCount),
    replayedEntryCount: nonNegativeSafeInteger(row.replayedEntryCount),
    cursorVersion: safePositiveVersion(row.cursorVersion),
    fencingToken: safePositiveVersion(row.fencingToken),
    databaseCommittedAt: validDate(row.databaseCommittedAt).toISOString(),
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef
  });
  return receipt as SettlementBatchIngestionCommitReceipt;
}

function normalizeCommand(command: IngestVerifiedSettlementPageCommand): NormalizedCommand {
  try {
    assertExactOwnDataKeys(command, ["expectedCursorVersion", "lease", "pageBundle"]);
    const bundle = normalizeBundle(command.pageBundle);
    const lease = normalizeLease(command.lease);
    if (
      lease.cursorKey.stream !== bundle.stream ||
      !sameProvider(lease.cursorKey.providerAccount, bundle.providerAccount)
    ) {
      fail("invalid_command");
    }
    return Object.freeze({
      expectedCursorVersion: positiveSafeInteger(command.expectedCursorVersion),
      lease,
      bundle
    });
  } catch (error) {
    if (error instanceof SettlementBatchIngestionPersistenceError) throw error;
    fail("invalid_command");
  }
}

function normalizeBundle(bundle: VerifiedSettlementPageBundle): NormalizedBundle {
  assertExactOwnDataKeys(bundle, [
    "kind",
    "providerAccount",
    "checkpointIdentity",
    "rawArtifact",
    "decodedEntriesDigest",
    "pageEvidence",
    "verifiedAt",
    "stream",
    "normalizedEntries"
  ]);
  if (bundle.kind !== "verified_settlement_page_bundle") fail("invalid_verified_bundle");
  const providerAccount = createProviderAccountIdentityBinding(bundle.providerAccount);
  const checkpointIdentity = createSettlementPageCheckpointKey(bundle.checkpointIdentity);
  const stream = settlementStream(bundle.stream);
  if (
    checkpointIdentity.cursorKey.stream !== stream ||
    !sameProvider(checkpointIdentity.cursorKey.providerAccount, providerAccount)
  ) {
    fail("invalid_verified_bundle");
  }
  const rawArtifact = normalizeArtifactRef(bundle.rawArtifact);
  const pageEvidence = normalizePageEvidence(bundle.pageEvidence);
  if (
    pageEvidence.stream !== stream ||
    pageEvidence.windowGeneration !== checkpointIdentity.windowGeneration ||
    pageEvidence.providerPageCursor !== checkpointIdentity.providerPageCursor ||
    !sameProvider(pageEvidence.providerAccount, providerAccount) ||
    !sameArtifact(pageEvidence.artifact, rawArtifact)
  ) {
    fail("invalid_verified_bundle");
  }
  const normalizedPage = normalizePage(bundle.normalizedEntries);
  const rows =
    stream === "settlement_ledger"
      ? normalizedPage.rows.map((row) => createLosslessSettlementEntry(row))
      : normalizedPage.rows.map((row) => createLosslessSettlementPayout(row));
  assertUniqueNaturalKeys(rows, stream);
  for (const row of rows) {
    if (!sameProvider(row.key.providerAccount, providerAccount)) fail("invalid_verified_bundle");
  }
  if (
    normalizedPage.returnedCount !== rows.length ||
    rows.length > normalizedPage.operationEnvelope.maximumRows ||
    rawArtifact.byteLength > normalizedPage.operationEnvelope.maximumArtifactBytes ||
    (normalizedPage.nextCursor !== null &&
      normalizedPage.nextCursor === checkpointIdentity.providerPageCursor) ||
    bundle.decodedEntriesDigest !== digestFinanceCanonicalValueV1(rows)
  ) {
    fail("invalid_verified_bundle");
  }
  const fetchedAt = pageEvidence.fetchedAt;
  const verifiedAt = instant(bundle.verifiedAt);
  if (verifiedAt.getTime() < fetchedAt.getTime()) fail("invalid_verified_bundle");
  const base = {
    providerAccount,
    checkpointIdentity,
    serializedCheckpointIdentity: serializeSettlementPageCheckpointKey(checkpointIdentity),
    rawArtifact,
    decodedEntriesDigest: digest(bundle.decodedEntriesDigest),
    fetchedAt,
    verifiedAt,
    operationEnvelope: normalizedPage.operationEnvelope,
    nextCursor: normalizedPage.nextCursor,
    returnedCount: normalizedPage.returnedCount
  };
  return stream === "settlement_ledger"
    ? Object.freeze({ ...base, stream, rows: rows as readonly LosslessSettlementEntry[] })
    : Object.freeze({ ...base, stream, rows: rows as readonly LosslessSettlementPayout[] });
}

function normalizePage(input: VerifiedSettlementPageBundle["normalizedEntries"]): Readonly<{
  rows: readonly unknown[];
  nextCursor: string | null;
  returnedCount: number;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}> {
  assertExactOwnDataKeys(input, ["rows", "nextCursor", "returnedCount", "operationEnvelope"]);
  if (!Array.isArray(input.rows)) fail("invalid_verified_bundle");
  const nextCursor = input.nextCursor === null ? null : identifier(input.nextCursor, 1_000);
  const returnedCount = nonNegativeSafeInteger(input.returnedCount);
  const operationEnvelope = normalizeEnvelope(input.operationEnvelope);
  return Object.freeze({ rows: input.rows, nextCursor, returnedCount, operationEnvelope });
}

function normalizeEnvelope(
  input: ResolvedFinanceOperationEnvelope
): ResolvedFinanceOperationEnvelope {
  assertExactOwnDataKeys(input, [
    "kind",
    "policyId",
    "policyVersion",
    "policyDigest",
    "maximumRows",
    "maximumDecimalDigits",
    "maximumArtifactBytes"
  ]);
  if (input.kind !== "resolved_finance_operation_envelope") fail("invalid_verified_bundle");
  const result = Object.freeze({
    kind: input.kind,
    policyId: identifier(input.policyId, 160),
    policyVersion: positiveSafeInteger(input.policyVersion),
    policyDigest: digest(input.policyDigest),
    maximumRows: boundedPositiveInteger(input.maximumRows, 10_000),
    maximumDecimalDigits: boundedPositiveInteger(input.maximumDecimalDigits, 1_000),
    maximumArtifactBytes: positiveSafeInteger(input.maximumArtifactBytes)
  });
  return result as ResolvedFinanceOperationEnvelope;
}

function normalizePageEvidence(input: VerifiedSettlementPageBundle["pageEvidence"]): Readonly<{
  providerAccount: FinanceProviderAccountIdentity;
  stream: FinanceSettlementStream;
  windowGeneration: number;
  providerPageCursor: string | null;
  artifact: RawProviderArtifactRef;
  fetchedAt: Date;
}> {
  assertExactOwnDataKeys(input, [
    "kind",
    "providerAccount",
    "stream",
    "windowGeneration",
    "providerPageCursor",
    "artifact",
    "fetchedAt"
  ]);
  if (input.kind !== "verified_settlement_page_evidence") fail("invalid_verified_bundle");
  return Object.freeze({
    providerAccount: createProviderAccountIdentityBinding(input.providerAccount),
    stream: settlementStream(input.stream),
    windowGeneration: positiveSafeInteger(input.windowGeneration),
    providerPageCursor:
      input.providerPageCursor === null ? null : identifier(input.providerPageCursor, 1_000),
    artifact: normalizeArtifactRef(input.artifact),
    fetchedAt: instant(input.fetchedAt)
  });
}

function normalizeLease(
  input: SettlementCursorLeaseReceipt & Readonly<{ state: "active" }>
): NormalizedCommand["lease"] {
  assertExactOwnDataKeys(input, [
    "kind",
    "cursorKey",
    "cursorVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken",
    "databaseClaimedAt",
    "databaseExpiresAt",
    "state"
  ]);
  if (input.kind !== "settlement_cursor_lease_receipt" || input.state !== "active") {
    fail("invalid_command");
  }
  const providerAccount = createProviderAccountIdentityBinding(input.cursorKey.providerAccount);
  const stream = settlementStream(input.cursorKey.stream);
  const leaseToken = identifier(input.leaseToken, 500);
  const claimedAt = instant(input.databaseClaimedAt);
  const expiresAt = instant(input.databaseExpiresAt);
  if (expiresAt.getTime() <= claimedAt.getTime()) fail("invalid_command");
  return Object.freeze({
    cursorKey: Object.freeze({ providerAccount, stream }),
    cursorVersion: positiveSafeInteger(input.cursorVersion),
    leaseOwnerId: identifier(input.leaseOwnerId, 160),
    leaseToken,
    leaseTokenDigest: digestFinanceCanonicalValueV1({
      kind: "settlement_cursor_lease_token",
      leaseToken
    }),
    fencingToken: positiveSafeInteger(input.fencingToken)
  });
}

function normalizeArtifactRef(input: RawProviderArtifactRef): RawProviderArtifactRef {
  assertExactOwnDataKeys(input, ["artifactId", "sha256Digest", "byteLength"]);
  return Object.freeze({
    artifactId: identifier(input.artifactId, 160),
    sha256Digest: digest(input.sha256Digest),
    byteLength: nonNegativeSafeInteger(input.byteLength)
  });
}

function samePage(
  page: typeof financeSettlementPages.$inferSelect,
  bundle: NormalizedBundle
): boolean {
  return (
    page.providerAccountSeriesId === bundle.providerAccount.seriesId &&
    page.providerAccountId === bundle.providerAccount.providerAccountId &&
    page.providerIdentityVersion === bundle.providerAccount.identityVersion &&
    page.stream === bundle.stream &&
    page.windowGeneration === String(bundle.checkpointIdentity.windowGeneration) &&
    page.checkpointIdentity === bundle.serializedCheckpointIdentity &&
    page.providerPageCursor === bundle.checkpointIdentity.providerPageCursor &&
    page.nextPageCursor === bundle.nextCursor &&
    page.rawArtifactId === bundle.rawArtifact.artifactId &&
    page.rawArtifactDigest === bundle.rawArtifact.sha256Digest &&
    page.rawArtifactByteLength === String(bundle.rawArtifact.byteLength) &&
    page.decodedEntriesDigest === bundle.decodedEntriesDigest &&
    page.returnedCount === bundle.returnedCount &&
    page.operationPolicyId === bundle.operationEnvelope.policyId &&
    page.operationPolicyVersion === bundle.operationEnvelope.policyVersion &&
    page.operationPolicyDigest === bundle.operationEnvelope.policyDigest &&
    page.maximumRows === bundle.operationEnvelope.maximumRows &&
    page.maximumDecimalDigits === bundle.operationEnvelope.maximumDecimalDigits &&
    page.maximumArtifactBytes === String(bundle.operationEnvelope.maximumArtifactBytes) &&
    page.fetchedAt.getTime() === bundle.fetchedAt.getTime() &&
    page.verifiedAt.getTime() === bundle.verifiedAt.getTime()
  );
}

function sameLedgerRow(
  row: typeof financeSettlementLedgerEntries.$inferSelect,
  expected: LosslessSettlementEntry
): boolean {
  return (
    row.amountMinor === expected.amountMinor &&
    row.currency === expected.currency &&
    row.direction === expected.direction &&
    row.entryType === expected.entryType &&
    row.referenceType === expected.referenceType &&
    row.referenceId === expected.referenceId &&
    row.feeAmountMinor === expected.feeAmountMinor &&
    row.balanceAfterMinor === expected.balanceAfterMinor &&
    row.occurredAt === expected.occurredAt &&
    row.organizationId === expected.organizationId &&
    row.terminalId === expected.terminalId &&
    row.bankTerminalId === expected.bankTerminalId &&
    row.bankCode === expected.bankCode &&
    row.bankRrn === expected.bankRrn &&
    row.bankAuthCode === expected.bankAuthCode &&
    row.bankInternalReference === expected.bankInternalReference &&
    row.settlementStatus === expected.settlementStatus &&
    row.rawPayloadDigest === expected.rawPayloadDigest
  );
}

function samePayoutRow(
  row: typeof financeSettlementPayouts.$inferSelect,
  expected: LosslessSettlementPayout
): boolean {
  return (
    row.amountMinor === expected.amountMinor &&
    row.currency === expected.currency &&
    row.status === expected.status &&
    row.payoutMethod === expected.payoutMethod &&
    row.bankCode === expected.bankCode &&
    row.bankTerminalId === expected.bankTerminalId &&
    row.providerBankPayoutId === expected.providerBankPayoutId &&
    row.bankPayoutStatus === expected.bankPayoutStatus &&
    row.initiatedAt === expected.initiatedAt &&
    row.completedAt === expected.completedAt &&
    row.failedReason === expected.failedReason &&
    row.rawPayloadDigest === expected.rawPayloadDigest
  );
}

function assertUniqueNaturalKeys(
  rows: readonly (LosslessSettlementEntry | LosslessSettlementPayout)[],
  stream: FinanceSettlementStream
): void {
  const ids = new Set<string>();
  for (const row of rows) {
    const id =
      stream === "settlement_ledger"
        ? (row as LosslessSettlementEntry).key.providerEntryId
        : (row as LosslessSettlementPayout).key.providerPayoutId;
    if (ids.has(id)) fail("invalid_verified_bundle");
    ids.add(id);
  }
}

function sameProvider(
  left: FinanceProviderAccountIdentity,
  right: FinanceProviderAccountIdentity
): boolean {
  return (
    left.seriesId === right.seriesId &&
    left.providerAccountId === right.providerAccountId &&
    left.identityVersion === right.identityVersion
  );
}

function sameArtifact(left: RawProviderArtifactRef, right: RawProviderArtifactRef): boolean {
  return (
    left.artifactId === right.artifactId &&
    left.sha256Digest === right.sha256Digest &&
    left.byteLength === right.byteLength
  );
}

async function readDatabaseClock<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>
): Promise<Date> {
  const result = await transaction.execute(
    sql<{ databaseNow: Date }>`select clock_timestamp() as "databaseNow"`
  );
  return validDate(result.rows[0]?.databaseNow);
}

function assertExpectedVersion(value: unknown, expected: number): void {
  if (safePositiveVersion(value) !== expected) fail("cursor_version_conflict");
}

function safePositiveVersion(value: unknown): number {
  const parsed = Number(decodeFinancePositiveRevision(value));
  if (!Number.isSafeInteger(parsed)) fail("persistence_write_incomplete");
  return parsed;
}

function safeUnsignedVersion(value: unknown): number {
  const parsed = Number(decodeFinanceUnsignedRevision(value));
  if (!Number.isSafeInteger(parsed)) fail("persistence_write_incomplete");
  return parsed;
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_verified_bundle");
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail("invalid_verified_bundle");
  return Number(value);
}

function boundedPositiveInteger(value: unknown, maximum: number): number {
  const parsed = positiveSafeInteger(value);
  if (parsed > maximum) fail("invalid_verified_bundle");
  return parsed;
}

function settlementStream(value: unknown): FinanceSettlementStream {
  if (value !== "settlement_ledger" && value !== "settlement_payouts") {
    fail("invalid_verified_bundle");
  }
  return value;
}

function identifier(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    fail("invalid_verified_bundle");
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    fail("invalid_verified_bundle");
  }
  return value as FinanceDigest;
}

function instant(value: unknown): Date {
  if (typeof value !== "string" || value.trim() !== value) fail("invalid_verified_bundle");
  return validDate(value);
}

function validDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) fail("persistence_write_incomplete");
  return date;
}

function assertExactOwnDataKeys(value: unknown, expectedKeys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_verified_bundle");
  }
  const expected = new Set(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.size) fail("invalid_verified_bundle");
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) fail("invalid_verified_bundle");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_verified_bundle");
  }
}

function postgresCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const record = current as Readonly<{ code?: unknown; cause?: unknown }>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return undefined;
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;

function noFailureInjection(): void {}

function fail(reason: SettlementBatchIngestionPersistenceReason): never {
  throw new SettlementBatchIngestionPersistenceError(reason);
}
