import {
  createProviderAccountIdentityBinding,
  createSettlementPageCheckpointKey,
  digestFinanceCanonicalValueV1,
  type AcquireSettlementPageCommand,
  type AcquiredSettlementPage,
  type EnsureSettlementCursorCommand,
  type SettlementCursorProvisionReceipt,
  type SettlementCursorWorkUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeSettlementCursors } from "../../schema/finance/settlement.schema";
import { decodeFinancePositiveRevision, decodeFinanceUnsignedRevision } from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export class SettlementCursorWorkPersistenceError extends Error {
  readonly code = "SETTLEMENT_CURSOR_WORK_PERSISTENCE_ERROR" as const;

  constructor(
    readonly reason:
      | "invalid_command"
      | "provider_account_not_configured"
      | "cursor_not_found"
      | "lease_already_active"
      | "cursor_version_conflict"
      | "persistence_failure"
  ) {
    super("Settlement cursor work could not be prepared safely");
    this.name = "SettlementCursorWorkPersistenceError";
  }
}

/** Owns only cursor lifecycle transitions. Provider I/O and normalized-page writes stay separate. */
export function createDrizzleSettlementCursorWorkUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: { readonly database: NodePgDatabase<TSchema> }): SettlementCursorWorkUnitOfWork {
  return Object.freeze({
    ensureCursor(command) {
      return run(input.database, (transaction) => ensureCursor(transaction, command));
    },
    acquireNextPage(command) {
      return run(input.database, (transaction) => acquireNextPage(transaction, command));
    }
  } satisfies SettlementCursorWorkUnitOfWork);
}

async function ensureCursor<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: EnsureSettlementCursorCommand
): Promise<SettlementCursorProvisionReceipt> {
  const normalized = normalizeEnsure(command);
  const existing = await readCursor(transaction, normalized.cursorKey, "share");
  if (existing) {
    return Object.freeze({
      cursorKey: normalized.cursorKey,
      cursorVersion: positiveRevision(existing.version),
      created: false
    });
  }
  const databaseNow = await databaseClock(transaction);
  if (normalized.initialBackfillStart.getTime() > databaseNow.getTime()) fail("invalid_command");
  try {
    const [created] = await transaction
      .insert(financeSettlementCursors)
      .values({
        providerAccountSeriesId: normalized.cursorKey.providerAccount.seriesId,
        providerAccountId: normalized.cursorKey.providerAccount.providerAccountId,
        providerIdentityVersion: normalized.cursorKey.providerAccount.identityVersion,
        stream: normalized.cursorKey.stream,
        initialBackfillStart: normalized.initialBackfillStart,
        overlapSeconds: normalized.overlapSeconds,
        highWaterMark: normalized.initialBackfillStart,
        updatedAt: databaseNow
      })
      .returning({ version: financeSettlementCursors.version });
    if (!created) fail("persistence_failure");
    return Object.freeze({
      cursorKey: normalized.cursorKey,
      cursorVersion: positiveRevision(created.version),
      created: true
    });
  } catch (error) {
    if (error instanceof SettlementCursorWorkPersistenceError) throw error;
    if (postgresCode(error) === "23503") fail("provider_account_not_configured");
    if (postgresCode(error) === "23505") {
      const raced = await readCursor(transaction, normalized.cursorKey, "share");
      if (raced) {
        return Object.freeze({
          cursorKey: normalized.cursorKey,
          cursorVersion: positiveRevision(raced.version),
          created: false
        });
      }
    }
    throw error;
  }
}

async function acquireNextPage<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: AcquireSettlementPageCommand
): Promise<AcquiredSettlementPage | null> {
  const normalized = normalizeAcquire(command);
  const cursor = await readCursor(transaction, normalized.cursorKey, "update");
  if (!cursor) fail("cursor_not_found");
  const databaseNow = await databaseClock(transaction);
  if (cursor.leaseExpiresAt && cursor.leaseExpiresAt.getTime() > databaseNow.getTime()) {
    fail("lease_already_active");
  }

  const currentVersion = positiveRevision(cursor.version);
  const currentFence = unsignedRevision(cursor.fencingToken);
  const nextFence = currentFence + 1;
  if (!Number.isSafeInteger(nextFence)) fail("persistence_failure");
  const hasActiveWindow = cursor.activeWindowStart !== null && cursor.activeWindowEnd !== null;
  const window = hasActiveWindow
    ? {
        start: validDate(cursor.activeWindowStart),
        end: validDate(cursor.activeWindowEnd),
        nextPageCursor: cursor.nextPageCursor,
        generation: unsignedRevision(cursor.windowGeneration),
        checkpointedPageCount: cursor.checkpointedPageCount,
        maximumPageCount: cursor.maxPageCount
      }
    : createWindow(cursor, databaseNow, normalized.maximumPageCount);
  if (window === null) return null;
  if (
    window.maximumPageCount === null ||
    window.checkpointedPageCount < 0 ||
    window.checkpointedPageCount >= window.maximumPageCount ||
    window.generation < 1
  ) {
    fail("persistence_failure");
  }

  const nextVersion = currentVersion + 1;
  const leaseExpiresAt = new Date(databaseNow.getTime() + normalized.leaseDurationSeconds * 1_000);
  const patch = hasActiveWindow
    ? {}
    : {
        activeWindowStart: window.start,
        activeWindowEnd: window.end,
        nextPageCursor: null,
        checkpointedPageCount: 0,
        maxPageCount: window.maximumPageCount,
        windowGeneration: String(window.generation)
      };
  const [updated] = await transaction
    .update(financeSettlementCursors)
    .set({
      ...patch,
      leaseOwnerId: normalized.leaseOwnerId,
      leaseTokenDigest: normalized.leaseTokenDigest,
      leaseClaimedAt: databaseNow,
      leaseExpiresAt,
      fencingToken: String(nextFence),
      version: String(nextVersion),
      updatedAt: databaseNow
    })
    .where(
      and(
        eq(financeSettlementCursors.id, cursor.id),
        eq(financeSettlementCursors.version, String(currentVersion)),
        eq(financeSettlementCursors.fencingToken, String(currentFence))
      )
    )
    .returning({ version: financeSettlementCursors.version });
  if (!updated || positiveRevision(updated.version) !== nextVersion) fail("cursor_version_conflict");

  const lease = Object.freeze({
    kind: "settlement_cursor_lease_receipt" as const,
    cursorKey: normalized.cursorKey,
    cursorVersion: nextVersion,
    leaseOwnerId: normalized.leaseOwnerId,
    leaseToken: normalized.leaseToken,
    fencingToken: nextFence,
    databaseClaimedAt: databaseNow.toISOString(),
    databaseExpiresAt: leaseExpiresAt.toISOString(),
    state: "active" as const
  }) as AcquiredSettlementPage["lease"];
  return Object.freeze({
    lease,
    checkpointIdentity: createSettlementPageCheckpointKey({
      cursorKey: normalized.cursorKey,
      windowGeneration: window.generation,
      providerPageCursor: window.nextPageCursor
    }),
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString()
  });
}

function createWindow(
  cursor: typeof financeSettlementCursors.$inferSelect,
  databaseNow: Date,
  maximumPageCount: number
): Readonly<{
  start: Date;
  end: Date;
  nextPageCursor: null;
  generation: number;
  checkpointedPageCount: 0;
  maximumPageCount: number;
}> | null {
  const initial = validDate(cursor.initialBackfillStart);
  const highWaterMark = validDate(cursor.highWaterMark);
  const overlapStart = new Date(highWaterMark.getTime() - cursor.overlapSeconds * 1_000);
  const start = new Date(Math.max(initial.getTime(), overlapStart.getTime()));
  if (start.getTime() >= databaseNow.getTime()) return null;
  const currentGeneration = unsignedRevision(cursor.windowGeneration);
  const generation = currentGeneration + 1;
  if (!Number.isSafeInteger(generation)) fail("persistence_failure");
  return Object.freeze({
    start,
    end: databaseNow,
    nextPageCursor: null,
    generation,
    checkpointedPageCount: 0,
    maximumPageCount
  });
}

async function readCursor<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  cursorKey: EnsureSettlementCursorCommand["cursorKey"],
  lock: "share" | "update"
): Promise<typeof financeSettlementCursors.$inferSelect | null> {
  const [row] = await transaction
    .select()
    .from(financeSettlementCursors)
    .where(
      and(
        eq(financeSettlementCursors.providerAccountSeriesId, cursorKey.providerAccount.seriesId),
        eq(financeSettlementCursors.providerAccountId, cursorKey.providerAccount.providerAccountId),
        eq(financeSettlementCursors.providerIdentityVersion, cursorKey.providerAccount.identityVersion),
        eq(financeSettlementCursors.stream, cursorKey.stream)
      )
    )
    .limit(1)
    .for(lock);
  return row ?? null;
}

function normalizeEnsure(command: EnsureSettlementCursorCommand) {
  const cursorKey = normalizeCursorKey(command.cursorKey);
  const initialBackfillStart = validDate(command.initialBackfillStart);
  const overlapSeconds = boundedPositiveInteger(command.overlapSeconds, 604_800);
  return Object.freeze({ cursorKey, initialBackfillStart, overlapSeconds });
}

function normalizeAcquire(command: AcquireSettlementPageCommand) {
  const cursorKey = normalizeCursorKey(command.cursorKey);
  const leaseOwnerId = identifier(command.leaseOwnerId, 160);
  const leaseToken = identifier(command.leaseToken, 500);
  return Object.freeze({
    cursorKey,
    leaseOwnerId,
    leaseToken,
    leaseTokenDigest: digestFinanceCanonicalValueV1({ kind: "settlement_cursor_lease_token", leaseToken }),
    leaseDurationSeconds: boundedPositiveInteger(command.leaseDurationSeconds, 86_400),
    maximumPageCount: boundedPositiveInteger(command.maximumPageCount, 10_000)
  });
}

function normalizeCursorKey(value: EnsureSettlementCursorCommand["cursorKey"]) {
  if (value.stream !== "settlement_ledger" && value.stream !== "settlement_payouts") fail("invalid_command");
  try {
    return Object.freeze({
      providerAccount: createProviderAccountIdentityBinding(value.providerAccount),
      stream: value.stream
    });
  } catch {
    fail("invalid_command");
  }
}

async function run<TSchema extends Record<string, unknown>, Result>(
  database: NodePgDatabase<TSchema>,
  operation: (transaction: FinanceTransaction<TSchema>) => Promise<Result>
): Promise<Result> {
  try {
    return await database.transaction(operation);
  } catch (error) {
    if (error instanceof SettlementCursorWorkPersistenceError) throw error;
    if (postgresCode(error) === "40001" || postgresCode(error) === "40P01") {
      fail("cursor_version_conflict");
    }
    throw error;
  }
}

async function databaseClock<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>
): Promise<Date> {
  const result = await transaction.execute(
    sql<{ databaseNow: Date }>`select clock_timestamp() as "databaseNow"`
  );
  return validDate(result.rows[0]?.databaseNow);
}

function positiveRevision(value: unknown): number {
  const parsed = Number(decodeFinancePositiveRevision(value));
  if (!Number.isSafeInteger(parsed)) fail("persistence_failure");
  return parsed;
}

function unsignedRevision(value: unknown): number {
  const parsed = Number(decodeFinanceUnsignedRevision(value));
  if (!Number.isSafeInteger(parsed)) fail("persistence_failure");
  return parsed;
}

function boundedPositiveInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    fail("invalid_command");
  }
  return Number(value);
}

function identifier(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function validDate(value: unknown): Date {
  const result = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(result.getTime())) fail("invalid_command");
  return result;
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

function fail(reason: SettlementCursorWorkPersistenceError["reason"]): never {
  throw new SettlementCursorWorkPersistenceError(reason);
}
