import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeJournalTransactions } from "./ledger.schema";
import {
  financeOnlineSaleCaptureApplications,
  financeOnlineSaleCaptureRootLots,
  financeOnlineWalletHeads
} from "./online-sale-capture.schema";
import { financeNumeric38String } from "./finance-values";
import {
  financeProviderSemanticFacts,
  financeWebhookSemanticCommitReceipts
} from "./webhook-inbox.schema";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * Immutable evidence that ArcPay has opened a chargeback against a V2 client-order payment.
 * It records only the provisional provider principal loss and exact payout gate. Commercial
 * allocation, fee evidence, recovery and win/loss resolution are separate later case facts.
 */
export const financeOnlineWalletChargebackCases = pgTable(
  "finance_online_wallet_chargeback_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ElevenHouse case identity used by the immutable chargeback journal source key. */
    chargebackCaseId: varchar("chargeback_case_id", { length: 200 }).notNull(),
    semanticCommitReceiptId: uuid("semantic_commit_receipt_id").notNull(),
    semanticFactId: varchar("semantic_fact_id", { length: 160 }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    /** ArcPay currently documents either a provider chargeback identifier or webhook event id. */
    providerSourceKind: text("provider_source_kind").notNull(),
    providerSourceId: varchar("provider_source_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    captureApplicationId: uuid("capture_application_id").notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    orderId: varchar("order_id", { length: 200 }).notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    caseVersion: integer("case_version").notNull(),
    status: text("status").notNull(),
    disputedPrincipalMinor: financeNumeric38String("disputed_principal_minor").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.semanticCommitReceiptId, table.semanticFactId],
      foreignColumns: [
        financeWebhookSemanticCommitReceipts.id,
        financeWebhookSemanticCommitReceipts.semanticFactId
      ],
      name: "finance_online_wallet_chargeback_cases_semantic_receipt_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.semanticFactId],
      foreignColumns: [financeProviderSemanticFacts.id],
      name: "finance_online_wallet_chargeback_cases_semantic_fact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.captureApplicationId],
      foreignColumns: [financeOnlineSaleCaptureApplications.id],
      name: "finance_online_wallet_chargeback_cases_capture_application_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financeOnlineSaleCaptureRootLots.lotId],
      name: "finance_online_wallet_chargeback_cases_root_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.walletId],
      foreignColumns: [financeOnlineWalletHeads.id],
      name: "finance_online_wallet_chargeback_cases_wallet_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.journalTransactionId],
      foreignColumns: [financeJournalTransactions.id],
      name: "finance_online_wallet_chargeback_cases_journal_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_online_wallet_chargeback_cases_semantic_receipt_unique").on(
      table.semanticCommitReceiptId
    ),
    uniqueIndex("finance_online_wallet_chargeback_cases_case_unique").on(table.chargebackCaseId),
    uniqueIndex("finance_online_wallet_chargeback_cases_provider_source_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerSourceKind,
      table.providerSourceId
    ),
    uniqueIndex("finance_online_wallet_chargeback_cases_journal_unique").on(
      table.journalTransactionId
    ),
    uniqueIndex("finance_online_wallet_chargeback_cases_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_online_wallet_chargeback_cases_digest_unique").on(table.canonicalDigest),
    check(
      "finance_online_wallet_chargeback_cases_state_check",
      sql`${table.caseVersion} = 1
        and ${table.status} = 'provisional_loss'
        and ${table.disputedPrincipalMinor} > 0`
    ),
    check(
      "finance_online_wallet_chargeback_cases_provider_source_check",
      sql`${table.providerSourceKind} in ('provider_chargeback_id', 'webhook_event_id')
        and length(trim(${table.providerSourceId})) between 1 and 160
        and ${table.providerSourceId} = trim(${table.providerSourceId})`
    ),
    check(
      "finance_online_wallet_chargeback_cases_evidence_check",
      sql`${table.canonicalDigest} ~ ${digestPattern}
        and length(${table.canonicalPreimage}) between 1 and 12000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and ${table.committedAt} >= ${table.occurredAt}`
    ),
    check(
      "finance_online_wallet_chargeback_cases_identifier_check",
      sql`length(trim(${table.providerAccountSeriesId})) between 1 and 160
        and ${table.providerAccountSeriesId} = trim(${table.providerAccountSeriesId})
        and length(trim(${table.providerAccountId})) between 1 and 160
        and ${table.providerAccountId} = trim(${table.providerAccountId})
        and ${table.providerIdentityVersion} >= 1
        and length(trim(${table.providerPaymentId})) between 1 and 160
        and ${table.providerPaymentId} = trim(${table.providerPaymentId})
        and length(trim(${table.orderId})) between 1 and 200
        and ${table.orderId} = trim(${table.orderId})
        and length(trim(${table.chargebackCaseId})) between 1 and 200
        and ${table.chargebackCaseId} = trim(${table.chargebackCaseId})`
    ),
    index("finance_online_wallet_chargeback_cases_wallet_active_idx").on(
      table.walletId,
      table.rootLotId,
      table.status,
      table.committedAt,
      table.id
    )
  ]
);

export const financeOnlineWalletChargebackCaseIntegritySql = `
create or replace function finance_reject_online_wallet_chargeback_case_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online wallet chargeback cases are append-only' using errcode = '55000';
end;
$$;

create trigger finance_online_wallet_chargeback_cases_immutable
before update or delete on finance_online_wallet_chargeback_cases
for each row execute function finance_reject_online_wallet_chargeback_case_change();
create trigger finance_online_wallet_chargeback_cases_no_truncate
before truncate on finance_online_wallet_chargeback_cases
for each statement execute function finance_reject_online_wallet_chargeback_case_change();

create or replace function finance_validate_online_wallet_chargeback_case()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  semantic_kind text;
  semantic_purpose text;
  semantic_disposition text;
  semantic_series_id text;
  semantic_provider_account_id text;
  semantic_identity_version integer;
  capture_wallet_id uuid;
  capture_provider_payment_id text;
  capture_root_lot_id text;
  root_wallet_id uuid;
begin
  select semantic_source_kind, purpose, effect_disposition, series_id, provider_account_id,
         provider_identity_version
    into strict semantic_kind, semantic_purpose, semantic_disposition, semantic_series_id,
         semantic_provider_account_id, semantic_identity_version
    from finance_provider_semantic_facts
   where id = new.semantic_fact_id;
  if semantic_kind <> 'chargeback' or semantic_purpose <> 'client_order'
     or semantic_disposition <> 'applied_once'
     or semantic_series_id <> new.provider_account_series_id
     or semantic_provider_account_id <> new.provider_account_id
     or semantic_identity_version <> new.provider_identity_version then
    raise exception 'online wallet chargeback case is not bound to its canonical provider fact' using errcode = '23514';
  end if;

  select application.online_wallet_id, application.provider_payment_id, receipt.root_lot_id
    into strict capture_wallet_id, capture_provider_payment_id, capture_root_lot_id
    from finance_online_sale_capture_applications application
    join finance_online_sale_capture_receipts receipt
      on receipt.receipt_id = application.online_sale_receipt_id
   where application.id = new.capture_application_id;
  select wallet_id into strict root_wallet_id
    from finance_online_sale_capture_root_lots
   where lot_id = new.root_lot_id;
  if capture_wallet_id <> new.wallet_id or root_wallet_id <> new.wallet_id
     or capture_root_lot_id <> new.root_lot_id
     or capture_provider_payment_id <> new.provider_payment_id then
    raise exception 'online wallet chargeback case does not match its V2 capture' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online wallet chargeback case authority is incomplete' using errcode = '23503';
end;
$$;

create constraint trigger finance_online_wallet_chargeback_cases_authority_guard
after insert on finance_online_wallet_chargeback_cases
deferrable initially deferred
for each row execute function finance_validate_online_wallet_chargeback_case();
`;
