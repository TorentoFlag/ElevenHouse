/* eslint-disable no-control-regex -- financial persistence boundary rejects control characters. */
import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import type {
  BankStatementIngestionCommitReceipt,
  BankStatementIngestionUnitOfWork,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope,
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeBankStatementImports,
  financeBankStatementIngestionReceipts,
  financeBankStatementRows
} from "../../schema/finance/bank-cash.schema";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type BankStatementIngestionPersistenceReason =
  | "invalid_command"
  | "statement_conflict"
  | "artifact_or_pool_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class BankStatementIngestionPersistenceError extends Error {
  readonly code = "bank_statement_ingestion_persistence_error";

  constructor(readonly reason: BankStatementIngestionPersistenceReason) {
    super("Verified bank statement evidence could not be committed atomically");
    this.name = "BankStatementIngestionPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  bankCashPoolId: string;
  expectedStatementImportVersion: string;
  evidence: Readonly<{
    bankStatementEntryId: string;
    sourceStatementId: string;
    sourceCheckpoint: string;
    sourceRowId: string;
    direction: "credit" | "debit";
    amountMinor: string;
    occurredAt: Date;
    bankReference: string;
    artifactId: string;
    artifactDigest: FinanceDigest;
    artifactByteLength: string;
    statementSourceFingerprint: FinanceDigest;
  }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

/**
 * This is evidence ingestion only. It never posts bank cash or clearing: a separate match command
 * must consume this immutable receipt together with an exact V2 payout-paid receipt.
 */
export function createDrizzleBankStatementIngestionUnitOfWork<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): BankStatementIngestionUnitOfWork {
  return Object.freeze({
    async ingestVerifiedStatementEntry(command) {
      const normalized = normalizeBankStatementIngestionCommand(command);
      try {
        return await input.database.transaction((transaction) => ingest(transaction, normalized));
      } catch (error) {
        if (error instanceof BankStatementIngestionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("statement_conflict");
        if (code === "23503" || code === "23514" || code === "55000") fail("artifact_or_pool_conflict");
        throw error;
      }
    }
  } satisfies BankStatementIngestionUnitOfWork);
}

export function normalizeBankStatementIngestionCommand(input: unknown): NormalizedCommand {
  return boundary(() => {
    exactRecord(input, ["bankCashPoolId", "expectedStatementImportVersion", "evidence", "operationEnvelope"]);
    const bankCashPoolId = identifier(input.bankCashPoolId, 160);
    const expectedStatementImportVersion = revision(input.expectedStatementImportVersion);
    const evidence = normalizeEvidence(input.evidence, bankCashPoolId);
    const operationEnvelope = normalizeEnvelope(input.operationEnvelope);
    if (
      BigInt(evidence.artifactByteLength) > BigInt(operationEnvelope.maximumArtifactBytes) ||
      decimalDigits(evidence.amountMinor) > operationEnvelope.maximumDecimalDigits
    ) fail("invalid_command");
    return Object.freeze({ bankCashPoolId, expectedStatementImportVersion, evidence, operationEnvelope });
  });
}

async function ingest<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  command: NormalizedCommand
): Promise<BankStatementIngestionCommitReceipt> {
  const evidence = command.evidence;
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(
    ${`${command.bankCashPoolId}:${evidence.sourceStatementId}:${evidence.sourceRowId}`}, 0
  ))`);
  const [existing] = await transaction
    .select()
    .from(financeBankStatementIngestionReceipts)
    .where(and(
      eq(financeBankStatementIngestionReceipts.bankCashPoolId, command.bankCashPoolId),
      eq(financeBankStatementIngestionReceipts.bankStatementEntryId, evidence.bankStatementEntryId),
      eq(financeBankStatementIngestionReceipts.sourceStatementId, evidence.sourceStatementId),
      eq(financeBankStatementIngestionReceipts.sourceRowId, evidence.sourceRowId)
    ))
    .limit(2)
    .for("update");
  if (existing) {
    /*
     * A receipt intentionally stores only the source-row natural key. The immutable import is the
     * owner of the decoder checkpoint; load it under the same transaction lock before treating a
     * retry as idempotent. Otherwise a caller could replay one row with a different checkpoint and
     * receive a receipt that appears to bind evidence which was never committed.
     */
    const [existingImport] = await transaction
      .select({ sourceCheckpoint: financeBankStatementImports.sourceCheckpoint })
      .from(financeBankStatementImports)
      .where(eq(financeBankStatementImports.id, existing.statementImportId))
      .limit(2)
      .for("update");
    if (!existingImport || existingImport.sourceCheckpoint !== evidence.sourceCheckpoint) {
      fail("statement_conflict");
    }
    return replay(existing, command);
  }

  const importId = deterministicId("bank-statement-import", {
    bankCashPoolId: command.bankCashPoolId,
    sourceStatementId: evidence.sourceStatementId,
    sourceCheckpoint: evidence.sourceCheckpoint,
    version: command.expectedStatementImportVersion,
    artifactDigest: evidence.artifactDigest
  });
  const normalizedRowsDigest = digest({
    bankStatementEntryId: evidence.bankStatementEntryId,
    sourceStatementId: evidence.sourceStatementId,
    sourceCheckpoint: evidence.sourceCheckpoint,
    sourceRowId: evidence.sourceRowId,
    direction: evidence.direction,
    amountMinor: evidence.amountMinor,
    bankReference: evidence.bankReference,
    occurredAt: evidence.occurredAt.toISOString()
  });
  await transaction.insert(financeBankStatementImports).values({
    id: importId,
    bankCashPoolId: command.bankCashPoolId,
    currency: "RUB",
    artifactId: evidence.artifactId,
    artifactSha256Digest: evidence.artifactDigest,
    artifactByteLength: evidence.artifactByteLength,
    statementSourceFingerprint: evidence.statementSourceFingerprint,
    sourceStatementId: evidence.sourceStatementId,
    sourceCheckpoint: evidence.sourceCheckpoint,
    importVersion: command.expectedStatementImportVersion,
    normalizedRowsDigest
  });
  await transaction.insert(financeBankStatementRows).values({
    bankStatementEntryId: evidence.bankStatementEntryId,
    statementImportId: importId,
    bankCashPoolId: command.bankCashPoolId,
    currency: "RUB",
    sourceStatementId: evidence.sourceStatementId,
    sourceRowId: evidence.sourceRowId,
    direction: evidence.direction,
    signedAmountMinor: evidence.direction === "debit" ? `-${evidence.amountMinor}` : evidence.amountMinor,
    bankReference: evidence.bankReference,
    occurredAt: evidence.occurredAt,
    evidenceDigest: normalizedRowsDigest
  });
  const [receipt] = await transaction.insert(financeBankStatementIngestionReceipts).values({
    statementImportId: importId,
    bankStatementEntryId: evidence.bankStatementEntryId,
    bankCashPoolId: command.bankCashPoolId,
    currency: "RUB",
    sourceStatementId: evidence.sourceStatementId,
    sourceRowId: evidence.sourceRowId,
    artifactId: evidence.artifactId,
    artifactSha256Digest: evidence.artifactDigest,
    artifactByteLength: evidence.artifactByteLength,
    statementSourceFingerprint: evidence.statementSourceFingerprint,
    statementImportVersion: command.expectedStatementImportVersion,
    dedupeResult: "inserted",
    persistenceTransactionBoundaryRef: sql`'postgres-xid:' || pg_current_xact_id()::text`
  }).returning();
  if (!receipt) fail("persistence_write_incomplete");
  return mapReceipt(receipt, evidence.sourceCheckpoint, "inserted");
}

function replay(row: typeof financeBankStatementIngestionReceipts.$inferSelect, command: NormalizedCommand) {
  const evidence = command.evidence;
  if (
    row.currency !== "RUB" || row.artifactId !== evidence.artifactId ||
    row.artifactSha256Digest !== evidence.artifactDigest || row.artifactByteLength !== evidence.artifactByteLength ||
    row.statementSourceFingerprint !== evidence.statementSourceFingerprint ||
    row.statementImportVersion !== command.expectedStatementImportVersion
  ) fail("statement_conflict");
  return mapReceipt(row, evidence.sourceCheckpoint, "replay");
}

function mapReceipt(row: typeof financeBankStatementIngestionReceipts.$inferSelect, sourceCheckpoint: string, dedupeResult: "inserted" | "replay"): BankStatementIngestionCommitReceipt {
  if (row.currency !== "RUB" || row.journalTransactionId !== null || !digestValue(row.canonicalDigest) || !boundaryRef(row.persistenceTransactionBoundaryRef)) fail("persistence_write_incomplete");
  return Object.freeze({
    ref: Object.freeze({ kind: "bank_statement_ingestion_commit_receipt", receiptId: row.receiptId, version: 1, canonicalDigest: row.canonicalDigest as FinanceDigest }),
    bankCashPoolId: row.bankCashPoolId,
    bankStatementEntryId: row.bankStatementEntryId,
    sourceStatementId: row.sourceStatementId,
    sourceCheckpoint,
    sourceRowId: row.sourceRowId,
    artifact: Object.freeze({ artifactId: row.artifactId, sha256Digest: row.artifactSha256Digest as FinanceDigest, byteLength: Number(row.artifactByteLength), bankCashPoolId: row.bankCashPoolId, statementSourceFingerprint: row.statementSourceFingerprint as FinanceDigest }),
    statementImportVersion: row.statementImportVersion,
    dedupeResult,
    journalTransactionId: null,
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
    committedAt: row.committedAt.toISOString()
  }) as unknown as BankStatementIngestionCommitReceipt;
}

function normalizeEvidence(value: unknown, bankCashPoolId: string): NormalizedCommand["evidence"] {
  exactRecord(value, ["kind", "bankCashPoolId", "bankStatementEntryId", "sourceStatementId", "sourceCheckpoint", "sourceRowId", "direction", "amountMinor", "currency", "occurredAt", "bankReference", "artifact"]);
  if (value.kind !== "verified_bank_statement_evidence" || value.bankCashPoolId !== bankCashPoolId || value.currency !== "RUB") fail("invalid_command");
  exactRecord(value.artifact, ["artifactId", "sha256Digest", "byteLength", "bankCashPoolId", "statementSourceFingerprint"]);
  if (value.artifact.bankCashPoolId !== bankCashPoolId || (value.direction !== "credit" && value.direction !== "debit")) fail("invalid_command");
  return Object.freeze({
    bankStatementEntryId: identifier(value.bankStatementEntryId, 200), sourceStatementId: identifier(value.sourceStatementId, 320), sourceCheckpoint: identifier(value.sourceCheckpoint, 320), sourceRowId: identifier(value.sourceRowId, 320), direction: value.direction,
    amountMinor: positiveDecimal(value.amountMinor), occurredAt: instant(value.occurredAt), bankReference: identifier(value.bankReference, 320), artifactId: identifier(value.artifact.artifactId, 160), artifactDigest: digestValue(value.artifact.sha256Digest), artifactByteLength: nonNegativeByteLength(value.artifact.byteLength), statementSourceFingerprint: digestValue(value.artifact.statementSourceFingerprint)
  });
}

function normalizeEnvelope(value: unknown): ResolvedFinanceOperationEnvelope {
  exactRecord(value, ["kind", "policyId", "policyVersion", "policyDigest", "maximumRows", "maximumDecimalDigits", "maximumArtifactBytes"]);
  if (value.kind !== "resolved_finance_operation_envelope") fail("invalid_command");
  return Object.freeze({ kind: "resolved_finance_operation_envelope", policyId: identifier(value.policyId, 160), policyVersion: positiveInteger(value.policyVersion), policyDigest: digestValue(value.policyDigest), maximumRows: positiveInteger(value.maximumRows), maximumDecimalDigits: positiveInteger(value.maximumDecimalDigits), maximumArtifactBytes: nonNegativeInteger(value.maximumArtifactBytes) }) as ResolvedFinanceOperationEnvelope;
}
function deterministicId(prefix: string, value: unknown) { return `${prefix}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function digest(value: unknown): FinanceDigest { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function exactRecord(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value) || nodeUtilTypes.isProxy(value) || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.prototype.propertyIsEnumerable.call(value, key))) fail("invalid_command"); }
function identifier(value: unknown, maximum: number): string { if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail("invalid_command"); return value; }
function revision(value: unknown): string { if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) fail("invalid_command"); return value; }
function positiveInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail("invalid_command"); return value; }
function nonNegativeInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("invalid_command"); return value; }
function positiveDecimal(value: unknown): string { const normalized = nonNegativeDecimal(value); if (normalized === "0") fail("invalid_command"); return normalized; }
function nonNegativeDecimal(value: unknown): string { if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) fail("invalid_command"); return value; }
function nonNegativeByteLength(value: unknown): string { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("invalid_command"); return String(value); }
function decimalDigits(value: string) { return value.length; }
function instant(value: unknown): Date { if (typeof value !== "string") fail("invalid_command"); const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) fail("invalid_command"); return parsed; }
function digestValue(value: unknown): FinanceDigest { if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail("invalid_command"); return value as FinanceDigest; }
function boundaryRef(value: unknown): value is string { return typeof value === "string" && /^postgres-xid:[0-9]+$/.test(value); }
function postgresCode(error: unknown) { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function boundary<T>(callback: () => T): T { try { return callback(); } catch (error) { if (error instanceof BankStatementIngestionPersistenceError) throw error; fail("invalid_command"); } }
function fail(reason: BankStatementIngestionPersistenceReason): never { throw new BankStatementIngestionPersistenceError(reason); }
