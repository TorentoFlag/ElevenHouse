import {
  createProviderAccountIdentityBinding,
  digestFinanceCanonicalValueV1,
  type ClaimSettlementCursorLeaseCommand,
  type FinanceSettlementCursorKey,
  type ReleaseSettlementCursorLeaseCommand,
  type RenewSettlementCursorLeaseCommand,
  type SettlementCursorLeaseReceipt,
  type SettlementCursorLeaseUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeSettlementCursors } from "../../schema/finance/settlement.schema";
import { decodeFinancePositiveRevision, decodeFinanceUnsignedRevision } from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type SettlementCursorLeasePersistenceReason =
  | "invalid_command"
  | "cursor_not_found"
  | "cursor_version_conflict"
  | "lease_already_active"
  | "lease_not_active"
  | "lease_credential_conflict"
  | "lease_expired"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SettlementCursorLeasePersistenceError extends Error {
  readonly code = "settlement_cursor_lease_persistence_error";

  constructor(readonly reason: SettlementCursorLeasePersistenceReason) {
    super("Settlement cursor lease transition was rejected");
    this.name = "SettlementCursorLeasePersistenceError";
  }
}

export function createDrizzleSettlementCursorLeaseUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: { readonly database: NodePgDatabase<TSchema> }): SettlementCursorLeaseUnitOfWork {
  const unitOfWork = {
    claimLease(command) {
      const normalized = normalizeClaimCommand(command);
      return runTransition(input.database, (transaction) =>
        claimInTransaction(transaction, normalized)
      );
    },
    renewLease(command) {
      const normalized = normalizeRenewCommand(command);
      return runTransition(input.database, (transaction) =>
        renewInTransaction(transaction, normalized)
      );
    },
    releaseLease(command) {
      const normalized = normalizeReleaseCommand(command);
      return runTransition(input.database, (transaction) =>
        releaseInTransaction(transaction, normalized)
      );
    }
  } satisfies SettlementCursorLeaseUnitOfWork;
  return Object.freeze(unitOfWork);
}

type NormalizedLeaseBase = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  expectedCursorVersion: number;
  leaseOwnerId: string;
  leaseToken: string;
  leaseTokenDigest: `sha256:${string}`;
}>;

type NormalizedClaimCommand = NormalizedLeaseBase & Readonly<{ leaseDurationSeconds: number }>;

type NormalizedCredentialCommand = NormalizedLeaseBase & Readonly<{ fencingToken: number }>;

type NormalizedRenewCommand = NormalizedCredentialCommand &
  Readonly<{ leaseDurationSeconds: number }>;

async function runTransition<TSchema extends Record<string, unknown>>(
  database: NodePgDatabase<TSchema>,
  transition: (transaction: FinanceTransaction<TSchema>) => Promise<SettlementCursorLeaseReceipt>
): Promise<SettlementCursorLeaseReceipt> {
  try {
    return await database.transaction(transition);
  } catch (error) {
    if (error instanceof SettlementCursorLeasePersistenceError) throw error;
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
    throw error;
  }
}

async function claimInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedClaimCommand
): Promise<SettlementCursorLeaseReceipt> {
  const row = await lockCursor(transaction, command.cursorKey);
  assertExpectedVersion(row.version, command.expectedCursorVersion);
  const databaseNow = await readDatabaseClock(transaction);
  if (row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() > databaseNow.getTime()) {
    fail("lease_already_active");
  }
  const currentFence = safeUnsignedVersion(row.fencingToken);
  if (!Number.isSafeInteger(currentFence + 1)) fail("persistence_write_incomplete");
  const nextFence = currentFence + 1;
  const nextVersion = command.expectedCursorVersion + 1;
  const databaseExpiresAt = addSeconds(databaseNow, command.leaseDurationSeconds);

  const [updated] = await transaction
    .update(financeSettlementCursors)
    .set({
      leaseOwnerId: command.leaseOwnerId,
      leaseTokenDigest: command.leaseTokenDigest,
      leaseClaimedAt: databaseNow,
      leaseExpiresAt: databaseExpiresAt,
      fencingToken: String(nextFence),
      version: String(nextVersion),
      updatedAt: databaseNow
    })
    .where(
      and(
        eq(financeSettlementCursors.id, row.id),
        eq(financeSettlementCursors.version, String(command.expectedCursorVersion)),
        eq(financeSettlementCursors.fencingToken, String(currentFence))
      )
    )
    .returning();
  if (!updated) fail("cursor_version_conflict");
  return leaseReceipt(updated, command.leaseToken, "active");
}

async function renewInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedRenewCommand
): Promise<SettlementCursorLeaseReceipt> {
  const row = await lockCursor(transaction, command.cursorKey);
  assertExpectedVersion(row.version, command.expectedCursorVersion);
  const databaseNow = await readDatabaseClock(transaction);
  assertActiveCredential(row, command, databaseNow);
  const nextVersion = command.expectedCursorVersion + 1;
  const databaseExpiresAt = addSeconds(databaseNow, command.leaseDurationSeconds);

  const [updated] = await transaction
    .update(financeSettlementCursors)
    .set({
      leaseExpiresAt: databaseExpiresAt,
      version: String(nextVersion),
      updatedAt: databaseNow
    })
    .where(
      and(
        eq(financeSettlementCursors.id, row.id),
        eq(financeSettlementCursors.version, String(command.expectedCursorVersion)),
        eq(financeSettlementCursors.fencingToken, String(command.fencingToken)),
        eq(financeSettlementCursors.leaseOwnerId, command.leaseOwnerId),
        eq(financeSettlementCursors.leaseTokenDigest, command.leaseTokenDigest)
      )
    )
    .returning();
  if (!updated) fail("cursor_version_conflict");
  return leaseReceipt(updated, command.leaseToken, "active");
}

async function releaseInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCredentialCommand
): Promise<SettlementCursorLeaseReceipt> {
  const row = await lockCursor(transaction, command.cursorKey);
  assertExpectedVersion(row.version, command.expectedCursorVersion);
  const databaseNow = await readDatabaseClock(transaction);
  assertActiveCredential(row, command, databaseNow);
  const databaseClaimedAt = validDate(row.leaseClaimedAt);
  const databaseExpiresAt = validDate(row.leaseExpiresAt);
  const nextVersion = command.expectedCursorVersion + 1;

  const [updated] = await transaction
    .update(financeSettlementCursors)
    .set({
      leaseOwnerId: null,
      leaseTokenDigest: null,
      leaseClaimedAt: null,
      leaseExpiresAt: null,
      version: String(nextVersion),
      updatedAt: databaseNow
    })
    .where(
      and(
        eq(financeSettlementCursors.id, row.id),
        eq(financeSettlementCursors.version, String(command.expectedCursorVersion)),
        eq(financeSettlementCursors.fencingToken, String(command.fencingToken)),
        eq(financeSettlementCursors.leaseOwnerId, command.leaseOwnerId),
        eq(financeSettlementCursors.leaseTokenDigest, command.leaseTokenDigest)
      )
    )
    .returning({
      version: financeSettlementCursors.version,
      fencingToken: financeSettlementCursors.fencingToken
    });
  if (!updated) fail("cursor_version_conflict");
  const receipt = Object.freeze({
    kind: "settlement_cursor_lease_receipt" as const,
    cursorKey: command.cursorKey,
    cursorVersion: safePositiveVersion(updated.version),
    leaseOwnerId: command.leaseOwnerId,
    leaseToken: command.leaseToken,
    fencingToken: safePositiveVersion(updated.fencingToken),
    databaseClaimedAt: databaseClaimedAt.toISOString(),
    databaseExpiresAt: databaseExpiresAt.toISOString(),
    state: "released" as const
  });
  return receipt as SettlementCursorLeaseReceipt;
}

async function lockCursor<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  cursorKey: FinanceSettlementCursorKey
): Promise<typeof financeSettlementCursors.$inferSelect> {
  const [row] = await transaction
    .select()
    .from(financeSettlementCursors)
    .where(
      and(
        eq(financeSettlementCursors.providerAccountSeriesId, cursorKey.providerAccount.seriesId),
        eq(financeSettlementCursors.providerAccountId, cursorKey.providerAccount.providerAccountId),
        eq(
          financeSettlementCursors.providerIdentityVersion,
          cursorKey.providerAccount.identityVersion
        ),
        eq(financeSettlementCursors.stream, cursorKey.stream)
      )
    )
    .limit(1)
    .for("update");
  if (!row) fail("cursor_not_found");
  return row;
}

function assertActiveCredential(
  row: typeof financeSettlementCursors.$inferSelect,
  command: NormalizedCredentialCommand,
  databaseNow: Date
): void {
  if (
    row.leaseOwnerId === null ||
    row.leaseTokenDigest === null ||
    row.leaseClaimedAt === null ||
    row.leaseExpiresAt === null
  ) {
    fail("lease_not_active");
  }
  if (
    row.leaseOwnerId !== command.leaseOwnerId ||
    row.leaseTokenDigest !== command.leaseTokenDigest ||
    safeUnsignedVersion(row.fencingToken) !== command.fencingToken
  ) {
    fail("lease_credential_conflict");
  }
  if (row.leaseExpiresAt.getTime() <= databaseNow.getTime()) fail("lease_expired");
}

function leaseReceipt(
  row: typeof financeSettlementCursors.$inferSelect,
  leaseToken: string,
  state: "active"
): SettlementCursorLeaseReceipt {
  if (
    row.leaseOwnerId === null ||
    row.leaseClaimedAt === null ||
    row.leaseExpiresAt === null ||
    (row.stream !== "settlement_ledger" && row.stream !== "settlement_payouts")
  ) {
    fail("persistence_write_incomplete");
  }
  const cursorKey = Object.freeze({
    providerAccount: createProviderAccountIdentityBinding({
      seriesId: row.providerAccountSeriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.providerIdentityVersion
    }),
    stream: row.stream
  });
  const receipt = Object.freeze({
    kind: "settlement_cursor_lease_receipt" as const,
    cursorKey,
    cursorVersion: safePositiveVersion(row.version),
    leaseOwnerId: row.leaseOwnerId,
    leaseToken,
    fencingToken: safePositiveVersion(row.fencingToken),
    databaseClaimedAt: validDate(row.leaseClaimedAt).toISOString(),
    databaseExpiresAt: validDate(row.leaseExpiresAt).toISOString(),
    state
  });
  return receipt as SettlementCursorLeaseReceipt;
}

function normalizeClaimCommand(command: ClaimSettlementCursorLeaseCommand): NormalizedClaimCommand {
  assertExactOwnDataKeys(command, [
    "cursorKey",
    "expectedCursorVersion",
    "leaseOwnerId",
    "leaseToken",
    "leaseDurationSeconds"
  ]);
  const base = normalizeBase(command);
  return Object.freeze({
    ...base,
    leaseDurationSeconds: duration(command.leaseDurationSeconds)
  });
}

function normalizeRenewCommand(command: RenewSettlementCursorLeaseCommand): NormalizedRenewCommand {
  assertExactOwnDataKeys(command, [
    "cursorKey",
    "expectedCursorVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken",
    "leaseDurationSeconds"
  ]);
  const base = normalizeBase(command);
  return Object.freeze({
    ...base,
    fencingToken: positiveSafeInteger(command.fencingToken),
    leaseDurationSeconds: duration(command.leaseDurationSeconds)
  });
}

function normalizeReleaseCommand(
  command: ReleaseSettlementCursorLeaseCommand
): NormalizedCredentialCommand {
  assertExactOwnDataKeys(command, [
    "cursorKey",
    "expectedCursorVersion",
    "leaseOwnerId",
    "leaseToken",
    "fencingToken"
  ]);
  const base = normalizeBase(command);
  return Object.freeze({ ...base, fencingToken: positiveSafeInteger(command.fencingToken) });
}

function normalizeBase(command: {
  readonly cursorKey: FinanceSettlementCursorKey;
  readonly expectedCursorVersion: number;
  readonly leaseOwnerId: string;
  readonly leaseToken: string;
}): NormalizedLeaseBase {
  try {
    const providerAccount = createProviderAccountIdentityBinding(command.cursorKey.providerAccount);
    const stream = command.cursorKey.stream;
    if (stream !== "settlement_ledger" && stream !== "settlement_payouts") {
      fail("invalid_command");
    }
    const cursorKey = Object.freeze({ providerAccount, stream });
    const leaseOwnerId = identifier(command.leaseOwnerId, 160);
    const leaseToken = identifier(command.leaseToken, 500);
    return Object.freeze({
      cursorKey,
      expectedCursorVersion: positiveSafeInteger(command.expectedCursorVersion),
      leaseOwnerId,
      leaseToken,
      leaseTokenDigest: digestFinanceCanonicalValueV1({
        kind: "settlement_cursor_lease_token",
        leaseToken
      })
    });
  } catch (error) {
    if (error instanceof SettlementCursorLeasePersistenceError) throw error;
    fail("invalid_command");
  }
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
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_command");
  return Number(value);
}

function duration(value: unknown): number {
  const seconds = positiveSafeInteger(value);
  if (seconds > 86_400) fail("invalid_command");
  return seconds;
}

function identifier(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function addSeconds(value: Date, seconds: number): Date {
  const result = new Date(value.getTime() + seconds * 1_000);
  return validDate(result);
}

function validDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) fail("persistence_write_incomplete");
  return date;
}

function assertExactOwnDataKeys(value: unknown, expectedKeys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_command");
  }
  const expected = new Set(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.size) fail("invalid_command");
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) fail("invalid_command");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_command");
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

function fail(reason: SettlementCursorLeasePersistenceReason): never {
  throw new SettlementCursorLeasePersistenceError(reason);
}
