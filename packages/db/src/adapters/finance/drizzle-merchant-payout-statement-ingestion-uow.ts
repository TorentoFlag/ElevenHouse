/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderAccountIdentityBinding,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type IngestVerifiedMerchantPayoutStatementCommand,
  type MerchantPayoutStatementIngestionCommitReceipt,
  type MerchantPayoutStatementIngestionUnitOfWork,
  type ResolvedFinanceOperationEnvelope,
  type VerifiedArcMerchantPayoutEvidence,
  type VerifiedArcMerchantPayoutStatementEvidence
} from "@elevenhouse/domain/finance-core";
import { types as nodeUtilTypes } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeMerchantPayoutPaymentInclusions,
  financeMerchantPayoutStatementReceipts
} from "../../schema/finance/merchant-payout-statements.schema";
import {
  financeCaptureFacts,
  financeEconomicPaymentIntents
} from "../../schema/finance/economic-payments.schema";
import {
  financeSettlementBatchIngestionCommitReceipts,
  financeSettlementPayouts
} from "../../schema/finance/settlement.schema";
import { encodeFinanceNumeric38 } from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

const commandKeys = ["batchIngestion", "payoutEvidence", "statementEvidence", "operationEnvelope"] as const;
const batchKeys = ["kind", "receiptId", "version", "canonicalDigest"] as const;
const payoutKeys = [
  "kind", "providerAccount", "merchantPayoutId", "providerBankPayoutId", "amountMinor", "currency",
  "outcome", "completedAt", "artifact", "observedAt"
] as const;
const statementKeys = [
  "kind", "providerAccount", "merchantPayoutId", "providerBankPayoutId", "bankReference",
  "reportedNetPayoutMinor", "currency", "decoderProfileId", "decoderProfileVersion",
  "decoderProfileDigest", "decodedPaymentLinesDigest", "includedPayments", "artifact", "observedAt"
] as const;
const artifactKeys = ["artifactId", "sha256Digest", "byteLength"] as const;
const lineKeys = [
  "lineNumber", "providerPaymentId", "externalId", "amountMinor", "feeAmountMinor", "currency", "lineDigest"
] as const;
const envelopeKeys = [
  "kind", "policyId", "policyVersion", "policyDigest", "maximumRows", "maximumDecimalDigits", "maximumArtifactBytes"
] as const;

export const merchantPayoutStatementIngestionWriteBoundaryValues = Object.freeze([
  "statement_receipt",
  "payment_inclusions"
] as const);

export type MerchantPayoutStatementIngestionWriteBoundary =
  (typeof merchantPayoutStatementIngestionWriteBoundaryValues)[number];

export type MerchantPayoutStatementIngestionFailureInjector = (
  boundary: MerchantPayoutStatementIngestionWriteBoundary
) => void | Promise<void>;

export type MerchantPayoutStatementIngestionPersistenceReason =
  | "invalid_command"
  | "evidence_correlation_conflict"
  | "duplicate_statement_line"
  | "duplicate_statement_payment"
  | "batch_ingestion_not_found"
  | "batch_ingestion_conflict"
  | "statement_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class MerchantPayoutStatementIngestionPersistenceError extends Error {
  readonly code = "merchant_payout_statement_ingestion_persistence_error";

  constructor(readonly reason: MerchantPayoutStatementIngestionPersistenceReason) {
    super("Merchant payout statement could not be committed atomically");
    this.name = "MerchantPayoutStatementIngestionPersistenceError";
  }
}

type NormalizedLine = Readonly<{
  lineNumber: number;
  providerPaymentId: string;
  externalId: string;
  amountMinor: bigint;
  feeAmountMinor: bigint;
  currency: "RUB";
  lineDigest: FinanceDigest;
}>;

export type NormalizedMerchantPayoutStatementIngestionCommand = Readonly<{
  batchIngestion: Readonly<{ receiptId: string; canonicalDigest: FinanceDigest }>;
  payoutEvidence: Readonly<{
    providerAccount: FinanceProviderAccountIdentity;
    merchantPayoutId: string;
    providerBankPayoutId: string;
    amountMinor: bigint;
    completedAt: Date;
    observedAt: Date;
    artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: bigint }>;
  }>;
  statementEvidence: Readonly<{
    bankReference: string;
    reportedNetPayoutMinor: bigint;
    decoderProfileId: string;
    decoderProfileVersion: number;
    decoderProfileDigest: FinanceDigest;
    decodedPaymentLinesDigest: FinanceDigest;
    artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: bigint }>;
    observedAt: Date;
    includedPayments: readonly NormalizedLine[];
  }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

/**
 * Persists only decoder-verified ArcPay payout statement evidence. This does not credit bank_cash,
 * move clearing, or advance an individual payment: those later operations consume this receipt.
 */
export function createDrizzleMerchantPayoutStatementIngestionUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly afterWriteBoundary?: MerchantPayoutStatementIngestionFailureInjector;
}): MerchantPayoutStatementIngestionUnitOfWork {
  return Object.freeze({
    async ingestVerifiedMerchantPayoutStatement(command) {
      const normalized = normalizeMerchantPayoutStatementIngestionCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          ingestInTransaction(transaction, normalized, input.afterWriteBoundary ?? noFailureInjection)
        );
      } catch (error) {
        if (error instanceof MerchantPayoutStatementIngestionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("statement_conflict");
        if (code === "23503" || code === "23514" || code === "55000") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies MerchantPayoutStatementIngestionUnitOfWork);
}

export function normalizeMerchantPayoutStatementIngestionCommand(
  input: IngestVerifiedMerchantPayoutStatementCommand
): NormalizedMerchantPayoutStatementIngestionCommand {
  return boundary(() => {
    exactRecord(input, commandKeys);
    exactRecord(input.batchIngestion, batchKeys);
    if (input.batchIngestion.kind !== "settlement_batch_ingestion_commit_receipt" || input.batchIngestion.version !== 1) fail("invalid_command");
    const batchIngestion = {
      receiptId: identifier(input.batchIngestion.receiptId, 200),
      canonicalDigest: digest(input.batchIngestion.canonicalDigest)
    };
    const payoutEvidence = normalizePayoutEvidence(input.payoutEvidence);
    const statementEvidence = normalizeStatementEvidence(input.statementEvidence, payoutEvidence);
    const operationEnvelope = normalizeEnvelope(input.operationEnvelope);
    if (
      statementEvidence.includedPayments.length > operationEnvelope.maximumRows ||
      statementEvidence.artifact.byteLength > BigInt(operationEnvelope.maximumArtifactBytes) ||
      decimalDigits(statementEvidence.reportedNetPayoutMinor) > operationEnvelope.maximumDecimalDigits ||
      statementEvidence.includedPayments.some(
        (line) =>
          decimalDigits(line.amountMinor) > operationEnvelope.maximumDecimalDigits ||
          decimalDigits(line.feeAmountMinor) > operationEnvelope.maximumDecimalDigits
      )
    ) fail("invalid_command");
    return Object.freeze({ batchIngestion, payoutEvidence, statementEvidence, operationEnvelope });
  });
}

async function ingestInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedMerchantPayoutStatementIngestionCommand,
  afterWriteBoundary: MerchantPayoutStatementIngestionFailureInjector
): Promise<MerchantPayoutStatementIngestionCommitReceipt> {
  const provider = command.payoutEvidence.providerAccount;
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(
    ${`${provider.seriesId}:${provider.providerAccountId}:${provider.identityVersion}:${command.payoutEvidence.merchantPayoutId}`}, 0
  ))`);
  const [batch] = await transaction
    .select({
      receiptId: financeSettlementBatchIngestionCommitReceipts.receiptId,
      stream: financeSettlementBatchIngestionCommitReceipts.stream,
      settlementPageId: financeSettlementBatchIngestionCommitReceipts.settlementPageId,
      providerAccountSeriesId: financeSettlementBatchIngestionCommitReceipts.providerAccountSeriesId,
      providerAccountId: financeSettlementBatchIngestionCommitReceipts.providerAccountId,
      providerIdentityVersion: financeSettlementBatchIngestionCommitReceipts.providerIdentityVersion
    })
    .from(financeSettlementBatchIngestionCommitReceipts)
    .where(and(
      eq(financeSettlementBatchIngestionCommitReceipts.receiptId, command.batchIngestion.receiptId),
      eq(financeSettlementBatchIngestionCommitReceipts.receiptVersion, 1),
      eq(financeSettlementBatchIngestionCommitReceipts.canonicalDigest, command.batchIngestion.canonicalDigest)
    ))
    .for("update");
  if (!batch) fail("batch_ingestion_not_found");
  if (batch.stream !== "settlement_payouts" ||
      batch.providerAccountSeriesId !== provider.seriesId ||
      batch.providerAccountId !== provider.providerAccountId ||
      batch.providerIdentityVersion !== provider.identityVersion) fail("batch_ingestion_conflict");

  const [payout] = await transaction
    .select({ id: financeSettlementPayouts.id })
    .from(financeSettlementPayouts)
    .where(and(
      eq(financeSettlementPayouts.providerAccountSeriesId, provider.seriesId),
      eq(financeSettlementPayouts.providerAccountId, provider.providerAccountId),
      eq(financeSettlementPayouts.providerIdentityVersion, provider.identityVersion),
      eq(financeSettlementPayouts.merchantPayoutId, command.payoutEvidence.merchantPayoutId)
    ))
    .for("update");
  if (!payout) fail("batch_ingestion_conflict");

  const [existing] = await transaction
    .select()
    .from(financeMerchantPayoutStatementReceipts)
    .where(and(
      eq(financeMerchantPayoutStatementReceipts.providerAccountSeriesId, provider.seriesId),
      eq(financeMerchantPayoutStatementReceipts.providerAccountId, provider.providerAccountId),
      eq(financeMerchantPayoutStatementReceipts.providerIdentityVersion, provider.identityVersion),
      eq(financeMerchantPayoutStatementReceipts.merchantPayoutId, command.payoutEvidence.merchantPayoutId)
    ))
    .for("update");
  if (existing) return replayExisting(transaction, existing, command);

  const [statement] = await transaction
    .insert(financeMerchantPayoutStatementReceipts)
    .values({
      batchIngestionReceiptId: command.batchIngestion.receiptId,
      batchIngestionReceiptVersion: 1,
      batchIngestionReceiptDigest: command.batchIngestion.canonicalDigest,
      settlementPageId: batch.settlementPageId,
      settlementPayoutId: payout.id,
      providerAccountSeriesId: provider.seriesId,
      providerAccountId: provider.providerAccountId,
      providerIdentityVersion: provider.identityVersion,
      merchantPayoutId: command.payoutEvidence.merchantPayoutId,
      providerBankPayoutId: command.payoutEvidence.providerBankPayoutId,
      bankReference: command.statementEvidence.bankReference,
      reportedNetPayoutMinor: encodeFinanceNumeric38(command.statementEvidence.reportedNetPayoutMinor),
      currency: "RUB",
      outcome: "completed",
      payoutEvidenceArtifactId: command.payoutEvidence.artifact.artifactId,
      payoutEvidenceArtifactDigest: command.payoutEvidence.artifact.sha256Digest,
      payoutEvidenceArtifactByteLength: encodeFinanceNumeric38(command.payoutEvidence.artifact.byteLength),
      payoutCompletedAt: command.payoutEvidence.completedAt,
      payoutObservedAt: command.payoutEvidence.observedAt,
      statementArtifactId: command.statementEvidence.artifact.artifactId,
      statementArtifactDigest: command.statementEvidence.artifact.sha256Digest,
      statementArtifactByteLength: encodeFinanceNumeric38(command.statementEvidence.artifact.byteLength),
      decoderProfileId: command.statementEvidence.decoderProfileId,
      decoderProfileVersion: command.statementEvidence.decoderProfileVersion,
      decoderProfileDigest: command.statementEvidence.decoderProfileDigest,
      decodedPaymentLinesDigest: command.statementEvidence.decodedPaymentLinesDigest,
      includedPaymentCount: command.statementEvidence.includedPayments.length,
      statementObservedAt: command.statementEvidence.observedAt,
      operationPolicyId: command.operationEnvelope.policyId,
      operationPolicyVersion: command.operationEnvelope.policyVersion,
      operationPolicyDigest: command.operationEnvelope.policyDigest,
      maximumRows: command.operationEnvelope.maximumRows,
      maximumDecimalDigits: command.operationEnvelope.maximumDecimalDigits,
      maximumArtifactBytes: encodeFinanceNumeric38(BigInt(command.operationEnvelope.maximumArtifactBytes))
    })
    .returning();
  if (!statement) fail("persistence_write_incomplete");
  await afterWriteBoundary("statement_receipt");

  const inclusions = [] as Array<{ receiptId: string; canonicalDigest: string; providerPaymentId: string; externalId: string; lineNumber: number }>;
  for (const line of command.statementEvidence.includedPayments) {
    const [economicIntent] = await transaction
      .select({ id: financeEconomicPaymentIntents.id })
      .from(financeEconomicPaymentIntents)
      .where(and(
        eq(financeEconomicPaymentIntents.sourceId, line.externalId),
        eq(financeEconomicPaymentIntents.seriesId, provider.seriesId),
        eq(financeEconomicPaymentIntents.providerAccountId, provider.providerAccountId),
        eq(financeEconomicPaymentIntents.providerIdentityVersion, provider.identityVersion)
      ))
      .for("update");
    if (!economicIntent) fail("persistence_write_incomplete");
    const [captureFact] = await transaction
      .select({ id: financeCaptureFacts.id })
      .from(financeCaptureFacts)
      .where(and(
        eq(financeCaptureFacts.economicPaymentIntentId, economicIntent.id),
        eq(financeCaptureFacts.providerPaymentId, line.providerPaymentId)
      ))
      .for("update");
    if (!captureFact) fail("persistence_write_incomplete");
    const [inclusion] = await transaction.insert(financeMerchantPayoutPaymentInclusions).values({
      statementReceiptId: statement.receiptId,
      statementReceiptVersion: 1,
      statementReceiptDigest: statement.canonicalDigest,
      providerAccountSeriesId: provider.seriesId,
      providerAccountId: provider.providerAccountId,
      providerIdentityVersion: provider.identityVersion,
      merchantPayoutId: command.payoutEvidence.merchantPayoutId,
      economicPaymentIntentId: economicIntent.id,
      captureFactId: captureFact.id,
      providerPaymentId: line.providerPaymentId,
      externalId: line.externalId,
      lineNumber: line.lineNumber,
      amountMinor: encodeFinanceNumeric38(line.amountMinor),
      feeAmountMinor: encodeFinanceNumeric38(line.feeAmountMinor),
      currency: "RUB",
      lineDigest: line.lineDigest
    }).returning({ receiptId: financeMerchantPayoutPaymentInclusions.receiptId, canonicalDigest: financeMerchantPayoutPaymentInclusions.canonicalDigest, providerPaymentId: financeMerchantPayoutPaymentInclusions.providerPaymentId, externalId: financeMerchantPayoutPaymentInclusions.externalId, lineNumber: financeMerchantPayoutPaymentInclusions.lineNumber });
    if (!inclusion) fail("persistence_write_incomplete");
    inclusions.push(inclusion);
  }
  await afterWriteBoundary("payment_inclusions");
  return mapReceipt(statement, provider, inclusions);
}

function normalizePayoutEvidence(input: VerifiedArcMerchantPayoutEvidence) {
  exactRecord(input, payoutKeys);
  if (input.kind !== "verified_arc_merchant_payout_evidence" || input.currency !== "RUB" || input.outcome !== "completed") fail("invalid_command");
  const providerAccount = normalizeProviderAccount(input.providerAccount);
  const completedAt = instant(input.completedAt);
  const observedAt = instant(input.observedAt);
  if (observedAt < completedAt) fail("invalid_command");
  return Object.freeze({ providerAccount, merchantPayoutId: identifier(input.merchantPayoutId, 200), providerBankPayoutId: identifier(input.providerBankPayoutId, 500), amountMinor: positiveMinor(input.amountMinor), completedAt, observedAt, artifact: normalizeArtifact(input.artifact) });
}

function normalizeStatementEvidence(input: VerifiedArcMerchantPayoutStatementEvidence, payout: ReturnType<typeof normalizePayoutEvidence>) {
  exactRecord(input, statementKeys);
  if (input.kind !== "verified_arc_merchant_payout_statement_evidence" || input.currency !== "RUB") fail("invalid_command");
  const providerAccount = normalizeProviderAccount(input.providerAccount);
  if (providerAccount.seriesId !== payout.providerAccount.seriesId || providerAccount.providerAccountId !== payout.providerAccount.providerAccountId || providerAccount.identityVersion !== payout.providerAccount.identityVersion || input.merchantPayoutId !== payout.merchantPayoutId || input.providerBankPayoutId !== payout.providerBankPayoutId || input.reportedNetPayoutMinor !== payout.amountMinor.toString()) fail("evidence_correlation_conflict");
  if (!Array.isArray(input.includedPayments) || input.includedPayments.length === 0) fail("invalid_command");
  const lines = input.includedPayments.map(normalizeLine);
  const lineNumbers = new Set<number>(); const providerPayments = new Set<string>(); const externalIds = new Set<string>();
  for (const line of lines) {
    if (lineNumbers.has(line.lineNumber)) fail("duplicate_statement_line");
    if (providerPayments.has(line.providerPaymentId) || externalIds.has(line.externalId)) fail("duplicate_statement_payment");
    lineNumbers.add(line.lineNumber); providerPayments.add(line.providerPaymentId); externalIds.add(line.externalId);
  }
  return Object.freeze({ bankReference: identifier(input.bankReference, 320), reportedNetPayoutMinor: positiveMinor(input.reportedNetPayoutMinor), decoderProfileId: identifier(input.decoderProfileId, 160), decoderProfileVersion: positiveSafeInteger(input.decoderProfileVersion), decoderProfileDigest: digest(input.decoderProfileDigest), decodedPaymentLinesDigest: digest(input.decodedPaymentLinesDigest), artifact: normalizeArtifact(input.artifact), observedAt: instant(input.observedAt), includedPayments: Object.freeze(lines) });
}

function normalizeLine(input: unknown): NormalizedLine {
  exactRecord(input, lineKeys);
  if (input.currency !== "RUB") fail("invalid_command");
  return Object.freeze({ lineNumber: positiveSafeInteger(input.lineNumber), providerPaymentId: identifier(input.providerPaymentId, 160), externalId: identifier(input.externalId, 160), amountMinor: positiveMinor(input.amountMinor), feeAmountMinor: signedMinor(input.feeAmountMinor), currency: "RUB", lineDigest: digest(input.lineDigest) });
}

function normalizeProviderAccount(input: unknown): FinanceProviderAccountIdentity {
  try { return createProviderAccountIdentityBinding(input as FinanceProviderAccountIdentity); } catch { fail("invalid_command"); }
}
function normalizeArtifact(input: unknown) { exactRecord(input, artifactKeys); return Object.freeze({ artifactId: identifier(input.artifactId, 160), sha256Digest: digest(input.sha256Digest), byteLength: unsignedSafeIntegerAsMinor(input.byteLength) }); }
function normalizeEnvelope(input: unknown): ResolvedFinanceOperationEnvelope { exactRecord(input, envelopeKeys); if (input.kind !== "resolved_finance_operation_envelope") fail("invalid_command"); return Object.freeze({ kind: input.kind, policyId: identifier(input.policyId, 160), policyVersion: positiveSafeInteger(input.policyVersion), policyDigest: digest(input.policyDigest), maximumRows: positiveSafeInteger(input.maximumRows), maximumDecimalDigits: positiveSafeInteger(input.maximumDecimalDigits), maximumArtifactBytes: positiveSafeInteger(input.maximumArtifactBytes) }) as ResolvedFinanceOperationEnvelope; }
function replayExisting<TSchema extends Record<string, unknown>>(transaction: FinanceTransaction<TSchema>, existing: typeof financeMerchantPayoutStatementReceipts.$inferSelect, command: NormalizedMerchantPayoutStatementIngestionCommand) { if (existing.providerBankPayoutId !== command.payoutEvidence.providerBankPayoutId || existing.bankReference !== command.statementEvidence.bankReference || existing.reportedNetPayoutMinor !== command.statementEvidence.reportedNetPayoutMinor.toString() || existing.statementArtifactId !== command.statementEvidence.artifact.artifactId || existing.statementArtifactDigest !== command.statementEvidence.artifact.sha256Digest) fail("statement_conflict"); return transaction.select({ receiptId: financeMerchantPayoutPaymentInclusions.receiptId, canonicalDigest: financeMerchantPayoutPaymentInclusions.canonicalDigest, providerPaymentId: financeMerchantPayoutPaymentInclusions.providerPaymentId, externalId: financeMerchantPayoutPaymentInclusions.externalId, lineNumber: financeMerchantPayoutPaymentInclusions.lineNumber }).from(financeMerchantPayoutPaymentInclusions).where(eq(financeMerchantPayoutPaymentInclusions.statementReceiptId, existing.receiptId)).orderBy(financeMerchantPayoutPaymentInclusions.lineNumber).then((inclusions) => mapReceipt(existing, command.payoutEvidence.providerAccount, inclusions)); }
function mapReceipt(statement: typeof financeMerchantPayoutStatementReceipts.$inferSelect, providerAccount: FinanceProviderAccountIdentity, inclusions: readonly { receiptId: string; canonicalDigest: string; providerPaymentId: string; externalId: string; lineNumber: number }[]): MerchantPayoutStatementIngestionCommitReceipt { return Object.freeze({ ref: { kind: "merchant_payout_statement_ingestion_commit_receipt", receiptId: statement.receiptId, version: 1, canonicalDigest: statement.canonicalDigest as FinanceDigest }, providerAccount, merchantPayoutId: statement.merchantPayoutId, providerBankPayoutId: statement.providerBankPayoutId, bankReference: statement.bankReference, reportedNetPayoutMinor: statement.reportedNetPayoutMinor, currency: "RUB", outcome: "completed", statementArtifact: { artifactId: statement.statementArtifactId, sha256Digest: statement.statementArtifactDigest as FinanceDigest, byteLength: BigInt(statement.statementArtifactByteLength) }, decodedPaymentLinesDigest: statement.decodedPaymentLinesDigest as FinanceDigest, paymentInclusions: inclusions.map((item) => Object.freeze({ ref: { kind: "merchant_payout_payment_inclusion_commit_receipt", receiptId: item.receiptId, version: 1, canonicalDigest: item.canonicalDigest as FinanceDigest }, providerPaymentId: item.providerPaymentId, externalId: item.externalId, lineNumber: item.lineNumber })), persistenceTransactionBoundaryRef: statement.persistenceTransactionBoundaryRef, committedAt: statement.committedAt.toISOString() }) as unknown as MerchantPayoutStatementIngestionCommitReceipt; }
function exactRecord(input: unknown, keys: readonly string[]): asserts input is Record<string, unknown> { if (typeof input !== "object" || input === null || Array.isArray(input) || nodeUtilTypes.isProxy(input) || Object.keys(input).length !== keys.length || !keys.every((key) => Object.prototype.hasOwnProperty.call(input, key))) fail("invalid_command"); }
function identifier(input: unknown, max: number): string { if (typeof input !== "string" || input.length === 0 || input.length > max || input.trim() !== input || /[\u0000-\u001f\u007f]/.test(input)) fail("invalid_command"); return input; }
function digest(input: unknown): FinanceDigest { if (typeof input !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input)) fail("invalid_command"); return input as FinanceDigest; }
function positiveSafeInteger(input: unknown): number { if (!Number.isSafeInteger(input) || (input as number) < 1) fail("invalid_command"); return input as number; }
function positiveMinor(input: unknown): bigint { const value = signedMinor(input); if (value < 1n) fail("invalid_command"); return value; }
function unsignedSafeIntegerAsMinor(input: unknown): bigint { if (!Number.isSafeInteger(input) || (input as number) < 0) fail("invalid_command"); return BigInt(input as number); }
function signedMinor(input: unknown): bigint { if (typeof input !== "string" || !/^-?(0|[1-9][0-9]{0,37})$/.test(input)) fail("invalid_command"); return BigInt(input); }
function decimalDigits(input: bigint): number { return input < 0n ? (-input).toString().length : input.toString().length; }
function instant(input: unknown): Date { if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) fail("invalid_command"); const value = new Date(input); if (Number.isNaN(value.getTime()) || value.toISOString() !== input) fail("invalid_command"); return value; }
function noFailureInjection(): void {}
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function boundary<T>(callback: () => T): T { try { return callback(); } catch (error) { if (error instanceof MerchantPayoutStatementIngestionPersistenceError) throw error; fail("invalid_command"); } }
function fail(reason: MerchantPayoutStatementIngestionPersistenceReason): never { throw new MerchantPayoutStatementIngestionPersistenceError(reason); }
