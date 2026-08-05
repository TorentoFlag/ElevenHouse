import { type SQLWrapper, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { financeArtifacts } from "./finance-artifacts.schema";
import {
  financeCurrencyValues,
  financeNumeric38String,
  financeRevisionString,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  payoutMethodValues,
  payoutRequestStatusValues
} from "./finance-values";

const canonicalPayoutIdentifierCheck = (value: SQLWrapper) =>
  sql`length(trim(${value})) between 1 and 160 and ${value} = trim(${value}) and ${value} !~ '[[:cntrl:]]'`;

export const payoutMethods = pgTable(
  "payout_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    currency: text("currency").notNull().default("RUB"),
    displayName: text("display_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /** Current immutable destination snapshot version. */
    version: financeRevisionString("version").notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "payout_methods_method_check",
      sql`${table.method} in ${sql.raw(formatFinanceSqlValues(payoutMethodValues))}`
    ),
    check(
      "payout_methods_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "payout_methods_display_name_check",
      sql`length(trim(${table.displayName})) between 1 and 160`
    ),
    check("payout_methods_version_check", sql`${table.version} >= 1`),
    check("payout_methods_manual_only_check", sql`${table.method} = 'manual_bank_transfer'`),
    uniqueIndex("payout_methods_default_astrologer_unique")
      .on(table.astrologerUserId)
      .where(sql`${table.isDefault} = true`),
    index("payout_methods_astrologer_created_idx").on(table.astrologerUserId, table.createdAt)
  ]
);

/**
 * Append-only, KMS-backed recipient snapshots. Plain beneficiary data lives only in the
 * immutable private object identified by `sealedDestinationRef`; neither this table nor
 * payout requests may contain a card/account number or bank routing details.
 */
export const payoutMethodVersions = pgTable(
  "payout_method_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutMethodId: uuid("payout_method_id")
      .notNull()
      .references(() => payoutMethods.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    destinationKind: text("destination_kind").notNull(),
    beneficiaryFingerprint: text("beneficiary_fingerprint").notNull(),
    redactedDisplay: text("redacted_display").notNull(),
    sealedDestinationRef: text("sealed_destination_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("payout_method_versions_version_check", sql`${table.version} >= 1`),
    check(
      "payout_method_versions_destination_kind_check",
      sql`${table.destinationKind} in ('bank_card', 'bank_account')`
    ),
    check(
      "payout_method_versions_fingerprint_check",
      sql`${table.beneficiaryFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "payout_method_versions_redacted_display_check",
      sql`length(trim(${table.redactedDisplay})) between 8 and 180`
    ),
    check(
      "payout_method_versions_sealed_ref_check",
      sql`length(trim(${table.sealedDestinationRef})) between 12 and 4096`
    ),
    uniqueIndex("payout_method_versions_method_version_unique").on(
      table.payoutMethodId,
      table.version
    )
  ]
);

export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    payoutMethodId: uuid("payout_method_id")
      .notNull()
      .references(() => payoutMethods.id, { onDelete: "restrict" }),
    payoutMethodVersion: integer("payout_method_version").notNull(),
    destinationKind: text("destination_kind").notNull(),
    beneficiaryFingerprint: text("beneficiary_fingerprint").notNull(),
    redactedDisplay: text("redacted_display").notNull(),
    sealedDestinationRef: text("sealed_destination_ref").notNull(),
    status: text("status").notNull().default("requested"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    adminUserId: uuid("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    adminNote: text("admin_note"),
    failureReason: text("failure_reason"),
    externalReference: text("external_reference"),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    /** Immutable KMS/private bank-transfer evidence required to enter `paid`. */
    paidProofArtifactId: varchar("paid_proof_artifact_id", { length: 160 }),
    paidProofArtifactDigest: varchar("paid_proof_artifact_digest", { length: 71 }),
    paidProofArtifactByteLength: bigint("paid_proof_artifact_byte_length", { mode: "number" }),
    /** Optimistic-lock revision for every administrative payout transition. */
    version: financeRevisionString("version").notNull().default("1"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.paidProofArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "payout_requests_paid_proof_artifact_fk"
    }).onDelete("restrict"),
    check(
      "payout_requests_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(payoutRequestStatusValues))}`
    ),
    check(
      "payout_requests_method_check",
      sql`${table.method} in ${sql.raw(formatFinanceSqlValues(payoutMethodValues))}`
    ),
    check(
      "payout_requests_amount_check",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check("payout_requests_version_check", sql`${table.version} >= 1`),
    check(
      "payout_requests_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "payout_requests_method_provider_shape_check",
      sql`${table.method} = 'manual_bank_transfer'`
    ),
    check("payout_requests_method_version_check", sql`${table.payoutMethodVersion} >= 1`),
    check(
      "payout_requests_destination_kind_check",
      sql`${table.destinationKind} in ('bank_card', 'bank_account')`
    ),
    check(
      "payout_requests_beneficiary_fingerprint_check",
      sql`${table.beneficiaryFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "payout_requests_redacted_display_check",
      sql`length(trim(${table.redactedDisplay})) between 8 and 180`
    ),
    check(
      "payout_requests_sealed_ref_check",
      sql`length(trim(${table.sealedDestinationRef})) between 12 and 4096`
    ),
    check(
      "payout_requests_paid_evidence_check",
      sql`${table.status} <> 'paid' or (
        ${table.externalReference} is not null
        and ${table.transferredAt} is not null
        and ${table.paidProofArtifactId} is not null
        and ${table.paidProofArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.paidProofArtifactByteLength} > 0
      )`
    ),
    check(
      "payout_requests_paid_proof_shape_check",
      sql`(
        ${table.paidProofArtifactId} is null
        and ${table.paidProofArtifactDigest} is null
        and ${table.paidProofArtifactByteLength} is null
      ) or (
        ${table.paidProofArtifactId} is not null
        and length(trim(${table.paidProofArtifactId})) between 1 and 160
        and ${table.paidProofArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.paidProofArtifactByteLength} > 0
      )`
    ),
    uniqueIndex("payout_requests_paid_proof_artifact_unique")
      .on(table.paidProofArtifactId)
      .where(sql`${table.paidProofArtifactId} is not null`),
    check(
      "payout_requests_failure_reason_check",
      sql`${table.status} not in ('failed', 'rejected') or (${table.failureReason} is not null and length(trim(${table.failureReason})) between 1 and 2000)`
    ),
    check(
      "payout_requests_admin_note_length_check",
      sql`${table.adminNote} is null or length(trim(${table.adminNote})) between 1 and 2000`
    ),
    check(
      "payout_requests_external_reference_length_check",
      sql`${table.externalReference} is null or length(trim(${table.externalReference})) between 1 and 240`
    ),
    check("payout_requests_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("payout_requests_astrologer_requested_idx").on(
      table.astrologerUserId,
      table.requestedAt,
      table.id
    ),
    index("payout_requests_status_requested_idx").on(table.status, table.requestedAt, table.id)
  ]
);

/**
 * Canonical payout aggregate used by the sealed finance ledger. `payoutRequests` above is the
 * legacy astrologer-API projection; it must not be used as an authority for a wallet mutation.
 */
export const financePayoutRequests = pgTable(
  "finance_payout_requests",
  {
    id: text("id").primaryKey(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    immutableAmountMinor: financeNumeric38String("immutable_amount_minor").notNull(),
    status: text("status").notNull().default("requested"),
    version: financeRevisionString("version").notNull().default("1"),
    payoutMethodId: text("payout_method_id").notNull(),
    payoutMethodVersion: integer("payout_method_version").notNull(),
    destinationKind: text("destination_kind").notNull(),
    beneficiaryFingerprint: text("beneficiary_fingerprint").notNull(),
    redactedDisplay: text("redacted_display").notNull(),
    encryptedDestinationRef: text("encrypted_destination_ref").notNull(),
    payoutAuthorityId: text("payout_authority_id").notNull(),
    payoutAuthorityVersion: financeRevisionString("payout_authority_version").notNull(),
    payoutAuthorityDigest: text("payout_authority_digest").notNull(),
    allocationSetDigest: text("allocation_set_digest").notNull(),
    allocationCount: integer("allocation_count").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "finance_payout_requests_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check("finance_payout_requests_status_check", sql`${table.status} = 'requested'`),
    check("finance_payout_requests_amount_check", sql`${table.immutableAmountMinor} > 0`),
    check(
      "finance_payout_requests_version_check",
      sql`${table.version} = 1 and ${table.payoutMethodVersion} >= 1 and ${table.payoutAuthorityVersion} >= 1 and ${table.allocationCount} > 0`
    ),
    check(
      "finance_payout_requests_digest_check",
      sql`${table.beneficiaryFingerprint} ~ '^sha256:[a-f0-9]{64}$' and ${table.payoutAuthorityDigest} ~ '^sha256:[a-f0-9]{64}$' and ${table.allocationSetDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "finance_payout_requests_destination_check",
      sql`${table.destinationKind} in ('bank_card', 'bank_account') and length(trim(${table.redactedDisplay})) between 8 and 180 and length(trim(${table.encryptedDestinationRef})) between 12 and 4096`
    ),
    check(
      "finance_payout_requests_identifier_check",
      sql`${canonicalPayoutIdentifierCheck(table.id)} and ${canonicalPayoutIdentifierCheck(table.payoutMethodId)} and ${canonicalPayoutIdentifierCheck(table.payoutAuthorityId)}`
    ),
    index("finance_payout_requests_wallet_requested_idx").on(
      table.walletId,
      table.requestedAt,
      table.id
    ),
    index("finance_payout_requests_status_requested_idx").on(
      table.status,
      table.requestedAt,
      table.id
    )
  ]
);

export const financePayoutRequestAllocations = pgTable(
  "finance_payout_request_allocations",
  {
    payoutRequestId: text("payout_request_id")
      .notNull()
      .references(() => financePayoutRequests.id, { onDelete: "restrict" }),
    payoutAllocationId: text("payout_allocation_id").notNull(),
    sourceLotId: text("source_lot_id").notNull(),
    payoutPendingLotId: text("payout_pending_lot_id").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    ordinal: integer("ordinal").notNull()
  },
  (table) => [
    uniqueIndex("finance_payout_request_allocations_pk").on(
      table.payoutRequestId,
      table.payoutAllocationId
    ),
    uniqueIndex("finance_payout_request_allocations_pending_lot_unique").on(
      table.payoutPendingLotId
    ),
    check(
      "finance_payout_request_allocations_amount_check",
      sql`${table.amountMinor} > 0 and ${table.ordinal} >= 0`
    ),
    check(
      "finance_payout_request_allocations_identifier_check",
      sql`${canonicalPayoutIdentifierCheck(table.payoutRequestId)} and ${canonicalPayoutIdentifierCheck(table.payoutAllocationId)} and ${canonicalPayoutIdentifierCheck(table.sourceLotId)} and ${canonicalPayoutIdentifierCheck(table.payoutPendingLotId)}`
    )
  ]
);

/**
 * A paid manual payout is a money transition. The database rechecks the proof reference so a
 * direct SQL write cannot substitute an arbitrary document ID for the private KMS artifact that
 * was registered by the finance evidence boundary.
 */
export const financePayoutIntegritySql = `
create or replace function finance_validate_paid_payout_proof()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  proof finance_artifacts%rowtype;
begin
  if new.status <> 'paid' then
    if new.paid_proof_artifact_id is not null
       or new.paid_proof_artifact_digest is not null
       or new.paid_proof_artifact_byte_length is not null then
      raise exception 'non-paid payout cannot retain paid proof evidence' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.paid_proof_artifact_id is null
     or new.paid_proof_artifact_digest is null
     or new.paid_proof_artifact_byte_length is null then
    raise exception 'paid payout requires exact bank transfer proof evidence' using errcode = '23514';
  end if;

  select * into proof
  from finance_artifacts
  where id = new.paid_proof_artifact_id;

  if not found
     or proof.artifact_class <> 'bank_transfer_evidence'
     or proof.binding_kind <> 'bank_cash_pool'
     or proof.sha256_digest <> new.paid_proof_artifact_digest
     or proof.byte_length <> new.paid_proof_artifact_byte_length
     or exists (
       select 1
       from finance_artifact_tombstones tombstone
       where tombstone.artifact_id = proof.id
     ) then
    raise exception 'paid payout proof must reference one active exact bank transfer artifact'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger finance_validate_paid_payout_proof
before insert or update of status, paid_proof_artifact_id, paid_proof_artifact_digest,
  paid_proof_artifact_byte_length on payout_requests
for each row execute function finance_validate_paid_payout_proof();
`;
