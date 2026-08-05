/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import type {
  CashPoolDirectoryBootstrapPort,
  EmptyCashPoolDirectoryReceipt,
  EnsureEmptySystemCashPoolReferenceCommand,
  FinanceDigest
} from "@elevenhouse/domain/finance-core";
import { types as nodeUtilTypes } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeBankCashPools,
  financeCashPoolDirectoryReceipts
} from "../../schema/finance/bank-cash.schema";

export type CashPoolDirectoryBootstrapPersistenceReason =
  | "invalid_command"
  | "directory_identity_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class CashPoolDirectoryBootstrapPersistenceError extends Error {
  readonly code = "cash_pool_directory_bootstrap_persistence_error";

  constructor(readonly reason: CashPoolDirectoryBootstrapPersistenceReason) {
    super("Cash-pool directory reference could not be created atomically");
    this.name = "CashPoolDirectoryBootstrapPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  bankCashPoolId: string;
  currency: "RUB";
  bankAccountFingerprint: FinanceDigest;
  statementSourceFingerprint: FinanceDigest;
}>;

export function createDrizzleCashPoolDirectoryBootstrapPort<
  TSchema extends Record<string, unknown>
>(input: { readonly database: NodePgDatabase<TSchema> }): CashPoolDirectoryBootstrapPort {
  return Object.freeze({
    async ensureEmptySystemCashPoolReference(command) {
      const normalized = normalizeEnsureEmptySystemCashPoolReferenceCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          ensureInTransaction(transaction, normalized)
        );
      } catch (error) {
        if (error instanceof CashPoolDirectoryBootstrapPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23514") fail("directory_identity_conflict");
        throw error;
      }
    }
  } satisfies CashPoolDirectoryBootstrapPort);
}

export function normalizeEnsureEmptySystemCashPoolReferenceCommand(
  input: EnsureEmptySystemCashPoolReferenceCommand
): NormalizedCommand {
  return boundary(() => {
    exactRecord(input, [
      "bankCashPoolId",
      "currency",
      "bankAccountFingerprint",
      "statementSourceFingerprint"
    ]);
    if (input.currency !== "RUB") fail("invalid_command");
    return Object.freeze({
      bankCashPoolId: identifier(input.bankCashPoolId, 160),
      currency: "RUB",
      bankAccountFingerprint: digest(input.bankAccountFingerprint),
      statementSourceFingerprint: digest(input.statementSourceFingerprint)
    });
  });
}

async function ensureInTransaction<TSchema extends Record<string, unknown>>(
  transaction: Parameters<Parameters<NodePgDatabase<TSchema>["transaction"]>[0]>[0],
  command: NormalizedCommand
): Promise<EmptyCashPoolDirectoryReceipt> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${command.bankCashPoolId}:${command.currency}`}, 0))`
  );
  const [pool] = await transaction
    .select()
    .from(financeBankCashPools)
    .where(and(
      eq(financeBankCashPools.id, command.bankCashPoolId),
      eq(financeBankCashPools.currency, command.currency)
    ))
    .for("update");
  if (pool && (
    pool.bankAccountFingerprint !== command.bankAccountFingerprint ||
    pool.statementSourceFingerprint !== command.statementSourceFingerprint ||
    pool.retiredAt !== null
  )) fail("directory_identity_conflict");
  if (!pool) {
    await transaction.insert(financeBankCashPools).values({
      id: command.bankCashPoolId,
      currency: command.currency,
      bankAccountFingerprint: command.bankAccountFingerprint,
      statementSourceFingerprint: command.statementSourceFingerprint
    });
  }
  const [existing] = await transaction
    .select()
    .from(financeCashPoolDirectoryReceipts)
    .where(and(
      eq(financeCashPoolDirectoryReceipts.bankCashPoolId, command.bankCashPoolId),
      eq(financeCashPoolDirectoryReceipts.currency, command.currency),
      eq(financeCashPoolDirectoryReceipts.bankAccountFingerprint, command.bankAccountFingerprint),
      eq(financeCashPoolDirectoryReceipts.statementSourceFingerprint, command.statementSourceFingerprint)
    ))
    .for("share");
  if (existing) return mapReceipt(existing);
  const [receipt] = await transaction
    .insert(financeCashPoolDirectoryReceipts)
    .values({
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      bankAccountFingerprint: command.bankAccountFingerprint,
      statementSourceFingerprint: command.statementSourceFingerprint,
      persistenceTransactionBoundaryRef: sql`'postgres-xid:' || pg_current_xact_id()::text`
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  return mapReceipt(receipt);
}

function mapReceipt(row: typeof financeCashPoolDirectoryReceipts.$inferSelect): EmptyCashPoolDirectoryReceipt {
  if (
    row.currency !== "RUB" ||
    row.monetaryInitialization !== "reference_only_zero" ||
    row.balanceBearingRowsCreated !== 0 ||
    row.journalTransactionId !== null ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef)
  ) fail("persistence_write_incomplete");
  return Object.freeze({
    kind: "empty_cash_pool_directory_receipt",
    bankCashPoolId: row.bankCashPoolId,
    currency: "RUB",
    monetaryInitialization: "reference_only_zero",
    balanceBearingRowsCreated: 0,
    journalTransactionId: null,
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef
  }) as unknown as EmptyCashPoolDirectoryReceipt;
}

function exactRecord(input: unknown, expectedKeys: readonly string[]): asserts input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input) || nodeUtilTypes.isProxy(input)) fail("invalid_command");
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) fail("invalid_command");
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}
function identifier(input: unknown, max: number): string { if (typeof input !== "string" || input.length === 0 || input.length > max || input.trim() !== input || /[\u0000-\u001f\u007f]/.test(input)) fail("invalid_command"); return input; }
function digest(input: unknown): FinanceDigest { if (typeof input !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input)) fail("invalid_command"); return input as FinanceDigest; }
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function boundary<T>(callback: () => T): T { try { return callback(); } catch (error) { if (error instanceof CashPoolDirectoryBootstrapPersistenceError) throw error; fail("invalid_command"); } }
function fail(reason: CashPoolDirectoryBootstrapPersistenceReason): never { throw new CashPoolDirectoryBootstrapPersistenceError(reason); }
