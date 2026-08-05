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
import { financeOnlineWalletMutations } from "./online-wallet-mutations.schema";
import { financeNumeric38String } from "./finance-values";
import {
  financeProviderSemanticFacts,
  financeWebhookSemanticCommitReceipts
} from "./webhook-inbox.schema";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * Immutable application of one canonical ArcPay refund result to the V2 online wallet.
 * The semantic fact is the evidence authority; the stored cumulative amounts make rounding,
 * replay and provider-event ordering independently auditable.
 */
export const financeOnlineWalletRefundApplications = pgTable(
  "finance_online_wallet_refund_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    semanticCommitReceiptId: uuid("semantic_commit_receipt_id").notNull(),
    semanticFactId: varchar("semantic_fact_id", { length: 160 }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerRefundId: varchar("provider_refund_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    captureApplicationId: uuid("capture_application_id").notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    walletRevision: financeNumeric38String("wallet_revision").notNull(),
    outcome: text("outcome").notNull(),
    walletMutationId: uuid("wallet_mutation_id"),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }),
    previousRefundedMinor: financeNumeric38String("previous_refunded_minor").notNull(),
    cumulativeRefundedMinor: financeNumeric38String("cumulative_refunded_minor").notNull(),
    refundDeltaMinor: financeNumeric38String("refund_delta_minor").notNull(),
    commissionReversalMinor: financeNumeric38String("commission_reversal_minor"),
    payableReversalMinor: financeNumeric38String("payable_reversal_minor"),
    blockedPayoutOutcomeMinor: financeNumeric38String("blocked_payout_outcome_minor").notNull(),
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
      name: "finance_online_wallet_refund_applications_semantic_receipt_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.semanticFactId],
      foreignColumns: [financeProviderSemanticFacts.id],
      name: "finance_online_wallet_refund_applications_semantic_fact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.captureApplicationId],
      foreignColumns: [financeOnlineSaleCaptureApplications.id],
      name: "finance_online_wallet_refund_applications_capture_application_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financeOnlineSaleCaptureRootLots.lotId],
      name: "finance_online_wallet_refund_applications_root_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.walletId],
      foreignColumns: [financeOnlineWalletHeads.id],
      name: "finance_online_wallet_refund_applications_wallet_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.walletMutationId],
      foreignColumns: [financeOnlineWalletMutations.mutationId],
      name: "finance_online_wallet_refund_applications_wallet_mutation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.journalTransactionId],
      foreignColumns: [financeJournalTransactions.id],
      name: "finance_online_wallet_refund_applications_journal_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_online_wallet_refund_applications_semantic_receipt_unique").on(
      table.semanticCommitReceiptId
    ),
    uniqueIndex("finance_online_wallet_refund_applications_provider_refund_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerRefundId
    ),
    uniqueIndex("finance_online_wallet_refund_applications_mutation_unique").on(
      table.walletMutationId
    ),
    uniqueIndex("finance_online_wallet_refund_applications_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_online_wallet_refund_applications_digest_unique").on(table.canonicalDigest),
    check(
      "finance_online_wallet_refund_applications_amount_check",
      sql`${table.previousRefundedMinor} >= 0
        and ${table.cumulativeRefundedMinor} > ${table.previousRefundedMinor}
        and ${table.refundDeltaMinor} = ${table.cumulativeRefundedMinor} - ${table.previousRefundedMinor}
        and ${table.blockedPayoutOutcomeMinor} >= 0
        and ${table.walletRevision} >= 1
        and (
          (${table.outcome} = 'applied'
            and ${table.walletMutationId} is not null
            and ${table.journalTransactionId} is not null
            and ${table.commissionReversalMinor} >= 0
            and ${table.payableReversalMinor} >= 0
            and ${table.blockedPayoutOutcomeMinor} = 0
            and ${table.commissionReversalMinor} + ${table.payableReversalMinor} = ${table.refundDeltaMinor})
          or (${table.outcome} = 'blocked_payout_outcome'
            and ${table.walletMutationId} is null
            and ${table.journalTransactionId} is null
            and ${table.commissionReversalMinor} is null
            and ${table.payableReversalMinor} is null
            and ${table.blockedPayoutOutcomeMinor} > 0)
        )`
    ),
    check(
      "finance_online_wallet_refund_applications_evidence_check",
      sql`${table.canonicalDigest} ~ ${digestPattern}
        and length(${table.canonicalPreimage}) between 1 and 12000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and ${table.committedAt} >= ${table.occurredAt}`
    ),
    check(
      "finance_online_wallet_refund_applications_identifier_check",
      sql`length(trim(${table.providerAccountSeriesId})) between 1 and 160
        and ${table.providerAccountSeriesId} = trim(${table.providerAccountSeriesId})
        and length(trim(${table.providerAccountId})) between 1 and 160
        and ${table.providerAccountId} = trim(${table.providerAccountId})
        and ${table.providerIdentityVersion} >= 1
        and length(trim(${table.providerRefundId})) between 1 and 160
        and ${table.providerRefundId} = trim(${table.providerRefundId})
        and length(trim(${table.providerPaymentId})) between 1 and 160
        and ${table.providerPaymentId} = trim(${table.providerPaymentId})`
    ),
    index("finance_online_wallet_refund_applications_wallet_history_idx").on(
      table.walletId,
      table.committedAt,
      table.id
    )
  ]
);

/** Installed only after the complete V2 refund application graph exists in the baseline. */
export const financeOnlineWalletRefundApplicationIntegritySql = `
create or replace function finance_reject_online_wallet_refund_application_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online wallet refund applications are append-only' using errcode = '55000';
end;
$$;

create trigger finance_online_wallet_refund_applications_immutable
before update or delete on finance_online_wallet_refund_applications
for each row execute function finance_reject_online_wallet_refund_application_change();
create trigger finance_online_wallet_refund_applications_no_truncate
before truncate on finance_online_wallet_refund_applications
for each statement execute function finance_reject_online_wallet_refund_application_change();

create or replace function finance_validate_online_wallet_refund_application()
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
  mutation_wallet_id uuid;
  mutation_operation_kind text;
  mutation_journal_transaction_id text;
begin
  select semantic_source_kind, purpose, effect_disposition, series_id, provider_account_id,
         provider_identity_version
    into strict semantic_kind, semantic_purpose, semantic_disposition, semantic_series_id,
         semantic_provider_account_id, semantic_identity_version
    from finance_provider_semantic_facts
   where id = new.semantic_fact_id;
  if semantic_kind <> 'refund' or semantic_purpose <> 'client_order'
     or semantic_disposition <> 'applied_once'
     or semantic_series_id <> new.provider_account_series_id
     or semantic_provider_account_id <> new.provider_account_id
     or semantic_identity_version <> new.provider_identity_version then
    raise exception 'online wallet refund application semantic fact is not its canonical refund authority' using errcode = '23514';
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
    raise exception 'online wallet refund application does not match its V2 capture or mutation' using errcode = '23514';
  end if;
  if new.outcome = 'applied' then
    select wallet_id, operation_kind, journal_transaction_id
      into strict mutation_wallet_id, mutation_operation_kind, mutation_journal_transaction_id
      from finance_online_wallet_mutations
     where mutation_id = new.wallet_mutation_id;
    if mutation_wallet_id <> new.wallet_id
       or mutation_operation_kind <> 'refund_confirmed'
       or mutation_journal_transaction_id <> new.journal_transaction_id then
      raise exception 'online wallet refund application does not match its V2 capture or mutation' using errcode = '23514';
    end if;
  end if;
  return null;
exception when no_data_found then
  raise exception 'online wallet refund application authority is incomplete' using errcode = '23503';
end;
$$;

create constraint trigger finance_online_wallet_refund_applications_authority_guard
after insert on finance_online_wallet_refund_applications
deferrable initially deferred
for each row execute function finance_validate_online_wallet_refund_application();
`;
