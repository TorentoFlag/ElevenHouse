import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import {
  financeReadinessEvidenceRequirementValues,
  financeReadinessEvidenceStatusValues,
  financeRevisionString,
  financeTransactionCategoryValues,
  formatFinanceSqlValues
} from "./finance-values";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");
const legalRequirementCodes = sql.raw("('legal_accounting_client_purchase', 'legal_accounting_platform_subscription')");

/**
 * Versioned, non-sensitive enablement evidence for high-risk finance operations.
 * The record deliberately contains only a safe digest and external authority reference identity;
 * legal/accounting content and provider secrets remain outside the finance read model.
 */
export const financeReadinessEvidenceVersions = pgTable(
  "finance_readiness_evidence_versions",
  {
    evidenceId: varchar("evidence_id", { length: 160 }).notNull(),
    evidenceVersion: financeRevisionString("evidence_version").notNull(),
    requirementCode: text("requirement_code").notNull(),
    transactionCategory: text("transaction_category"),
    scopeKey: varchar("scope_key", { length: 240 }).notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    status: text("status").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    safeDigest: varchar("safe_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.evidenceId, table.evidenceVersion],
      name: "finance_readiness_evidence_versions_pk"
    }),
    uniqueIndex("finance_readiness_evidence_current_scope_unique")
      .on(table.scopeKey)
      .where(sql`${table.isCurrent} = true`),
    index("finance_readiness_evidence_current_lookup_idx").on(
      table.isCurrent,
      table.requirementCode,
      table.transactionCategory,
      table.effectiveAt
    ),
    check(
      "finance_readiness_evidence_identifier_check",
      sql`length(trim(${table.evidenceId})) between 1 and 160
        and ${table.evidenceId} = trim(${table.evidenceId})
        and ${table.evidenceId} !~ '[[:cntrl:]]'
        and length(trim(${table.scopeKey})) between 1 and 240
        and ${table.scopeKey} = trim(${table.scopeKey})
        and ${table.scopeKey} !~ '[[:cntrl:]]'
        and ${table.evidenceVersion} >= 1`
    ),
    check(
      "finance_readiness_evidence_requirement_check",
      sql`${table.requirementCode} in ${sql.raw(
        formatFinanceSqlValues(financeReadinessEvidenceRequirementValues)
      )}
        and ${table.status} in ${sql.raw(formatFinanceSqlValues(financeReadinessEvidenceStatusValues))}`
    ),
    check(
      "finance_readiness_evidence_scope_check",
      sql`${table.scopeKey} = ${table.requirementCode} || ':' || coalesce(${table.transactionCategory}, 'global')
        and (
          (${table.requirementCode} in ${legalRequirementCodes}
            and ${table.transactionCategory} in ${sql.raw(formatFinanceSqlValues(financeTransactionCategoryValues))})
          or (${table.requirementCode} not in ('legal_accounting_client_purchase', 'legal_accounting_platform_subscription')
            and ${table.transactionCategory} is null)
        )`
    ),
    check(
      "finance_readiness_evidence_effective_window_check",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`
    ),
    check(
      "finance_readiness_evidence_digest_check",
      sql`${table.safeDigest} ~ ${digestPattern}`
    )
  ]
);

/** Baseline owner executes this DDL after Drizzle creates the tables. */
export const financeReadinessEvidenceImmutabilitySql = `
create or replace function finance_protect_readiness_evidence_version()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance readiness evidence versions are append-only' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    perform 1 from finance_readiness_evidence_versions
      where evidence_id = new.evidence_id
      for update;
    if not found then
      if new.evidence_version <> 1 then
        raise exception 'readiness evidence version must start at one' using errcode = '23514';
      end if;
      return new;
    end if;
    if new.evidence_version <> (
      select max(evidence_version) + 1
      from finance_readiness_evidence_versions
      where evidence_id = new.evidence_id
    ) then
      raise exception 'readiness evidence version must advance by one' using errcode = '40001';
    end if;
    return new;
  end if;
  if new.evidence_id <> old.evidence_id
     or new.evidence_version <> old.evidence_version
     or new.requirement_code <> old.requirement_code
     or new.transaction_category is distinct from old.transaction_category
     or new.scope_key <> old.scope_key
     or new.status <> old.status
     or new.effective_at <> old.effective_at
     or new.expires_at is distinct from old.expires_at
     or new.safe_digest <> old.safe_digest
     or new.created_at <> old.created_at
     or old.is_current <> true
     or new.is_current <> false then
    raise exception 'readiness evidence may only retire a current version' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger finance_readiness_evidence_versions_immutable
before update or delete on finance_readiness_evidence_versions
for each row execute function finance_protect_readiness_evidence_version();
create trigger finance_readiness_evidence_versions_no_truncate
before truncate on finance_readiness_evidence_versions
for each statement execute function finance_protect_readiness_evidence_version();
`;
