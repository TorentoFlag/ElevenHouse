import { randomUUID } from "node:crypto";

import {
  createProviderSettlementEntryKey,
  type FinanceProviderAccountIdentity,
  type ProviderSettlementEntryKey,
  type SettlementBatchIngestionCommitReceiptRef
} from "@elevenhouse/domain/finance-core";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

type CandidateRow = Readonly<{
  seriesId: string;
  providerAccountId: string;
  providerIdentityVersion: number;
  providerEntryId: string;
  receiptId: string;
  receiptVersion: number;
  receiptDigest: string;
  referenceType: string;
  direction: string;
  entryType: string;
  settlementStatus: string | null;
  economicPaymentIntentId: string | null;
  clearingState: "unmatched" | "settlement_seen" | "provider_matched" | "bank_matched" | null;
  clearingVersion: string | null;
}>;

type ExactEntryCommand = Readonly<{
  providerEntryKey: ProviderSettlementEntryKey;
  batchIngestion: SettlementBatchIngestionCommitReceiptRef;
}>;

export type SettlementPaymentReconciliationCandidateRow = Readonly<{
  providerEntryKey: ProviderSettlementEntryKey;
  batchIngestion: SettlementBatchIngestionCommitReceiptRef;
  referenceType: string;
  direction: string;
  entryType: string;
  settlementStatus: string | null;
  capture: Readonly<{ economicPaymentIntentId: string }> | null;
  clearing: Readonly<{
    state: "unmatched" | "settlement_seen" | "provider_matched";
    version: number;
  }> | null;
}>;

export type SettlementPaymentReconciliationAdapters = Readonly<{
  candidates: Readonly<{
    listOpenPaymentCandidates(input: Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      maximumRows: number;
    }>): Promise<readonly SettlementPaymentReconciliationCandidateRow[]>;
  }>;
  settlementSeen: Readonly<{
    advance(input: ExactEntryCommand & Readonly<{
      economicPaymentIntentId: string;
      expectedClearingVersion: number;
    }>): Promise<void>;
  }>;
  providerMatched: Readonly<{
    advance(input: Readonly<{
      economicPaymentIntentId: string;
      expectedClearingVersion: number;
      matchReceiptId: string;
    }>): Promise<void>;
  }>;
  quarantine: Readonly<{
    quarantineMissingCapture(input: ExactEntryCommand): Promise<void>;
  }>;
}>;

export class SettlementPaymentReconciliationPersistenceError extends Error {
  readonly code = "settlement_payment_reconciliation_persistence_error" as const;

  constructor(
    readonly reason:
      | "invalid_command"
      | "settlement_entry_not_found"
      | "capture_not_found"
      | "clearing_conflict"
      | "match_receipt_not_found"
      | "persistence_integrity_conflict"
      | "retryable_concurrency_conflict"
  ) {
    super("Settlement payment reconciliation persistence failed");
  }
}

/**
 * Narrow database capabilities used by the worker's provider-side settlement matcher. Every
 * transition is evidence-bound and does not write journal, wallet or bank-cash money state.
 */
export function createDrizzleSettlementPaymentReconciliationAdapters<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): SettlementPaymentReconciliationAdapters {
  return Object.freeze({
    candidates: {
      async listOpenPaymentCandidates(command: Readonly<{
        providerAccount: FinanceProviderAccountIdentity;
        maximumRows: number;
      }>) {
        validateProvider(command.providerAccount);
        if (!Number.isSafeInteger(command.maximumRows) || command.maximumRows < 1) fail("invalid_command");
        const result = await input.database.execute<CandidateRow>(sql`
          select distinct on (entry.provider_entry_id)
            entry.provider_account_series_id as "seriesId",
            entry.provider_account_id as "providerAccountId",
            entry.provider_identity_version as "providerIdentityVersion",
            entry.provider_entry_id as "providerEntryId",
            batch.receipt_id as "receiptId",
            batch.receipt_version as "receiptVersion",
            batch.canonical_digest as "receiptDigest",
            entry.reference_type as "referenceType",
            entry.direction as "direction",
            entry.entry_type as "entryType",
            entry.settlement_status as "settlementStatus",
            capture.economic_payment_intent_id as "economicPaymentIntentId",
            clearing.state as "clearingState",
            clearing.version as "clearingVersion"
          from finance_settlement_batch_ingestion_commit_receipts batch
          join finance_settlement_ledger_page_entries page_entry
            on page_entry.settlement_page_id = batch.settlement_page_id
           and page_entry.stream = 'settlement_ledger'
          join finance_settlement_ledger_entries entry
            on entry.id = page_entry.settlement_entry_id
          left join finance_capture_facts capture
            on capture.series_id = entry.provider_account_series_id
           and capture.provider_account_id = entry.provider_account_id
           and capture.provider_identity_version = entry.provider_identity_version
           and capture.provider_payment_id = entry.reference_id
          left join finance_payment_clearing_heads clearing
            on clearing.economic_payment_intent_id = capture.economic_payment_intent_id
          where batch.stream = 'settlement_ledger'
            and batch.provider_account_series_id = ${command.providerAccount.seriesId}
            and batch.provider_account_id = ${command.providerAccount.providerAccountId}
            and batch.provider_identity_version = ${command.providerAccount.identityVersion}
            and entry.reference_type = 'payment'
            and entry.direction = 'credit'
            and entry.entry_type = 'payment_credit'
            and entry.settlement_status in ('available', 'pending')
            and (clearing.state is null or clearing.state <> 'bank_matched')
          order by entry.provider_entry_id, batch.database_committed_at desc, batch.receipt_id desc
          limit ${command.maximumRows}
        `);
        return result.rows.map(mapCandidate);
      }
    },
    settlementSeen: {
      async advance(command: ExactEntryCommand & Readonly<{
        economicPaymentIntentId: string;
        expectedClearingVersion: number;
      }>) {
        validateExactEntry(command);
        identifier(command.economicPaymentIntentId);
        positiveVersion(command.expectedClearingVersion);
        await runTransaction(input.database, async (transaction) => {
          await assertExactBatchEntry(transaction, command);
          await assertExactCapture(transaction, command);
          const head = await lockClearing(transaction, command.economicPaymentIntentId);
          if (head.state === "settlement_seen" && head.version === command.expectedClearingVersion + 1) {
            await assertHistory(transaction, command.economicPaymentIntentId, command.expectedClearingVersion, "settlement_batch_ingestion_commit_receipt", command.batchIngestion.receiptId);
            return;
          }
          if (head.state !== "unmatched" || head.version !== command.expectedClearingVersion) {
            fail("clearing_conflict");
          }
          await updateClearingHead(transaction, command.economicPaymentIntentId, "settlement_seen", head.version + 1);
          await insertClearingHistory(transaction, {
            economicPaymentIntentId: command.economicPaymentIntentId,
            fromState: "unmatched",
            toState: "settlement_seen",
            versionFrom: head.version,
            evidenceAuthorityKind: "settlement_batch_ingestion_commit_receipt",
            evidenceAuthorityId: command.batchIngestion.receiptId,
            evidenceDigest: command.batchIngestion.canonicalDigest
          });
        });
      }
    },
    providerMatched: {
      async advance(command: Readonly<{
        economicPaymentIntentId: string;
        expectedClearingVersion: number;
        matchReceiptId: string;
      }>) {
        identifier(command.economicPaymentIntentId);
        positiveVersion(command.expectedClearingVersion);
        identifier(command.matchReceiptId);
        await runTransaction(input.database, async (transaction) => {
          const receipt = await lockMatchedReceipt(transaction, command);
          const head = await lockClearing(transaction, command.economicPaymentIntentId);
          if (head.state === "provider_matched" && head.version === command.expectedClearingVersion + 1) {
            await assertHistory(transaction, command.economicPaymentIntentId, command.expectedClearingVersion, "settlement_payment_match_commit_receipt", command.matchReceiptId);
            return;
          }
          if (head.state !== "settlement_seen" || head.version !== command.expectedClearingVersion) {
            fail("clearing_conflict");
          }
          await updateClearingHead(transaction, command.economicPaymentIntentId, "provider_matched", head.version + 1);
          await insertClearingHistory(transaction, {
            economicPaymentIntentId: command.economicPaymentIntentId,
            fromState: "settlement_seen",
            toState: "provider_matched",
            versionFrom: head.version,
            evidenceAuthorityKind: "settlement_payment_match_commit_receipt",
            evidenceAuthorityId: command.matchReceiptId,
            evidenceDigest: receipt.canonicalDigest
          });
        });
      }
    },
    quarantine: {
      async quarantineMissingCapture(command: ExactEntryCommand) {
        validateExactEntry(command);
        await runTransaction(input.database, async (transaction) => {
          const entry = await assertExactBatchEntry(transaction, command);
          const capture = await transaction.execute<{ found: boolean }>(sql`
            select exists (
              select 1 from finance_capture_facts capture
              where capture.series_id = ${command.providerEntryKey.providerAccount.seriesId}
                and capture.provider_account_id = ${command.providerEntryKey.providerAccount.providerAccountId}
                and capture.provider_identity_version = ${command.providerEntryKey.providerAccount.identityVersion}
                and capture.provider_payment_id = ${entry.referenceId}
            ) as found
          `);
          if (capture.rows[0]?.found) fail("capture_not_found");
          await transaction.execute(sql`
            insert into finance_settlement_exceptions (
              provider_account_series_id, provider_account_id, provider_identity_version,
              stream, settlement_page_id, provider_entry_id, merchant_payout_id,
              exception_code, evidence_digest
            ) values (
              ${command.providerEntryKey.providerAccount.seriesId},
              ${command.providerEntryKey.providerAccount.providerAccountId},
              ${command.providerEntryKey.providerAccount.identityVersion},
              'settlement_ledger', ${entry.settlementPageId}, ${command.providerEntryKey.providerEntryId}, null,
              'settlement_payment_capture_missing', ${entry.rawPayloadDigest}
            ) on conflict do nothing
          `);
        });
      }
    }
  });
}

async function assertExactBatchEntry<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ExactEntryCommand
) {
  const result = await transaction.execute<Readonly<{
    settlementPageId: string;
    rawPayloadDigest: string;
    referenceId: string;
  }>>(sql`
    select batch.settlement_page_id as "settlementPageId",
      entry.raw_payload_digest as "rawPayloadDigest", entry.reference_id as "referenceId"
    from finance_settlement_batch_ingestion_commit_receipts batch
    join finance_settlement_ledger_page_entries page_entry
      on page_entry.settlement_page_id = batch.settlement_page_id
     and page_entry.stream = 'settlement_ledger'
    join finance_settlement_ledger_entries entry on entry.id = page_entry.settlement_entry_id
    where batch.receipt_id = ${command.batchIngestion.receiptId}
      and batch.receipt_version = ${command.batchIngestion.version}
      and batch.canonical_digest = ${command.batchIngestion.canonicalDigest}
      and batch.stream = 'settlement_ledger'
      and batch.provider_account_series_id = ${command.providerEntryKey.providerAccount.seriesId}
      and batch.provider_account_id = ${command.providerEntryKey.providerAccount.providerAccountId}
      and batch.provider_identity_version = ${command.providerEntryKey.providerAccount.identityVersion}
      and entry.provider_account_series_id = ${command.providerEntryKey.providerAccount.seriesId}
      and entry.provider_account_id = ${command.providerEntryKey.providerAccount.providerAccountId}
      and entry.provider_identity_version = ${command.providerEntryKey.providerAccount.identityVersion}
      and entry.provider_entry_id = ${command.providerEntryKey.providerEntryId}
    for share of batch, page_entry, entry
  `);
  const row = result.rows[0];
  if (!row || result.rows.length !== 1) fail("settlement_entry_not_found");
  return row;
}

async function assertExactCapture<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ExactEntryCommand & Readonly<{ economicPaymentIntentId: string }>
) {
  const result = await transaction.execute(sql`
    select 1 from finance_capture_facts capture
    join finance_settlement_ledger_entries entry
      on entry.provider_account_series_id = capture.series_id
     and entry.provider_account_id = capture.provider_account_id
     and entry.provider_identity_version = capture.provider_identity_version
     and entry.reference_id = capture.provider_payment_id
    where capture.economic_payment_intent_id = ${command.economicPaymentIntentId}
      and entry.provider_account_series_id = ${command.providerEntryKey.providerAccount.seriesId}
      and entry.provider_account_id = ${command.providerEntryKey.providerAccount.providerAccountId}
      and entry.provider_identity_version = ${command.providerEntryKey.providerAccount.identityVersion}
      and entry.provider_entry_id = ${command.providerEntryKey.providerEntryId}
    for share of capture
  `);
  if (result.rows.length !== 1) fail("capture_not_found");
}

async function lockClearing<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  economicPaymentIntentId: string
) {
  const result = await transaction.execute<Readonly<{ state: string; version: string }>>(sql`
    select state, version from finance_payment_clearing_heads
    where economic_payment_intent_id = ${economicPaymentIntentId}
    for update
  `);
  const row = result.rows[0];
  if (!row || result.rows.length !== 1) fail("clearing_conflict");
  const state = clearingState(row.state);
  return { state, version: positiveVersion(row.version) } as const;
}

async function lockMatchedReceipt<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: Readonly<{ economicPaymentIntentId: string; expectedClearingVersion: number; matchReceiptId: string }>
) {
  const result = await transaction.execute<Readonly<{ canonicalDigest: string }>>(sql`
    select canonical_digest as "canonicalDigest"
    from finance_settlement_payment_match_commit_receipts
    where receipt_id = ${command.matchReceiptId}
      and economic_payment_intent_id = ${command.economicPaymentIntentId}
      and clearing_version = ${String(command.expectedClearingVersion)}
      and match_result = 'matched'
    for share
  `);
  const row = result.rows[0];
  if (!row || result.rows.length !== 1 || !digest(row.canonicalDigest)) fail("match_receipt_not_found");
  return row;
}

async function updateClearingHead<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  economicPaymentIntentId: string,
  state: "settlement_seen" | "provider_matched",
  version: number
) {
  await transaction.execute(sql`
    update finance_payment_clearing_heads
    set state = ${state}, version = ${String(version)}
    where economic_payment_intent_id = ${economicPaymentIntentId}
  `);
}

async function insertClearingHistory<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  input: Readonly<{
    economicPaymentIntentId: string;
    fromState: "unmatched" | "settlement_seen";
    toState: "settlement_seen" | "provider_matched";
    versionFrom: number;
    evidenceAuthorityKind: "settlement_batch_ingestion_commit_receipt" | "settlement_payment_match_commit_receipt";
    evidenceAuthorityId: string;
    evidenceDigest: string;
  }>
) {
  await transaction.execute(sql`
    insert into finance_payment_clearing_history (
      id, economic_payment_intent_id, from_state, to_state, version_from, version_to,
      evidence_authority_kind, evidence_authority_id, evidence_digest, occurred_at
    ) values (
      ${`payment-clearing:${randomUUID()}`}, ${input.economicPaymentIntentId},
      ${input.fromState}, ${input.toState}, ${String(input.versionFrom)}, ${String(input.versionFrom + 1)},
      ${input.evidenceAuthorityKind}, ${input.evidenceAuthorityId}, ${input.evidenceDigest}, clock_timestamp()
    )
  `);
}

async function assertHistory<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  economicPaymentIntentId: string,
  versionFrom: number,
  evidenceAuthorityKind: string,
  evidenceAuthorityId: string
) {
  const result = await transaction.execute(sql`
    select 1 from finance_payment_clearing_history
    where economic_payment_intent_id = ${economicPaymentIntentId}
      and version_from = ${String(versionFrom)}
      and evidence_authority_kind = ${evidenceAuthorityKind}
      and evidence_authority_id = ${evidenceAuthorityId}
    for share
  `);
  if (result.rows.length !== 1) fail("clearing_conflict");
}

async function runTransaction<TSchema extends Record<string, unknown>>(
  database: NodePgDatabase<TSchema>,
  callback: (transaction: FinanceTransaction<TSchema>) => Promise<void>
) {
  try {
    await database.transaction(callback);
  } catch (error) {
    if (error instanceof SettlementPaymentReconciliationPersistenceError) throw error;
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
    if (code === "23503" || code === "23505" || code === "23514" || code === "55000") {
      fail("persistence_integrity_conflict");
    }
    throw error;
  }
}

function mapCandidate(row: CandidateRow) {
  const providerAccount = validateProvider({
    seriesId: row.seriesId,
    providerAccountId: row.providerAccountId,
    identityVersion: row.providerIdentityVersion
  });
  const batchIngestion = {
    kind: "settlement_batch_ingestion_commit_receipt" as const,
    receiptId: identifier(row.receiptId),
    version: receiptVersion(row.receiptVersion),
    canonicalDigest: digestValue(row.receiptDigest)
  } as SettlementBatchIngestionCommitReceiptRef;
  return Object.freeze({
    providerEntryKey: createProviderSettlementEntryKey({
      providerAccount,
      providerEntryId: identifier(row.providerEntryId)
    }),
    batchIngestion,
    referenceType: opaque(row.referenceType),
    direction: opaque(row.direction),
    entryType: opaque(row.entryType),
    settlementStatus: row.settlementStatus === null ? null : opaque(row.settlementStatus),
    capture:
      row.economicPaymentIntentId === null
        ? null
        : Object.freeze({ economicPaymentIntentId: identifier(row.economicPaymentIntentId) }),
    clearing:
      row.clearingState === null || row.clearingVersion === null
        ? null
        : Object.freeze({ state: reconciliationClearingState(row.clearingState), version: positiveVersion(row.clearingVersion) })
  });
}

function validateExactEntry(command: ExactEntryCommand): void {
  createProviderSettlementEntryKey(command.providerEntryKey);
  identifier(command.batchIngestion.receiptId);
  if (command.batchIngestion.version !== 1 || !digest(command.batchIngestion.canonicalDigest)) {
    fail("invalid_command");
  }
}

function validateProvider(value: FinanceProviderAccountIdentity): FinanceProviderAccountIdentity {
  if (
    !value ||
    typeof value !== "object" ||
    !identifier(value.seriesId) ||
    !identifier(value.providerAccountId) ||
    !Number.isSafeInteger(value.identityVersion) ||
    value.identityVersion < 1
  ) fail("invalid_command");
  return Object.freeze({
    seriesId: value.seriesId,
    providerAccountId: value.providerAccountId,
    identityVersion: value.identityVersion
  });
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.trim() !== value) {
    fail("invalid_command");
  }
  return value;
}

function opaque(value: unknown): string {
  return identifier(value);
}

function positiveVersion(value: unknown): number {
  const numeric: unknown = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isSafeInteger(numeric) || numeric < 1) {
    fail("invalid_command");
  }
  return numeric;
}

function receiptVersion(value: unknown): 1 {
  if (value !== 1) fail("invalid_command");
  return 1;
}

function digestValue(value: unknown): `sha256:${string}` {
  if (!digest(value)) fail("invalid_command");
  return value;
}

function digest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function clearingState(value: unknown): "unmatched" | "settlement_seen" | "provider_matched" | "bank_matched" {
  if (value === "unmatched" || value === "settlement_seen" || value === "provider_matched" || value === "bank_matched") return value;
  fail("invalid_command");
}

function reconciliationClearingState(value: unknown): "unmatched" | "settlement_seen" | "provider_matched" {
  if (value === "unmatched" || value === "settlement_seen" || value === "provider_matched") {
    return value;
  }
  fail("invalid_command");
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: SettlementPaymentReconciliationPersistenceError["reason"]): never {
  throw new SettlementPaymentReconciliationPersistenceError(reason);
}
