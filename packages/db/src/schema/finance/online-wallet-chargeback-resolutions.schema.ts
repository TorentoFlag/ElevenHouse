import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { financeArtifacts } from "./finance-artifacts.schema";
import { financeNumeric38String } from "./finance-values";
import { financeJournalTransactions } from "./ledger.schema";
import { financeOnlineWalletChargebackCases } from "./online-wallet-chargeback-cases.schema";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * Terminal provider outcome for an immutable V2 provisional chargeback case. The case itself is
 * never updated: this one-to-one append-only fact is the sole authority that releases its gate.
 */
export const financeOnlineWalletChargebackResolutions = pgTable(
  "finance_online_wallet_chargeback_resolutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resolutionId: varchar("resolution_id", { length: 200 }).notNull(),
    chargebackCaseId: varchar("chargeback_case_id", { length: 200 }).notNull(),
    expectedCaseVersion: integer("expected_case_version").notNull(),
    resolution: text("resolution").notNull(),
    providerLifecycleFact: text("provider_lifecycle_fact").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    cumulativePrincipalMinor: financeNumeric38String("cumulative_principal_minor").notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    allocationAuthorityId: varchar("allocation_authority_id", { length: 200 }).notNull(),
    allocationAuthorityVersion: varchar("allocation_authority_version", { length: 100 }).notNull(),
    allocationAuthorityDigest: varchar("allocation_authority_digest", { length: 71 }).notNull(),
    decidedByActorId: uuid("decided_by_actor_id").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    journalCanonicalDigest: varchar("journal_canonical_digest", { length: 71 }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", { length: 200 }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({ columns: [table.chargebackCaseId], foreignColumns: [financeOnlineWalletChargebackCases.chargebackCaseId], name: "finance_online_wallet_chargeback_resolutions_case_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.evidenceArtifactId], foreignColumns: [financeArtifacts.id], name: "finance_online_wallet_chargeback_resolutions_artifact_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.journalTransactionId, table.journalCanonicalDigest], foreignColumns: [financeJournalTransactions.id, financeJournalTransactions.canonicalDigest], name: "finance_online_wallet_chargeback_resolutions_journal_fk" }).onDelete("restrict"),
    uniqueIndex("finance_online_wallet_chargeback_resolutions_case_unique").on(table.chargebackCaseId),
    uniqueIndex("finance_online_wallet_chargeback_resolutions_id_unique").on(table.resolutionId),
    uniqueIndex("finance_online_wallet_chargeback_resolutions_journal_unique").on(table.journalTransactionId),
    uniqueIndex("finance_online_wallet_chargeback_resolutions_digest_unique").on(table.canonicalDigest),
    check("finance_online_wallet_chargeback_resolutions_state_check", sql`${table.expectedCaseVersion} = 1 and ${table.resolution} in ('won_reversed', 'lost_after_paid_platform_loss') and ((${table.resolution} = 'won_reversed' and ${table.providerLifecycleFact} = 'won') or (${table.resolution} = 'lost_after_paid_platform_loss' and ${table.providerLifecycleFact} = 'lost'))`),
    check("finance_online_wallet_chargeback_resolutions_evidence_check", sql`${table.cumulativePrincipalMinor} > 0 and ${table.evidenceArtifactDigest} ~ ${digestPattern} and ${table.allocationAuthorityDigest} ~ ${digestPattern} and ${table.journalCanonicalDigest} ~ ${digestPattern} and ${table.canonicalDigest} ~ ${digestPattern} and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$' and length(${table.canonicalPreimage}) between 1 and 12000 and ${table.committedAt} >= ${table.decidedAt}`),
    index("finance_online_wallet_chargeback_resolutions_case_time_idx").on(table.chargebackCaseId, table.committedAt)
  ]
);

export const financeOnlineWalletChargebackResolutionIntegritySql = `
create or replace function finance_reject_online_wallet_chargeback_resolution_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin raise exception 'online wallet chargeback resolutions are append-only' using errcode = '55000'; end;
$$;
create trigger finance_online_wallet_chargeback_resolutions_immutable before update or delete on finance_online_wallet_chargeback_resolutions for each row execute function finance_reject_online_wallet_chargeback_resolution_change();
create trigger finance_online_wallet_chargeback_resolutions_no_truncate before truncate on finance_online_wallet_chargeback_resolutions for each statement execute function finance_reject_online_wallet_chargeback_resolution_change();
create or replace function finance_validate_online_wallet_chargeback_resolution()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare case_row finance_online_wallet_chargeback_cases%rowtype; artifact_digest text;
begin
  select * into strict case_row from finance_online_wallet_chargeback_cases where chargeback_case_id = new.chargeback_case_id;
  select sha256_digest into strict artifact_digest from finance_artifacts where id = new.evidence_artifact_id;
  if case_row.case_version <> new.expected_case_version or case_row.status <> 'provisional_loss'
     or case_row.provider_payment_id <> new.provider_payment_id
     or case_row.disputed_principal_minor <> new.cumulative_principal_minor
     or artifact_digest <> new.evidence_artifact_digest then
    raise exception 'online wallet chargeback resolution authority is incomplete or cross-wired' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then raise exception 'online wallet chargeback resolution authority is missing' using errcode = '23503'; end;
$$;
create constraint trigger finance_online_wallet_chargeback_resolutions_authority_guard after insert on finance_online_wallet_chargeback_resolutions deferrable initially deferred for each row execute function finance_validate_online_wallet_chargeback_resolution();
`;
