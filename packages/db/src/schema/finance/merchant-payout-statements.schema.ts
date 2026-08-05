import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import {
  financeCaptureFacts,
  financeEconomicPaymentIntents
} from "./economic-payments.schema";
import {
  financeArtifactTombstones,
  financeArtifacts
} from "./finance-artifacts.schema";
import {
  financeCurrencyValues,
  financeNumeric38Maximum,
  financeNumeric38Minimum,
  financeNumeric38String,
  formatFinanceSqlValues
} from "./finance-values";
import {
  financeSettlementBatchIngestionCommitReceipts,
  financeSettlementPayoutPageEntries,
  financeSettlementPayouts
} from "./settlement.schema";

// SQL CHECK expressions cannot contain parameter placeholders in a generated migration.
const digestCheck = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * One sealed ArcPay payout statement for one exact completed payout fact. This table is evidence;
 * it neither confirms bank cash nor posts journal, wallet or clearing economics.
 */
export const financeMerchantPayoutStatementReceipts = pgTable(
  "finance_merchant_payout_statement_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    canonicalPreimage: text("canonical_preimage").notNull().default(""),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull().default(""),
    batchIngestionReceiptId: varchar("batch_ingestion_receipt_id", { length: 200 }).notNull(),
    batchIngestionReceiptVersion: integer("batch_ingestion_receipt_version").notNull(),
    batchIngestionReceiptDigest: varchar("batch_ingestion_receipt_digest", {
      length: 71
    }).notNull(),
    settlementPageId: uuid("settlement_page_id").notNull(),
    settlementPayoutId: uuid("settlement_payout_id").notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    merchantPayoutId: varchar("merchant_payout_id", { length: 200 }).notNull(),
    providerBankPayoutId: varchar("provider_bank_payout_id", { length: 500 }).notNull(),
    bankReference: varchar("bank_reference", { length: 320 }).notNull(),
    reportedNetPayoutMinor: financeNumeric38String("reported_net_payout_minor").notNull(),
    currency: text("currency").notNull(),
    outcome: text("outcome").notNull().default("completed"),
    payoutEvidenceArtifactId: varchar("payout_evidence_artifact_id", { length: 160 }).notNull(),
    payoutEvidenceArtifactDigest: varchar("payout_evidence_artifact_digest", {
      length: 71
    }).notNull(),
    payoutEvidenceArtifactByteLength: financeNumeric38String(
      "payout_evidence_artifact_byte_length"
    ).notNull(),
    payoutCompletedAt: timestamp("payout_completed_at", { withTimezone: true }).notNull(),
    payoutObservedAt: timestamp("payout_observed_at", { withTimezone: true }).notNull(),
    statementArtifactId: varchar("statement_artifact_id", { length: 160 }).notNull(),
    statementArtifactDigest: varchar("statement_artifact_digest", { length: 71 }).notNull(),
    statementArtifactByteLength: financeNumeric38String(
      "statement_artifact_byte_length"
    ).notNull(),
    decoderProfileId: varchar("decoder_profile_id", { length: 160 }).notNull(),
    decoderProfileVersion: integer("decoder_profile_version").notNull(),
    decoderProfileDigest: varchar("decoder_profile_digest", { length: 71 }).notNull(),
    decodedPaymentLinesDigest: varchar("decoded_payment_lines_digest", {
      length: 71
    }).notNull(),
    includedPaymentCount: integer("included_payment_count").notNull(),
    statementObservedAt: timestamp("statement_observed_at", { withTimezone: true }).notNull(),
    operationPolicyId: varchar("operation_policy_id", { length: 160 }).notNull(),
    operationPolicyVersion: integer("operation_policy_version").notNull(),
    operationPolicyDigest: varchar("operation_policy_digest", { length: 71 }).notNull(),
    maximumRows: integer("maximum_rows").notNull(),
    maximumDecimalDigits: integer("maximum_decimal_digits").notNull(),
    maximumArtifactBytes: financeNumeric38String("maximum_artifact_bytes").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(""),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.batchIngestionReceiptId,
        table.batchIngestionReceiptVersion,
        table.batchIngestionReceiptDigest
      ],
      foreignColumns: [
        financeSettlementBatchIngestionCommitReceipts.receiptId,
        financeSettlementBatchIngestionCommitReceipts.receiptVersion,
        financeSettlementBatchIngestionCommitReceipts.canonicalDigest
      ],
      name: "finance_merchant_payout_statement_receipts_batch_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.settlementPageId, table.settlementPayoutId],
      foreignColumns: [
        financeSettlementPayoutPageEntries.settlementPageId,
        financeSettlementPayoutPageEntries.settlementPayoutId
      ],
      name: "finance_merchant_payout_statement_receipts_page_payout_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.settlementPayoutId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.merchantPayoutId
      ],
      foreignColumns: [
        financeSettlementPayouts.id,
        financeSettlementPayouts.providerAccountSeriesId,
        financeSettlementPayouts.providerAccountId,
        financeSettlementPayouts.providerIdentityVersion,
        financeSettlementPayouts.merchantPayoutId
      ],
      name: "finance_merchant_payout_statement_receipts_payout_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.payoutEvidenceArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_merchant_payout_statement_receipts_payout_artifact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.statementArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_merchant_payout_statement_receipts_statement_artifact_fk"
    }).onDelete("restrict"),
    unique("finance_merchant_payout_statement_receipts_nominal_ref_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_merchant_payout_statement_receipts_exact_owner_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId
    ),
    unique("finance_merchant_payout_statement_receipts_payout_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId
    ),
    unique("finance_merchant_payout_statement_receipts_artifact_unique").on(
      table.statementArtifactId
    ),
    unique("finance_merchant_payout_statement_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_merchant_payout_statement_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.batchIngestionReceiptVersion} = 1
        and ${table.canonicalDigest} ~ ${digestCheck}
        and ${table.batchIngestionReceiptDigest} ~ ${digestCheck}
        and ${table.payoutEvidenceArtifactDigest} ~ ${digestCheck}
        and ${table.statementArtifactDigest} ~ ${digestCheck}
        and ${table.decoderProfileDigest} ~ ${digestCheck}
        and ${table.decodedPaymentLinesDigest} ~ ${digestCheck}
        and ${table.operationPolicyDigest} ~ ${digestCheck}
        and ${table.reportedNetPayoutMinor} > 0
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.outcome} = 'completed'
        and ${table.decoderProfileVersion} >= 1
        and ${table.includedPaymentCount} >= 1
        and ${table.operationPolicyVersion} >= 1
        and ${table.maximumRows} >= 1
        and ${table.maximumDecimalDigits} >= 1
        and ${table.maximumArtifactBytes} >= 1
        and ${table.payoutEvidenceArtifactByteLength} >= 0
        and ${table.statementArtifactByteLength} >= 0
        and ${table.payoutObservedAt} >= ${table.payoutCompletedAt}
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    ),
    check(
      "finance_merchant_payout_statement_receipts_budget_check",
      sql`${table.includedPaymentCount} <= ${table.maximumRows}
        and ${table.statementArtifactByteLength} <= ${table.maximumArtifactBytes}
        and length(trim(leading '-' from ${table.reportedNetPayoutMinor}::text)) <= ${table.maximumDecimalDigits}`
    ),
    index("finance_merchant_payout_statement_receipts_history_idx").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.committedAt,
      table.receiptId
    )
  ]
);

/** Exact per-payment authority later consumed together with a bank-cash match receipt. */
export const financeMerchantPayoutPaymentInclusions = pgTable(
  "finance_merchant_payout_payment_inclusions",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    canonicalPreimage: text("canonical_preimage").notNull().default(""),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull().default(""),
    statementReceiptId: varchar("statement_receipt_id", { length: 200 }).notNull(),
    statementReceiptVersion: integer("statement_receipt_version").notNull(),
    statementReceiptDigest: varchar("statement_receipt_digest", { length: 71 }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    merchantPayoutId: varchar("merchant_payout_id", { length: 200 }).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    captureFactId: varchar("capture_fact_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    lineNumber: integer("line_number").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    feeAmountMinor: financeNumeric38String("fee_amount_minor").notNull(),
    currency: text("currency").notNull(),
    lineDigest: varchar("line_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(""),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.statementReceiptId,
        table.statementReceiptVersion,
        table.statementReceiptDigest,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.merchantPayoutId
      ],
      foreignColumns: [
        financeMerchantPayoutStatementReceipts.receiptId,
        financeMerchantPayoutStatementReceipts.receiptVersion,
        financeMerchantPayoutStatementReceipts.canonicalDigest,
        financeMerchantPayoutStatementReceipts.providerAccountSeriesId,
        financeMerchantPayoutStatementReceipts.providerAccountId,
        financeMerchantPayoutStatementReceipts.providerIdentityVersion,
        financeMerchantPayoutStatementReceipts.merchantPayoutId
      ],
      name: "finance_merchant_payout_payment_inclusions_statement_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.economicPaymentIntentId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeEconomicPaymentIntents.id,
        financeEconomicPaymentIntents.seriesId,
        financeEconomicPaymentIntents.providerAccountId,
        financeEconomicPaymentIntents.providerIdentityVersion
      ],
      name: "finance_merchant_payout_payment_inclusions_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.captureFactId],
      foreignColumns: [financeCaptureFacts.id],
      name: "finance_merchant_payout_payment_inclusions_capture_fk"
    }).onDelete("restrict"),
    unique("finance_merchant_payout_payment_inclusions_nominal_ref_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_merchant_payout_payment_inclusions_statement_line_unique").on(
      table.statementReceiptId,
      table.lineNumber
    ),
    unique("finance_merchant_payout_payment_inclusions_statement_payment_unique").on(
      table.statementReceiptId,
      table.providerPaymentId
    ),
    unique("finance_merchant_payout_payment_inclusions_exact_authority_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest,
      table.statementReceiptId,
      table.statementReceiptVersion,
      table.statementReceiptDigest,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId,
      table.economicPaymentIntentId,
      table.captureFactId,
      table.providerPaymentId,
      table.externalId,
      table.lineNumber,
      table.amountMinor,
      table.feeAmountMinor,
      table.currency,
      table.lineDigest
    ),
    unique("finance_merchant_payout_payment_inclusions_capture_unique").on(table.captureFactId),
    check(
      "finance_merchant_payout_payment_inclusions_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.statementReceiptVersion} = 1
        and ${table.canonicalDigest} ~ ${digestCheck}
        and ${table.statementReceiptDigest} ~ ${digestCheck}
        and ${table.lineDigest} ~ ${digestCheck}
        and ${table.lineNumber} >= 1
        and ${table.amountMinor} > 0
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    ),
    check(
      "finance_merchant_payout_payment_inclusions_signed_fee_check",
      sql`${table.feeAmountMinor} between ${sql.raw(financeNumeric38Minimum)} and ${sql.raw(financeNumeric38Maximum)}`
    ),
    index("finance_merchant_payout_payment_inclusions_payment_idx").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.receiptId
    )
  ]
);

/** Baseline owner executes this DDL after Drizzle creates the focused tables. */
export const financeMerchantPayoutStatementIntegritySql = `
create or replace function finance_issue_merchant_payout_statement_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  ingestion finance_settlement_batch_ingestion_commit_receipts%rowtype;
  payout finance_settlement_payouts%rowtype;
  payout_artifact finance_artifacts%rowtype;
  artifact finance_artifacts%rowtype;
begin
  select * into ingestion
  from finance_settlement_batch_ingestion_commit_receipts
  where receipt_id = new.batch_ingestion_receipt_id
    and receipt_version = new.batch_ingestion_receipt_version
    and canonical_digest = new.batch_ingestion_receipt_digest;
  if not found
     or ingestion.stream <> 'settlement_payouts'
     or ingestion.settlement_page_id <> new.settlement_page_id
     or ingestion.provider_account_series_id <> new.provider_account_series_id
     or ingestion.provider_account_id <> new.provider_account_id
     or ingestion.provider_identity_version <> new.provider_identity_version
     or ingestion.raw_artifact_id <> new.payout_evidence_artifact_id
     or ingestion.raw_artifact_digest <> new.payout_evidence_artifact_digest
     or ingestion.raw_artifact_byte_length <> new.payout_evidence_artifact_byte_length then
    raise exception 'merchant payout statement lost exact batch authority' using errcode = '23514';
  end if;

  select payout_row.* into payout
  from finance_settlement_payouts payout_row
  join finance_settlement_payout_page_entries page_entry
    on page_entry.settlement_payout_id = payout_row.id
   and page_entry.settlement_page_id = new.settlement_page_id
  where payout_row.id = new.settlement_payout_id;
  if not found
     or payout.provider_account_series_id <> new.provider_account_series_id
     or payout.provider_account_id <> new.provider_account_id
     or payout.provider_identity_version <> new.provider_identity_version
     or payout.merchant_payout_id <> new.merchant_payout_id
     or payout.provider_bank_payout_id is distinct from new.provider_bank_payout_id
     or payout.amount_minor <> new.reported_net_payout_minor
     or payout.currency <> new.currency
     or payout.status <> 'completed'
     or payout.completed_at is null
     or payout.completed_at::timestamptz <> new.payout_completed_at
     or payout.failed_reason is not null then
    raise exception 'merchant payout statement does not rebind the exact completed payout'
      using errcode = '23514';
  end if;

  select * into payout_artifact from finance_artifacts
  where id = new.payout_evidence_artifact_id;
  if not found
     or payout_artifact.artifact_class <> 'provider_settlement_page'
     or payout_artifact.binding_kind <> 'provider'
     or payout_artifact.series_id <> new.provider_account_series_id
     or payout_artifact.provider_account_id <> new.provider_account_id
     or payout_artifact.provider_identity_version <> new.provider_identity_version
     or payout_artifact.sha256_digest <> new.payout_evidence_artifact_digest
     or payout_artifact.byte_length <> new.payout_evidence_artifact_byte_length
     or exists (
       select 1 from finance_artifact_tombstones tombstone
       where tombstone.artifact_id = payout_artifact.id
     ) then
    raise exception 'merchant payout evidence artifact is not exact active provider evidence'
      using errcode = '23514';
  end if;

  select * into artifact from finance_artifacts where id = new.statement_artifact_id;
  if not found
     or artifact.artifact_class <> 'provider_payout_statement'
     or artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.provider_account_series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.statement_artifact_digest
     or artifact.byte_length <> new.statement_artifact_byte_length
     or exists (
       select 1 from finance_artifact_tombstones tombstone
       where tombstone.artifact_id = artifact.id
     ) then
    raise exception 'merchant payout statement artifact is not exact active provider evidence'
      using errcode = '23514';
  end if;

  if new.outcome <> 'completed'
     or new.included_payment_count < 1
     or new.included_payment_count > new.maximum_rows
     or new.statement_artifact_byte_length > new.maximum_artifact_bytes
     or length(trim(leading '-' from new.reported_net_payout_minor::text)) > new.maximum_decimal_digits then
    raise exception 'merchant payout statement exceeds its resolved operation envelope'
      using errcode = '22023';
  end if;

  new.receipt_id := gen_random_uuid()::text;
  new.receipt_version := 1;
  new.committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'merchant_payout_statement_ingestion_commit_receipt',
    'receiptId', new.receipt_id,
    'batchIngestionReceiptId', new.batch_ingestion_receipt_id,
    'batchIngestionReceiptVersion', new.batch_ingestion_receipt_version,
    'batchIngestionReceiptDigest', new.batch_ingestion_receipt_digest,
    'settlementPageId', new.settlement_page_id,
    'settlementPayoutId', new.settlement_payout_id,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'merchantPayoutId', new.merchant_payout_id,
    'providerBankPayoutId', new.provider_bank_payout_id,
    'bankReference', new.bank_reference,
    'reportedNetPayoutMinor', new.reported_net_payout_minor::text,
    'currency', new.currency,
    'outcome', new.outcome,
    'payoutEvidenceArtifactId', new.payout_evidence_artifact_id,
    'payoutEvidenceArtifactDigest', new.payout_evidence_artifact_digest,
    'payoutEvidenceArtifactByteLength', new.payout_evidence_artifact_byte_length::text,
    'payoutCompletedAt', to_char(new.payout_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payoutObservedAt', to_char(new.payout_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'statementArtifactId', new.statement_artifact_id,
    'statementArtifactDigest', new.statement_artifact_digest,
    'statementArtifactByteLength', new.statement_artifact_byte_length::text,
    'decoderProfileId', new.decoder_profile_id,
    'decoderProfileVersion', new.decoder_profile_version,
    'decoderProfileDigest', new.decoder_profile_digest,
    'decodedPaymentLinesDigest', new.decoded_payment_lines_digest,
    'includedPaymentCount', new.included_payment_count,
    'statementObservedAt', to_char(new.statement_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'operationPolicyId', new.operation_policy_id,
    'operationPolicyVersion', new.operation_policy_version,
    'operationPolicyDigest', new.operation_policy_digest,
    'maximumRows', new.maximum_rows,
    'maximumDecimalDigits', new.maximum_decimal_digits,
    'maximumArtifactBytes', new.maximum_artifact_bytes::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  return new;
end;
$$;

create trigger finance_issue_merchant_payout_statement_receipt_insert
before insert on finance_merchant_payout_statement_receipts
for each row execute function finance_issue_merchant_payout_statement_receipt();

create or replace function finance_issue_merchant_payout_payment_inclusion_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  statement finance_merchant_payout_statement_receipts%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
  capture_fact finance_capture_facts%rowtype;
  line_preimage text;
  expected_line_digest text;
begin
  select * into statement
  from finance_merchant_payout_statement_receipts
  where receipt_id = new.statement_receipt_id
    and receipt_version = new.statement_receipt_version
    and canonical_digest = new.statement_receipt_digest;
  if not found
     or statement.provider_account_series_id <> new.provider_account_series_id
     or statement.provider_account_id <> new.provider_account_id
     or statement.provider_identity_version <> new.provider_identity_version
     or statement.merchant_payout_id <> new.merchant_payout_id then
    raise exception 'payment inclusion lost exact statement authority' using errcode = '23514';
  end if;

  select * into economic_intent from finance_economic_payment_intents
  where id = new.economic_payment_intent_id;
  select * into capture_fact from finance_capture_facts
  where id = new.capture_fact_id;
  if economic_intent.id is null
     or capture_fact.id is null
     or economic_intent.state <> 'captured'
     or economic_intent.series_id <> new.provider_account_series_id
     or economic_intent.provider_account_id <> new.provider_account_id
     or economic_intent.provider_identity_version <> new.provider_identity_version
     or economic_intent.source_id <> new.external_id
     or economic_intent.amount_minor <> new.amount_minor
     or economic_intent.currency <> new.currency
     or capture_fact.economic_payment_intent_id <> new.economic_payment_intent_id
     or capture_fact.series_id <> new.provider_account_series_id
     or capture_fact.provider_account_id <> new.provider_account_id
     or capture_fact.provider_identity_version <> new.provider_identity_version
     or capture_fact.provider_payment_id <> new.provider_payment_id
     or capture_fact.amount_minor <> new.amount_minor
     or capture_fact.currency <> new.currency then
    raise exception 'payment inclusion does not rebind exact captured payment'
      using errcode = '23514';
  end if;

  if length(trim(leading '-' from new.amount_minor::text)) > statement.maximum_decimal_digits
     or length(trim(leading '-' from new.fee_amount_minor::text)) > statement.maximum_decimal_digits then
    raise exception 'payment inclusion exceeds decimal digit budget' using errcode = '22023';
  end if;

  line_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'arc_merchant_payout_statement_payment_line',
    'lineNumber', new.line_number,
    'providerPaymentId', new.provider_payment_id,
    'externalId', new.external_id,
    'amountMinor', new.amount_minor::text,
    'feeAmountMinor', new.fee_amount_minor::text,
    'currency', new.currency
  ));
  expected_line_digest := 'sha256:' || encode(
    digest(convert_to(line_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  if new.line_digest <> expected_line_digest then
    raise exception 'payment inclusion line digest mismatch' using errcode = '23514';
  end if;

  new.receipt_id := gen_random_uuid()::text;
  new.receipt_version := 1;
  new.committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'merchant_payout_payment_inclusion_commit_receipt',
    'receiptId', new.receipt_id,
    'statementReceiptId', new.statement_receipt_id,
    'statementReceiptVersion', new.statement_receipt_version,
    'statementReceiptDigest', new.statement_receipt_digest,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'merchantPayoutId', new.merchant_payout_id,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'captureFactId', new.capture_fact_id,
    'providerPaymentId', new.provider_payment_id,
    'externalId', new.external_id,
    'lineNumber', new.line_number,
    'amountMinor', new.amount_minor::text,
    'feeAmountMinor', new.fee_amount_minor::text,
    'currency', new.currency,
    'lineDigest', new.line_digest,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  return new;
end;
$$;

create trigger finance_issue_merchant_payout_payment_inclusion_receipt_insert
before insert on finance_merchant_payout_payment_inclusions
for each row execute function finance_issue_merchant_payout_payment_inclusion_receipt();

create or replace function finance_validate_merchant_payout_statement_complete()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  statement_id text;
  statement finance_merchant_payout_statement_receipts%rowtype;
  included_count integer;
  lines_preimage text;
  expected_lines_digest text;
begin
  statement_id := case
    when tg_table_name = 'finance_merchant_payout_statement_receipts' then new.receipt_id
    else new.statement_receipt_id
  end;
  select * into statement from finance_merchant_payout_statement_receipts
  where receipt_id = statement_id;
  if not found then return null; end if;

  select count(*)::integer,
    finance_canonical_jsonb_v1(jsonb_build_object(
      'kind', 'arc_merchant_payout_statement_payment_lines',
      'lines', coalesce(jsonb_agg(jsonb_build_object(
        'lineNumber', inclusion.line_number,
        'providerPaymentId', inclusion.provider_payment_id,
        'externalId', inclusion.external_id,
        'amountMinor', inclusion.amount_minor::text,
        'feeAmountMinor', inclusion.fee_amount_minor::text,
        'currency', inclusion.currency,
        'lineDigest', inclusion.line_digest
      ) order by inclusion.line_number), '[]'::jsonb)
    ))
    into included_count, lines_preimage
  from finance_merchant_payout_payment_inclusions inclusion
  where inclusion.statement_receipt_id = statement.receipt_id;
  expected_lines_digest := 'sha256:' || encode(
    digest(convert_to(lines_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  if statement.included_payment_count <> included_count
     or statement.decoded_payment_lines_digest <> expected_lines_digest then
    raise exception 'merchant payout statement line inventory is incomplete or substituted'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_merchant_payout_statement_complete
after insert on finance_merchant_payout_statement_receipts
deferrable initially deferred
for each row execute function finance_validate_merchant_payout_statement_complete();

create constraint trigger finance_validate_merchant_payout_statement_inclusions_complete
after insert on finance_merchant_payout_payment_inclusions
deferrable initially deferred
for each row execute function finance_validate_merchant_payout_statement_complete();

create or replace function finance_reject_merchant_payout_statement_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'merchant payout statement authority is immutable' using errcode = '55000';
end;
$$;

create trigger finance_merchant_payout_statement_receipts_immutable
before update or delete on finance_merchant_payout_statement_receipts
for each row execute function finance_reject_merchant_payout_statement_mutation();
create trigger finance_merchant_payout_statement_receipts_no_truncate
before truncate on finance_merchant_payout_statement_receipts
for each statement execute function finance_reject_merchant_payout_statement_mutation();
create trigger finance_merchant_payout_payment_inclusions_immutable
before update or delete on finance_merchant_payout_payment_inclusions
for each row execute function finance_reject_merchant_payout_statement_mutation();
create trigger finance_merchant_payout_payment_inclusions_no_truncate
before truncate on finance_merchant_payout_payment_inclusions
for each statement execute function finance_reject_merchant_payout_statement_mutation();
`;

// Keep the tombstone import live in the same focused schema dependency graph used by the SQL DDL.
void financeArtifactTombstones;
