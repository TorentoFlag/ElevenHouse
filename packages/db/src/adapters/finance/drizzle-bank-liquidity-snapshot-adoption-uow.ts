/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import type {
  BankLiquiditySnapshotAdoptionReceipt,
  BankLiquiditySnapshotAdoptionUnitOfWork,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope,
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeBankLiquidityHeads,
  financeBankLiquidityHistory,
  financeBankLiquiditySnapshotAdoptionReceipts,
  financeBankLiquiditySnapshots
} from "../../schema/finance/bank-liquidity.schema";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type BankLiquiditySnapshotAdoptionPersistenceReason =
  | "invalid_command"
  | "bank_cash_pool_not_found"
  | "bank_liquidity_revision_conflict"
  | "snapshot_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class BankLiquiditySnapshotAdoptionPersistenceError extends Error {
  readonly code = "bank_liquidity_snapshot_adoption_persistence_error";

  constructor(readonly reason: BankLiquiditySnapshotAdoptionPersistenceReason) {
    super("Verified bank liquidity snapshot could not be adopted atomically");
    this.name = "BankLiquiditySnapshotAdoptionPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  bankCashPoolId: string;
  currency: "RUB";
  expectedBankLiquidityRevision: string;
  snapshotId: string;
  snapshotVersion: string;
  evidence: Readonly<{
    unrestrictedAvailableMinor: string;
    sourceCheckpoint: string;
    asOf: Date;
    expiresAt: Date;
    evidenceDigest: FinanceDigest;
    attestationId: string;
    attestationVersion: 1;
    attestationDigest: FinanceDigest;
  }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

/**
 * Adopts sealed, verified bank liquidity evidence into the pool-scoped CAS head. This creates
 * neither bank_cash nor a journal entry: only a later deduplicated bank-statement match moves
 * cash. The snapshot is deterministic from its immutable evidence identity, making retries safe.
 */
export function createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
}): BankLiquiditySnapshotAdoptionUnitOfWork {
  return Object.freeze({
    async adoptVerifiedLiquiditySnapshot(command) {
      const normalized = normalizeBankLiquiditySnapshotAdoptionCommand(command);
      try {
        return await input.database.transaction((transaction) => adoptInTransaction(transaction, normalized));
      } catch (error) {
        if (error instanceof BankLiquiditySnapshotAdoptionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("snapshot_conflict");
        if (code === "23503") fail("bank_cash_pool_not_found");
        if (code === "23514" || code === "55000") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies BankLiquiditySnapshotAdoptionUnitOfWork);
}

export function normalizeBankLiquiditySnapshotAdoptionCommand(input: unknown): NormalizedCommand {
  return boundary(() => {
    exactRecord(input, [
      "bankCashPoolId",
      "currency",
      "expectedBankLiquidityRevision",
      "evidence",
      "operationEnvelope"
    ]);
    if (input.currency !== "RUB") fail("invalid_command");
    const bankCashPoolId = identifier(input.bankCashPoolId, 160);
    const expectedBankLiquidityRevision = nonNegativeRevision(input.expectedBankLiquidityRevision);
    const evidence = normalizeEvidence(input.evidence, bankCashPoolId);
    const operationEnvelope = normalizeEnvelope(input.operationEnvelope);
    return Object.freeze({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision,
      snapshotId: snapshotIdFor(bankCashPoolId, evidence.sourceCheckpoint, evidence.evidenceDigest),
      snapshotVersion: (BigInt(expectedBankLiquidityRevision) + 1n).toString(),
      evidence,
      operationEnvelope
    });
  });
}

async function adoptInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
): Promise<BankLiquiditySnapshotAdoptionReceipt> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${command.bankCashPoolId}:${command.currency}`}, 0))`
  );
  const [head] = await transaction
    .select()
    .from(financeBankLiquidityHeads)
    .where(
      and(
        eq(financeBankLiquidityHeads.bankCashPoolId, command.bankCashPoolId),
        eq(financeBankLiquidityHeads.currency, command.currency)
      )
    )
    .for("update");
  const actualRevision = head?.revision ?? "0";
  if (actualRevision !== command.expectedBankLiquidityRevision) {
    const replay = await findExactReplay(transaction, command);
    if (replay) return replay;
    fail("bank_liquidity_revision_conflict");
  }

  const replay = await findExactReplay(transaction, command);
  if (replay) return replay;

  const [snapshot] = await transaction
    .insert(financeBankLiquiditySnapshots)
    .values({
      snapshotId: command.snapshotId,
      snapshotVersion: command.snapshotVersion,
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      balanceBasis: "unrestricted_available",
      unrestrictedAvailableMinor: command.evidence.unrestrictedAvailableMinor,
      sourceCheckpoint: command.evidence.sourceCheckpoint,
      asOf: command.evidence.asOf,
      expiresAt: command.evidence.expiresAt,
      evidenceDigest: command.evidence.evidenceDigest,
      attestationId: command.evidence.attestationId,
      attestationVersion: command.evidence.attestationVersion,
      attestationDigest: command.evidence.attestationDigest
    })
    .returning();
  if (!snapshot) fail("persistence_write_incomplete");

  const [receipt] = await transaction
    .insert(financeBankLiquiditySnapshotAdoptionReceipts)
    .values({
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      snapshotId: snapshot.snapshotId,
      snapshotVersion: snapshot.snapshotVersion,
      snapshotDigest: snapshot.evidenceDigest,
      sourceCheckpoint: snapshot.sourceCheckpoint,
      expectedBankLiquidityRevision: command.expectedBankLiquidityRevision,
      bankLiquidityRevision: (BigInt(command.expectedBankLiquidityRevision) + 1n).toString(),
      persistenceTransactionBoundaryRef: sql`'postgres-xid:' || pg_current_xact_id()::text`
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");

  const openPayoutExposureMinor = head?.openPayoutExposureMinor ?? "0";
  const unresolvedDebitExposureMinor = head?.unresolvedDebitExposureMinor ?? "0";
  const safetyBufferMinor = head?.safetyBufferMinor ?? "0";
  const availableLiquidityMinor = (
    BigInt(snapshot.unrestrictedAvailableMinor) -
    BigInt(openPayoutExposureMinor) -
    BigInt(unresolvedDebitExposureMinor) -
    BigInt(safetyBufferMinor)
  ).toString();
  const [history] = await transaction
    .insert(financeBankLiquidityHistory)
    .values({
      previousHistoryId: head?.lastHistoryId ?? null,
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      expectedRevision: command.expectedBankLiquidityRevision,
      revision: receipt.bankLiquidityRevision,
      mutationKind: "snapshot_adopted",
      mutationRefId: receipt.receiptId,
      snapshotState: "adopted",
      currentSnapshotId: snapshot.snapshotId,
      currentSnapshotVersion: snapshot.snapshotVersion,
      currentSnapshotDigest: snapshot.evidenceDigest,
      unrestrictedAvailableMinor: snapshot.unrestrictedAvailableMinor,
      openPayoutExposureMinor,
      unresolvedDebitExposureMinor,
      safetyBufferMinor,
      availableLiquidityMinor,
      adoptionReceiptId: receipt.receiptId,
      adoptionReceiptVersion: receipt.receiptVersion,
      adoptionReceiptDigest: receipt.canonicalDigest
    })
    .returning();
  if (!history) fail("persistence_write_incomplete");

  if (head) {
    const [updated] = await transaction
      .update(financeBankLiquidityHeads)
      .set({
        snapshotState: "adopted",
        currentSnapshotId: snapshot.snapshotId,
        currentSnapshotVersion: snapshot.snapshotVersion,
        currentSnapshotDigest: snapshot.evidenceDigest,
        revision: receipt.bankLiquidityRevision,
        lastHistoryId: history.historyId,
        unrestrictedAvailableMinor: snapshot.unrestrictedAvailableMinor,
        openPayoutExposureMinor,
        unresolvedDebitExposureMinor,
        safetyBufferMinor,
        availableLiquidityMinor
      })
      .where(
        and(
          eq(financeBankLiquidityHeads.id, head.id),
          eq(financeBankLiquidityHeads.revision, command.expectedBankLiquidityRevision)
        )
      )
      .returning({ id: financeBankLiquidityHeads.id });
    if (!updated) fail("bank_liquidity_revision_conflict");
  } else {
    await transaction.insert(financeBankLiquidityHeads).values({
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      snapshotState: "adopted",
      currentSnapshotId: snapshot.snapshotId,
      currentSnapshotVersion: snapshot.snapshotVersion,
      currentSnapshotDigest: snapshot.evidenceDigest,
      revision: receipt.bankLiquidityRevision,
      lastHistoryId: history.historyId,
      unrestrictedAvailableMinor: snapshot.unrestrictedAvailableMinor,
      openPayoutExposureMinor,
      unresolvedDebitExposureMinor,
      safetyBufferMinor,
      availableLiquidityMinor
    });
  }
  return mapReceipt(receipt);
}

async function findExactReplay<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
): Promise<BankLiquiditySnapshotAdoptionReceipt | null> {
  const [receipt] = await transaction
    .select()
    .from(financeBankLiquiditySnapshotAdoptionReceipts)
    .where(
      and(
        eq(financeBankLiquiditySnapshotAdoptionReceipts.bankCashPoolId, command.bankCashPoolId),
        eq(financeBankLiquiditySnapshotAdoptionReceipts.currency, command.currency),
        eq(financeBankLiquiditySnapshotAdoptionReceipts.snapshotId, command.snapshotId)
      )
    )
    .for("share");
  if (!receipt) return null;
  if (
    receipt.snapshotVersion !== command.snapshotVersion ||
    receipt.snapshotDigest !== command.evidence.evidenceDigest ||
    receipt.sourceCheckpoint !== command.evidence.sourceCheckpoint ||
    receipt.expectedBankLiquidityRevision !== command.expectedBankLiquidityRevision
  ) {
    fail("snapshot_conflict");
  }
  return mapReceipt(receipt);
}

function mapReceipt(
  row: typeof financeBankLiquiditySnapshotAdoptionReceipts.$inferSelect
): BankLiquiditySnapshotAdoptionReceipt {
  if (
    row.currency !== "RUB" ||
    row.receiptVersion !== 1 ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !digestMatches(row.canonicalDigest)
  ) {
    fail("persistence_write_incomplete");
  }
  return Object.freeze({
    ref: {
      kind: "bank_liquidity_snapshot_adoption_receipt",
      receiptId: row.receiptId,
      version: 1,
      canonicalDigest: row.canonicalDigest as FinanceDigest
    },
    bankCashPoolId: row.bankCashPoolId,
    currency: "RUB",
    bankLiquidityRevision: row.bankLiquidityRevision,
    sourceCheckpoint: row.sourceCheckpoint,
    databaseAdoptedAt: row.adoptedAt.toISOString(),
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef
  }) as BankLiquiditySnapshotAdoptionReceipt;
}

function normalizeEvidence(
  input: unknown,
  bankCashPoolId: string
): NormalizedCommand["evidence"] {
  exactRecord(input, [
    "kind",
    "bankCashPoolId",
    "balanceBasis",
    "unrestrictedAvailableMinor",
    "currency",
    "sourceCheckpoint",
    "asOf",
    "expiresAt",
    "evidenceDigest",
    "attestation"
  ]);
  if (
    input.kind !== "verified_bank_liquidity_snapshot_evidence" ||
    input.bankCashPoolId !== bankCashPoolId ||
    input.balanceBasis !== "unrestricted_available" ||
    input.currency !== "RUB"
  ) {
    fail("invalid_command");
  }
  const asOf = instant(input.asOf);
  const expiresAt = instant(input.expiresAt);
  if (!asOf || !expiresAt || expiresAt <= asOf) fail("invalid_command");
  exactRecord(input.attestation, ["kind", "attestationId", "version", "canonicalDigest"]);
  if (input.attestation.kind !== "bank_liquidity_snapshot_attestation_receipt" || input.attestation.version !== 1) {
    fail("invalid_command");
  }
  const attestationId = identifier(input.attestation.attestationId, 200);
  const evidenceDigest = digest(input.evidenceDigest);
  const attestationDigest = digest(input.attestation.canonicalDigest);
  if (evidenceDigest !== attestationDigest) fail("invalid_command");
  return Object.freeze({
    unrestrictedAvailableMinor: nonNegativeDecimal(input.unrestrictedAvailableMinor),
    sourceCheckpoint: identifier(input.sourceCheckpoint, 320),
    asOf,
    expiresAt,
    evidenceDigest,
    attestationId,
    attestationVersion: 1,
    attestationDigest
  });
}

function normalizeEnvelope(input: unknown): ResolvedFinanceOperationEnvelope {
  exactRecord(input, [
    "kind",
    "policyId",
    "policyVersion",
    "policyDigest",
    "maximumRows",
    "maximumDecimalDigits",
    "maximumArtifactBytes"
  ]);
  if (input.kind !== "resolved_finance_operation_envelope") fail("invalid_command");
  const policyVersion = positiveSafeInteger(input.policyVersion);
  const maximumRows = positiveSafeInteger(input.maximumRows);
  const maximumDecimalDigits = positiveSafeInteger(input.maximumDecimalDigits);
  const maximumArtifactBytes = positiveSafeInteger(input.maximumArtifactBytes);
  return Object.freeze({
    kind: "resolved_finance_operation_envelope",
    policyId: identifier(input.policyId, 160),
    policyVersion,
    policyDigest: digest(input.policyDigest),
    maximumRows,
    maximumDecimalDigits,
    maximumArtifactBytes
  }) as ResolvedFinanceOperationEnvelope;
}

function snapshotIdFor(
  bankCashPoolId: string,
  sourceCheckpoint: string,
  evidenceDigest: FinanceDigest
): string {
  const identity = createHash("sha256")
    .update(JSON.stringify([bankCashPoolId, "RUB", sourceCheckpoint, evidenceDigest]))
    .digest("hex");
  return `bank-liquidity-snapshot:${identity}`;
}

function exactRecord(input: unknown, expectedKeys: readonly string[]): asserts input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input) || nodeUtilTypes.isProxy(input)) {
    fail("invalid_command");
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    fail("invalid_command");
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}

function identifier(input: unknown, maximum: number): string {
  if (typeof input !== "string" || input.length === 0 || input.length > maximum || input.trim() !== input || /[\u0000-\u001f\u007f]/.test(input)) {
    fail("invalid_command");
  }
  return input;
}

function nonNegativeRevision(input: unknown): string {
  if (typeof input !== "string" || !/^(0|[1-9][0-9]*)$/.test(input)) fail("invalid_command");
  return input;
}

function nonNegativeDecimal(input: unknown): string {
  if (typeof input !== "string" || !/^(0|[1-9][0-9]*)$/.test(input)) fail("invalid_command");
  return input;
}

function positiveSafeInteger(input: unknown): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 1) {
    fail("invalid_command");
  }
  return input;
}

function digest(input: unknown): FinanceDigest {
  if (!digestMatches(input)) fail("invalid_command");
  return input as FinanceDigest;
}

function digestMatches(input: unknown): input is `sha256:${string}` {
  return typeof input === "string" && /^sha256:[a-f0-9]{64}$/.test(input);
}

function instant(input: unknown): Date | null {
  if (typeof input !== "string") return null;
  const value = new Date(input);
  return Number.isFinite(value.getTime()) ? value : null;
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function boundary<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof BankLiquiditySnapshotAdoptionPersistenceError) throw error;
    fail("invalid_command");
  }
}

function fail(reason: BankLiquiditySnapshotAdoptionPersistenceReason): never {
  throw new BankLiquiditySnapshotAdoptionPersistenceError(reason);
}
