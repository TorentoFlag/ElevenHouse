import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

import { formatFinanceSqlValues } from "./finance-values";

export const financeOperationResourcePolicyLifecycleValues = [
  "draft",
  "published",
  "retired"
] as const;
export const financeOperationResourcePolicyKindValues = [
  "tariff_publish",
  "fiscal_policy_publish",
  "risk_policy_publish",
  "client_checkout_prepare",
  "client_order_capture",
  "platform_card_setup_prepare",
  "platform_card_setup_execute",
  "platform_card_setup_complete_3ds_method",
  "platform_invoice_complete_3ds_method",
  "platform_invoice_charge",
  "platform_renewal_schedule",
  "refund_execute",
  "chargeback_record_provisional",
  "chargeback_principal_allocate",
  "payout_destination_reveal",
  "payout_destination_change",
  "payout_approve",
  "payout_start_processing",
  "payout_confirm_paid",
  "bank_snapshot_attest",
  "bank_statement_match",
  "ledger_correction"
] as const;

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * Server-owned resource limits for one finance operation. A published row is immutable and every
 * provider/bank command records the full resolved envelope, so later limit changes cannot alter
 * an in-flight operation's admissible payload.
 */
export const financeOperationResourcePolicyVersions = pgTable(
  "finance_operation_resource_policy_versions",
  {
    policyId: varchar("policy_id", { length: 160 }).notNull(),
    version: integer("version").notNull(),
    operationKind: text("operation_kind").notNull(),
    draftRevision: integer("draft_revision").notNull().default(1),
    lifecycle: text("lifecycle").notNull(),
    maximumRows: integer("maximum_rows").notNull(),
    maximumDecimalDigits: integer("maximum_decimal_digits").notNull(),
    maximumArtifactBytes: integer("maximum_artifact_bytes").notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [
    primaryKey({
      columns: [table.policyId, table.version],
      name: "finance_operation_resource_policy_versions_pk"
    }),
    unique("finance_operation_resource_policy_versions_exact_digest_unique").on(
      table.policyId,
      table.version,
      table.canonicalDigest
    ),
    uniqueIndex("finance_operation_resource_policy_versions_digest_unique").on(
      table.canonicalDigest
    ),
    uniqueIndex("finance_operation_resource_policy_one_published_operation_unique")
      .on(table.operationKind)
      .where(sql`${table.lifecycle} = 'published'`),
    index("finance_operation_resource_policy_lookup_idx").on(
      table.operationKind,
      table.lifecycle,
      table.version
    ),
    check(
      "finance_operation_resource_policy_versions_shape_check",
      sql`${table.lifecycle} in ${sql.raw(formatFinanceSqlValues(financeOperationResourcePolicyLifecycleValues))}
        and ${table.operationKind} in ${sql.raw(formatFinanceSqlValues(financeOperationResourcePolicyKindValues))}
        and length(trim(${table.policyId})) between 1 and 160
        and ${table.policyId} = trim(${table.policyId}) and ${table.policyId} !~ '[[:cntrl:]]'
        and ${table.version} >= 1 and ${table.draftRevision} >= 1
        and ${table.maximumRows} >= 1 and ${table.maximumDecimalDigits} between 1 and 38
        and ${table.maximumArtifactBytes} >= 1
        and ${table.canonicalDigest} ~ ${digestPattern}
        and length(${table.canonicalPreimage}) between 1 and 32000
        and ((${table.lifecycle} = 'draft' and ${table.publishedAt} is null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'published' and ${table.publishedAt} is not null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'retired' and ${table.publishedAt} is not null and ${table.retiredAt} is not null))`
    )
  ]
);

/** Installed with the baseline so drafts remain editable while published terms stay append-only. */
export const financeOperationResourcePolicyIntegritySql = `
create or replace function finance_reject_sealed_operation_resource_policy_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' and old.lifecycle in ('published', 'retired') then
    raise exception 'published operation resource policy is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'retired' then
    raise exception 'published operation resource policy is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'published' and not (
    new.lifecycle = 'retired' and new.retired_at is not null
    and new.policy_id = old.policy_id and new.version = old.version
    and new.operation_kind = old.operation_kind and new.draft_revision = old.draft_revision
    and new.maximum_rows = old.maximum_rows and new.maximum_decimal_digits = old.maximum_decimal_digits
    and new.maximum_artifact_bytes = old.maximum_artifact_bytes
    and new.canonical_preimage = old.canonical_preimage and new.canonical_digest = old.canonical_digest
    and new.created_at = old.created_at and new.published_at = old.published_at
  ) then
    raise exception 'published operation resource policy is immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger finance_operation_resource_policy_versions_sealed_immutable
before update or delete on finance_operation_resource_policy_versions
for each row execute function finance_reject_sealed_operation_resource_policy_mutation();
create or replace function finance_reject_operation_resource_policy_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'operation resource policy versions cannot be truncated' using errcode = '55000';
end;
$$;
create trigger finance_operation_resource_policy_versions_no_truncate
before truncate on finance_operation_resource_policy_versions
for each statement execute function finance_reject_operation_resource_policy_truncate();
`;
