import {
  createProviderAccountIdentityBinding,
  createProviderSettlementEntryKey,
  digestFinanceCanonicalValueV1,
  serializeProviderSettlementEntryKey,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type MatchSettlementPaymentCommand,
  type ResolvedFinanceOperationEnvelope,
  type SettlementPaymentCorrelationRule,
  type SettlementPaymentMatchCommitReceipt,
  type SettlementPaymentMatchUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeCaptureFacts,
  financeEconomicPaymentIntents,
  financePaymentClearingHeads
} from "../../schema/finance/economic-payments.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import {
  financeSettlementBatchIngestionCommitReceipts,
  financeSettlementExceptions,
  financeSettlementLedgerEntries,
  financeSettlementLedgerPageEntries,
  financeSettlementPaymentMatchCommitReceipts
} from "../../schema/finance/settlement.schema";
import { decodeFinancePositiveRevision, encodeFinanceNumeric38 } from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type SettlementPaymentCorrelationRuleDefinition = Readonly<{
  rule: SettlementPaymentCorrelationRule;
  referenceType: string;
  direction: string;
  entryType: string;
  settlementStatus: string | null;
  amountRelation: "same_minor" | "negated_minor";
}>;

export const settlementPaymentMatchWriteBoundaryValues = Object.freeze([
  "settlement_exception",
  "settlement_payment_match_receipt"
] as const);

export type SettlementPaymentMatchWriteBoundary =
  (typeof settlementPaymentMatchWriteBoundaryValues)[number];

export type SettlementPaymentMatchFailureInjector = (
  boundary: SettlementPaymentMatchWriteBoundary
) => void | Promise<void>;

export type SettlementPaymentMatchPersistenceReason =
  | "invalid_command"
  | "invalid_correlation_rule_configuration"
  | "correlation_rule_not_supported"
  | "provider_binding_not_found"
  | "batch_ingestion_not_found"
  | "batch_ingestion_conflict"
  | "settlement_entry_not_found"
  | "settlement_entry_batch_conflict"
  | "economic_payment_not_found"
  | "economic_payment_correlation_conflict"
  | "capture_not_found"
  | "capture_correlation_conflict"
  | "clearing_not_found"
  | "clearing_state_conflict"
  | "clearing_version_conflict"
  | "settlement_match_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_integrity_conflict"
  | "persistence_write_incomplete";

export class SettlementPaymentMatchPersistenceError extends Error {
  readonly code = "settlement_payment_match_persistence_error";

  constructor(readonly reason: SettlementPaymentMatchPersistenceReason) {
    super("Settlement payment match could not be committed atomically");
    this.name = "SettlementPaymentMatchPersistenceError";
  }
}

export function createDrizzleSettlementPaymentMatchUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly correlationRules: readonly SettlementPaymentCorrelationRuleDefinition[];
  readonly afterWriteBoundary?: SettlementPaymentMatchFailureInjector;
}): SettlementPaymentMatchUnitOfWork {
  const correlationRules = normalizeCorrelationRules(input.correlationRules);
  const unitOfWork = {
    async matchSettlementPayment(command) {
      const normalized = normalizeCommand(command, correlationRules);
      try {
        return await input.database.transaction((transaction) =>
          matchInTransaction(
            transaction,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof SettlementPaymentMatchPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("settlement_match_conflict");
        if (code === "23503" || code === "23514" || code === "55000") {
          fail("persistence_integrity_conflict");
        }
        throw error;
      }
    }
  } satisfies SettlementPaymentMatchUnitOfWork;
  return Object.freeze(unitOfWork);
}

type NormalizedCorrelationRule = Readonly<{
  rule: Readonly<{
    kind: "settlement_payment_correlation_rule";
    ruleId: string;
    ruleVersion: number;
    ruleDigest: FinanceDigest;
    providerAccount: FinanceProviderAccountIdentity;
  }>;
  referenceType: string;
  direction: string;
  entryType: string;
  settlementStatus: string | null;
  amountRelation: "same_minor" | "negated_minor";
}>;

type NormalizedCommand = Readonly<{
  providerEntryKey: ReturnType<typeof createProviderSettlementEntryKey>;
  economicPaymentIntentId: string;
  expectedClearingVersion: number;
  batchIngestion: Readonly<{
    receiptId: string;
    version: 1;
    canonicalDigest: FinanceDigest;
  }>;
  correlationRule: NormalizedCorrelationRule;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

async function matchInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  afterWriteBoundary: SettlementPaymentMatchFailureInjector
): Promise<SettlementPaymentMatchCommitReceipt> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(
      hashtextextended(${serializeProviderSettlementEntryKey(command.providerEntryKey)}, 0)
    )`
  );
  await lockExactProviderBinding(transaction, command.providerEntryKey.providerAccount);

  const existing = await findExistingReceipt(transaction, command.providerEntryKey);
  if (existing) return replayExistingReceipt(command, existing);

  const batch = await lockBatchReceipt(transaction, command);
  const entry = await lockSettlementEntry(transaction, command, batch.settlementPageId);
  const intent = await lockEconomicIntent(transaction, command);
  const capture = await lockCaptureFact(transaction, command);
  const clearing = await lockClearingHead(transaction, command);
  assertEconomicCorrelation(command, intent, capture, clearing);

  const matchResult = correlationResult(command.correlationRule, entry, capture);
  let settlementExceptionId: string | null = null;
  if (matchResult === "quarantined_no_effect") {
    const [exception] = await transaction
      .insert(financeSettlementExceptions)
      .values({
        providerAccountSeriesId: command.providerEntryKey.providerAccount.seriesId,
        providerAccountId: command.providerEntryKey.providerAccount.providerAccountId,
        providerIdentityVersion: command.providerEntryKey.providerAccount.identityVersion,
        stream: "settlement_ledger",
        settlementPageId: batch.settlementPageId,
        providerEntryId: command.providerEntryKey.providerEntryId,
        merchantPayoutId: null,
        exceptionCode: "settlement_payment_correlation_mismatch",
        evidenceDigest: entry.rawPayloadDigest
      })
      .returning({ id: financeSettlementExceptions.id });
    if (!exception) fail("persistence_write_incomplete");
    settlementExceptionId = exception.id;
    await afterWriteBoundary("settlement_exception");
  }

  const [receipt] = await transaction
    .insert(financeSettlementPaymentMatchCommitReceipts)
    .values({
      batchIngestionReceiptId: command.batchIngestion.receiptId,
      batchIngestionReceiptVersion: command.batchIngestion.version,
      batchIngestionReceiptDigest: command.batchIngestion.canonicalDigest,
      settlementPageId: batch.settlementPageId,
      settlementEntryId: entry.id,
      providerAccountSeriesId: command.providerEntryKey.providerAccount.seriesId,
      providerAccountId: command.providerEntryKey.providerAccount.providerAccountId,
      providerIdentityVersion: command.providerEntryKey.providerAccount.identityVersion,
      providerEntryId: command.providerEntryKey.providerEntryId,
      economicPaymentIntentId: command.economicPaymentIntentId,
      captureFactId: capture.id,
      providerPaymentId: capture.providerPaymentId,
      amountMinor: encodeFinanceNumeric38(capture.amountMinor),
      currency: "RUB",
      matchResult,
      correlationRuleId: command.correlationRule.rule.ruleId,
      correlationRuleVersion: command.correlationRule.rule.ruleVersion,
      correlationRuleDigest: command.correlationRule.rule.ruleDigest,
      ruleReferenceType: command.correlationRule.referenceType,
      ruleDirection: command.correlationRule.direction,
      ruleEntryType: command.correlationRule.entryType,
      ruleSettlementStatus: command.correlationRule.settlementStatus,
      ruleAmountRelation: command.correlationRule.amountRelation,
      clearingVersion: String(command.expectedClearingVersion),
      settlementExceptionId,
      operationPolicyId: command.operationEnvelope.policyId,
      operationPolicyVersion: command.operationEnvelope.policyVersion,
      operationPolicyDigest: command.operationEnvelope.policyDigest,
      maximumRows: command.operationEnvelope.maximumRows,
      maximumDecimalDigits: command.operationEnvelope.maximumDecimalDigits,
      maximumArtifactBytes: String(command.operationEnvelope.maximumArtifactBytes)
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("settlement_payment_match_receipt");
  return mapReceipt(receipt);
}

async function lockExactProviderBinding<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  providerAccount: FinanceProviderAccountIdentity
): Promise<void> {
  const [row] = await transaction
    .select({ provider: financeProviderAccounts.provider })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, providerAccount.seriesId),
        eq(financeProviderAccounts.providerAccountId, providerAccount.providerAccountId),
        eq(financeProviderAccounts.identityVersion, providerAccount.identityVersion)
      )
    )
    .limit(1)
    .for("share");
  if (!row || row.provider !== "arc_pay") fail("provider_binding_not_found");
}

async function findExistingReceipt<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  providerEntryKey: NormalizedCommand["providerEntryKey"]
) {
  const [row] = await transaction
    .select()
    .from(financeSettlementPaymentMatchCommitReceipts)
    .where(
      and(
        eq(
          financeSettlementPaymentMatchCommitReceipts.providerAccountSeriesId,
          providerEntryKey.providerAccount.seriesId
        ),
        eq(
          financeSettlementPaymentMatchCommitReceipts.providerAccountId,
          providerEntryKey.providerAccount.providerAccountId
        ),
        eq(
          financeSettlementPaymentMatchCommitReceipts.providerIdentityVersion,
          providerEntryKey.providerAccount.identityVersion
        ),
        eq(
          financeSettlementPaymentMatchCommitReceipts.providerEntryId,
          providerEntryKey.providerEntryId
        )
      )
    )
    .limit(1)
    .for("share");
  return row;
}

function replayExistingReceipt(
  command: NormalizedCommand,
  row: typeof financeSettlementPaymentMatchCommitReceipts.$inferSelect
): SettlementPaymentMatchCommitReceipt {
  const rule = command.correlationRule;
  const envelope = command.operationEnvelope;
  if (
    row.batchIngestionReceiptId !== command.batchIngestion.receiptId ||
    row.batchIngestionReceiptVersion !== command.batchIngestion.version ||
    row.batchIngestionReceiptDigest !== command.batchIngestion.canonicalDigest ||
    row.economicPaymentIntentId !== command.economicPaymentIntentId ||
    safePositiveVersion(row.clearingVersion) !== command.expectedClearingVersion ||
    row.correlationRuleId !== rule.rule.ruleId ||
    row.correlationRuleVersion !== rule.rule.ruleVersion ||
    row.correlationRuleDigest !== rule.rule.ruleDigest ||
    row.ruleReferenceType !== rule.referenceType ||
    row.ruleDirection !== rule.direction ||
    row.ruleEntryType !== rule.entryType ||
    row.ruleSettlementStatus !== rule.settlementStatus ||
    row.ruleAmountRelation !== rule.amountRelation ||
    row.operationPolicyId !== envelope.policyId ||
    row.operationPolicyVersion !== envelope.policyVersion ||
    row.operationPolicyDigest !== envelope.policyDigest ||
    row.maximumRows !== envelope.maximumRows ||
    row.maximumDecimalDigits !== envelope.maximumDecimalDigits ||
    encodeFinanceNumeric38(row.maximumArtifactBytes) !== String(envelope.maximumArtifactBytes)
  ) {
    fail("settlement_match_conflict");
  }
  return mapReceipt(row);
}

async function lockBatchReceipt<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [row] = await transaction
    .select({
      settlementPageId: financeSettlementBatchIngestionCommitReceipts.settlementPageId,
      providerAccountSeriesId:
        financeSettlementBatchIngestionCommitReceipts.providerAccountSeriesId,
      providerAccountId: financeSettlementBatchIngestionCommitReceipts.providerAccountId,
      providerIdentityVersion:
        financeSettlementBatchIngestionCommitReceipts.providerIdentityVersion,
      stream: financeSettlementBatchIngestionCommitReceipts.stream
    })
    .from(financeSettlementBatchIngestionCommitReceipts)
    .where(
      and(
        eq(
          financeSettlementBatchIngestionCommitReceipts.receiptId,
          command.batchIngestion.receiptId
        ),
        eq(
          financeSettlementBatchIngestionCommitReceipts.receiptVersion,
          command.batchIngestion.version
        ),
        eq(
          financeSettlementBatchIngestionCommitReceipts.canonicalDigest,
          command.batchIngestion.canonicalDigest
        )
      )
    )
    .limit(1)
    .for("share");
  if (!row) fail("batch_ingestion_not_found");
  const provider = command.providerEntryKey.providerAccount;
  if (
    row.stream !== "settlement_ledger" ||
    row.providerAccountSeriesId !== provider.seriesId ||
    row.providerAccountId !== provider.providerAccountId ||
    row.providerIdentityVersion !== provider.identityVersion
  ) {
    fail("batch_ingestion_conflict");
  }
  return row;
}

async function lockSettlementEntry<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  settlementPageId: string
) {
  const provider = command.providerEntryKey.providerAccount;
  const [entry] = await transaction
    .select({
      id: financeSettlementLedgerEntries.id,
      amountMinor: financeSettlementLedgerEntries.amountMinor,
      currency: financeSettlementLedgerEntries.currency,
      direction: financeSettlementLedgerEntries.direction,
      entryType: financeSettlementLedgerEntries.entryType,
      referenceType: financeSettlementLedgerEntries.referenceType,
      referenceId: financeSettlementLedgerEntries.referenceId,
      settlementStatus: financeSettlementLedgerEntries.settlementStatus,
      rawPayloadDigest: financeSettlementLedgerEntries.rawPayloadDigest
    })
    .from(financeSettlementLedgerEntries)
    .where(
      and(
        eq(financeSettlementLedgerEntries.providerAccountSeriesId, provider.seriesId),
        eq(financeSettlementLedgerEntries.providerAccountId, provider.providerAccountId),
        eq(financeSettlementLedgerEntries.providerIdentityVersion, provider.identityVersion),
        eq(financeSettlementLedgerEntries.providerEntryId, command.providerEntryKey.providerEntryId)
      )
    )
    .limit(1)
    .for("share");
  if (!entry) fail("settlement_entry_not_found");
  const [pageEntry] = await transaction
    .select({ settlementEntryId: financeSettlementLedgerPageEntries.settlementEntryId })
    .from(financeSettlementLedgerPageEntries)
    .where(
      and(
        eq(financeSettlementLedgerPageEntries.settlementPageId, settlementPageId),
        eq(financeSettlementLedgerPageEntries.settlementEntryId, entry.id),
        eq(financeSettlementLedgerPageEntries.stream, "settlement_ledger")
      )
    )
    .limit(1)
    .for("share");
  if (!pageEntry) fail("settlement_entry_batch_conflict");
  return entry;
}

async function lockEconomicIntent<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [row] = await transaction
    .select({
      id: financeEconomicPaymentIntents.id,
      seriesId: financeEconomicPaymentIntents.seriesId,
      providerAccountId: financeEconomicPaymentIntents.providerAccountId,
      providerIdentityVersion: financeEconomicPaymentIntents.providerIdentityVersion,
      amountMinor: financeEconomicPaymentIntents.amountMinor,
      currency: financeEconomicPaymentIntents.currency,
      state: financeEconomicPaymentIntents.state
    })
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, command.economicPaymentIntentId))
    .limit(1)
    .for("share");
  if (!row) fail("economic_payment_not_found");
  return row;
}

async function lockCaptureFact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [row] = await transaction
    .select({
      id: financeCaptureFacts.id,
      economicPaymentIntentId: financeCaptureFacts.economicPaymentIntentId,
      seriesId: financeCaptureFacts.seriesId,
      providerAccountId: financeCaptureFacts.providerAccountId,
      providerIdentityVersion: financeCaptureFacts.providerIdentityVersion,
      providerPaymentId: financeCaptureFacts.providerPaymentId,
      amountMinor: financeCaptureFacts.amountMinor,
      currency: financeCaptureFacts.currency
    })
    .from(financeCaptureFacts)
    .where(eq(financeCaptureFacts.economicPaymentIntentId, command.economicPaymentIntentId))
    .limit(1)
    .for("share");
  if (!row) fail("capture_not_found");
  return row;
}

async function lockClearingHead<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [row] = await transaction
    .select()
    .from(financePaymentClearingHeads)
    .where(eq(financePaymentClearingHeads.economicPaymentIntentId, command.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!row) fail("clearing_not_found");
  return row;
}

function assertEconomicCorrelation(
  command: NormalizedCommand,
  intent: Awaited<ReturnType<typeof lockEconomicIntent>>,
  capture: Awaited<ReturnType<typeof lockCaptureFact>>,
  clearing: Awaited<ReturnType<typeof lockClearingHead>>
): void {
  const provider = command.providerEntryKey.providerAccount;
  const amountMinor = encodeFinanceNumeric38(intent.amountMinor);
  if (
    intent.seriesId !== provider.seriesId ||
    intent.providerAccountId !== provider.providerAccountId ||
    intent.providerIdentityVersion !== provider.identityVersion ||
    intent.state !== "captured" ||
    intent.currency !== "RUB" ||
    BigInt(amountMinor) <= 0n
  ) {
    fail("economic_payment_correlation_conflict");
  }
  if (
    capture.economicPaymentIntentId !== command.economicPaymentIntentId ||
    capture.seriesId !== provider.seriesId ||
    capture.providerAccountId !== provider.providerAccountId ||
    capture.providerIdentityVersion !== provider.identityVersion ||
    encodeFinanceNumeric38(capture.amountMinor) !== amountMinor ||
    capture.currency !== "RUB"
  ) {
    fail("capture_correlation_conflict");
  }
  if (
    clearing.seriesId !== provider.seriesId ||
    clearing.providerAccountId !== provider.providerAccountId ||
    clearing.providerIdentityVersion !== provider.identityVersion ||
    clearing.currency !== "RUB"
  ) {
    fail("economic_payment_correlation_conflict");
  }
  if (clearing.state !== "settlement_seen") fail("clearing_state_conflict");
  if (safePositiveVersion(clearing.version) !== command.expectedClearingVersion) {
    fail("clearing_version_conflict");
  }
}

function correlationResult(
  rule: NormalizedCorrelationRule,
  entry: Awaited<ReturnType<typeof lockSettlementEntry>>,
  capture: Awaited<ReturnType<typeof lockCaptureFact>>
): "matched" | "quarantined_no_effect" {
  const settlementAmount = exactInteger(entry.amountMinor);
  const captureAmount = exactInteger(capture.amountMinor);
  const amountMatches =
    rule.amountRelation === "same_minor"
      ? settlementAmount === captureAmount
      : settlementAmount === -captureAmount;
  return entry.referenceType === rule.referenceType &&
    entry.direction === rule.direction &&
    entry.entryType === rule.entryType &&
    entry.settlementStatus === rule.settlementStatus &&
    entry.referenceId === capture.providerPaymentId &&
    entry.currency === capture.currency &&
    amountMatches
    ? "matched"
    : "quarantined_no_effect";
}

function mapReceipt(
  row: typeof financeSettlementPaymentMatchCommitReceipts.$inferSelect
): SettlementPaymentMatchCommitReceipt {
  const providerEntryKey = createProviderSettlementEntryKey({
    providerAccount: {
      seriesId: row.providerAccountSeriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.providerIdentityVersion
    },
    providerEntryId: row.providerEntryId
  });
  const receipt = Object.freeze({
    ref: Object.freeze({
      kind: "settlement_payment_match_commit_receipt" as const,
      receiptId: identifier(row.receiptId),
      version: receiptVersion(row.receiptVersion),
      canonicalDigest: digest(row.canonicalDigest)
    }),
    providerEntryKey,
    economicPaymentIntentId: identifier(row.economicPaymentIntentId),
    matchResult: matchResult(row.matchResult),
    correlationRuleId: identifier(row.correlationRuleId),
    clearingVersion: safePositiveVersion(row.clearingVersion),
    persistenceTransactionBoundaryRef: transactionBoundary(row.persistenceTransactionBoundaryRef),
    committedAt: validDate(row.committedAt).toISOString()
  });
  return receipt as SettlementPaymentMatchCommitReceipt;
}

function normalizeCorrelationRules(
  input: readonly SettlementPaymentCorrelationRuleDefinition[]
): ReadonlyMap<string, NormalizedCorrelationRule> {
  if (!Array.isArray(input) || input.length > 100) {
    fail("invalid_correlation_rule_configuration");
  }
  const rules = new Map<string, NormalizedCorrelationRule>();
  for (const candidate of input) {
    try {
      assertExactOwnDataKeys(candidate, [
        "rule",
        "referenceType",
        "direction",
        "entryType",
        "settlementStatus",
        "amountRelation"
      ]);
      const rule = normalizeRule(candidate.rule);
      const normalized = Object.freeze({
        rule,
        referenceType: opaqueValue(candidate.referenceType),
        direction: opaqueValue(candidate.direction),
        entryType: opaqueValue(candidate.entryType),
        settlementStatus:
          candidate.settlementStatus === null ? null : opaqueValue(candidate.settlementStatus),
        amountRelation: amountRelation(candidate.amountRelation)
      });
      const expectedDigest = digestFinanceCanonicalValueV1({
        kind: rule.kind,
        ruleId: rule.ruleId,
        ruleVersion: rule.ruleVersion,
        providerAccount: rule.providerAccount,
        semantics: {
          referenceType: normalized.referenceType,
          direction: normalized.direction,
          entryType: normalized.entryType,
          settlementStatus: normalized.settlementStatus,
          amountRelation: normalized.amountRelation
        }
      });
      if (rule.ruleDigest !== expectedDigest) fail("invalid_correlation_rule_configuration");
      const key = correlationRuleKey(rule);
      if (rules.has(key)) fail("invalid_correlation_rule_configuration");
      rules.set(key, normalized);
    } catch {
      fail("invalid_correlation_rule_configuration");
    }
  }
  return rules;
}

function normalizeCommand(
  input: MatchSettlementPaymentCommand,
  rules: ReadonlyMap<string, NormalizedCorrelationRule>
): NormalizedCommand {
  try {
    assertExactOwnDataKeys(input, [
      "providerEntryKey",
      "economicPaymentIntentId",
      "expectedClearingVersion",
      "batchIngestion",
      "correlationRule",
      "operationEnvelope"
    ]);
    const providerEntryKey = createProviderSettlementEntryKey(input.providerEntryKey);
    const economicPaymentIntentId = identifier(input.economicPaymentIntentId);
    const expectedClearingVersion = positiveSafeInteger(input.expectedClearingVersion);
    const batchIngestion = normalizeBatchReceipt(input.batchIngestion);
    const requestedRule = normalizeRule(input.correlationRule);
    const correlationRule = rules.get(correlationRuleKey(requestedRule));
    if (!correlationRule || requestedRule.ruleDigest !== correlationRule.rule.ruleDigest) {
      fail("correlation_rule_not_supported");
    }
    if (!sameProvider(correlationRule.rule.providerAccount, providerEntryKey.providerAccount)) {
      fail("correlation_rule_not_supported");
    }
    const operationEnvelope = normalizeOperationEnvelope(input.operationEnvelope);
    return Object.freeze({
      providerEntryKey,
      economicPaymentIntentId,
      expectedClearingVersion,
      batchIngestion,
      correlationRule,
      operationEnvelope
    });
  } catch (error) {
    if (error instanceof SettlementPaymentMatchPersistenceError) throw error;
    fail("invalid_command");
  }
}

function normalizeBatchReceipt(value: unknown): NormalizedCommand["batchIngestion"] {
  assertExactOwnDataKeys(value, ["kind", "receiptId", "version", "canonicalDigest"]);
  const receipt = value as {
    kind: unknown;
    receiptId: unknown;
    version: unknown;
    canonicalDigest: unknown;
  };
  if (receipt.kind !== "settlement_batch_ingestion_commit_receipt") fail("invalid_command");
  if (receipt.version !== 1) fail("invalid_command");
  return Object.freeze({
    receiptId: identifier(receipt.receiptId),
    version: 1 as const,
    canonicalDigest: digest(receipt.canonicalDigest)
  });
}

function normalizeRule(value: unknown): NormalizedCorrelationRule["rule"] {
  assertExactOwnDataKeys(value, ["kind", "ruleId", "ruleVersion", "ruleDigest", "providerAccount"]);
  const rule = value as {
    kind: unknown;
    ruleId: unknown;
    ruleVersion: unknown;
    ruleDigest: unknown;
    providerAccount: unknown;
  };
  if (rule.kind !== "settlement_payment_correlation_rule") fail("invalid_command");
  return Object.freeze({
    kind: rule.kind,
    ruleId: identifier(rule.ruleId),
    ruleVersion: positiveSafeInteger(rule.ruleVersion),
    ruleDigest: digest(rule.ruleDigest),
    providerAccount: createProviderAccountIdentityBinding(rule.providerAccount)
  });
}

function normalizeOperationEnvelope(value: unknown): ResolvedFinanceOperationEnvelope {
  assertExactOwnDataKeys(value, [
    "kind",
    "policyId",
    "policyVersion",
    "policyDigest",
    "maximumRows",
    "maximumDecimalDigits",
    "maximumArtifactBytes"
  ]);
  const envelope = value as ResolvedFinanceOperationEnvelope;
  if (envelope.kind !== "resolved_finance_operation_envelope") fail("invalid_command");
  identifier(envelope.policyId);
  positiveSafeInteger(envelope.policyVersion);
  digest(envelope.policyDigest);
  const maximumRows = positiveSafeInteger(envelope.maximumRows);
  const maximumDecimalDigits = positiveSafeInteger(envelope.maximumDecimalDigits);
  positiveSafeInteger(envelope.maximumArtifactBytes);
  if (maximumRows > 10_000 || maximumDecimalDigits > 1_000) fail("invalid_command");
  return envelope;
}

function correlationRuleKey(rule: NormalizedCorrelationRule["rule"]): string {
  return digestFinanceCanonicalValueV1([
    rule.providerAccount.seriesId,
    rule.providerAccount.providerAccountId,
    rule.providerAccount.identityVersion,
    rule.ruleId,
    rule.ruleVersion
  ]);
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

function exactInteger(value: string | number): bigint {
  const encoded = typeof value === "number" ? String(value) : value;
  if (!/^-?(0|[1-9][0-9]*)$/.test(encoded)) fail("persistence_write_incomplete");
  try {
    return BigInt(encoded);
  } catch {
    fail("persistence_write_incomplete");
  }
}

function amountRelation(value: unknown): "same_minor" | "negated_minor" {
  if (value !== "same_minor" && value !== "negated_minor") {
    fail("invalid_correlation_rule_configuration");
  }
  return value;
}

function matchResult(value: string): "matched" | "quarantined_no_effect" {
  if (value !== "matched" && value !== "quarantined_no_effect") {
    fail("persistence_write_incomplete");
  }
  return value;
}

function receiptVersion(value: number): 1 {
  if (value !== 1) fail("persistence_write_incomplete");
  return 1;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value.trim() !== value ||
    hasControlCharacters(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function opaqueValue(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 500 ||
    value.trim() !== value ||
    hasControlCharacters(value)
  ) {
    fail("invalid_correlation_rule_configuration");
  }
  return value;
}

function positiveSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail("invalid_command");
  }
  return value;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true;
  }
  return false;
}

function safePositiveVersion(value: unknown): number {
  const parsed = Number(decodeFinancePositiveRevision(value));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail("persistence_write_incomplete");
  return parsed;
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("invalid_command");
  }
  return value as FinanceDigest;
}

function transactionBoundary(value: string): string {
  if (!/^postgres-xid:[0-9]+$/.test(value)) fail("persistence_write_incomplete");
  return value;
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("persistence_write_incomplete");
  }
  return value;
}

function assertExactOwnDataKeys(value: unknown, expected: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_command");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const wanted = [...expected].sort();
  if (
    keys.length !== wanted.length ||
    keys.some((key, index) => key !== wanted[index]) ||
    Object.values(descriptors).some(
      (descriptor) => descriptor.get !== undefined || descriptor.set !== undefined
    )
  ) {
    fail("invalid_command");
  }
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}

function noFailureInjection(): void {}

function fail(reason: SettlementPaymentMatchPersistenceReason): never {
  throw new SettlementPaymentMatchPersistenceError(reason);
}
