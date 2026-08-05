import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { financeCanonicalJsonV1Sql } from "./canonical-json.sql";
import {
  financeNumeric38String,
  financeRevisionString,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  riskTierValues
} from "./finance-values";

const digestSqlPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");
const safeIntegerMaximumSql = sql.raw(String(financeSafeIntegerMinorUnitMax));

export const financeOrderEconomicsSnapshots = pgTable(
  "finance_order_economics_snapshots",
  {
    orderId: varchar("order_id", { length: 200 }).primaryKey(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: varchar("plan_id", { length: 200 }).notNull(),
    planVersionId: varchar("plan_version_id", { length: 200 }).notNull(),
    grossAmountMinor: financeNumeric38String("gross_amount_minor").notNull(),
    grossCurrency: text("gross_currency").notNull(),
    commissionAmountMinor: financeNumeric38String("commission_amount_minor").notNull(),
    commissionCurrency: text("commission_currency").notNull(),
    payableAmountMinor: financeNumeric38String("payable_amount_minor").notNull(),
    payableCurrency: text("payable_currency").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    allocationRevision: text("allocation_revision").notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistedAt: timestamp("persisted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_order_economics_snapshots_exact_owner_unique").on(
      table.orderId,
      table.canonicalDigest
    ),
    check(
      "finance_order_economics_snapshots_identifier_check",
      identifierCheck(table.orderId, table.planId, table.planVersionId)
    ),
    check(
      "finance_order_economics_snapshots_money_check",
      sql`${table.grossAmountMinor} > 0
        and ${table.grossAmountMinor} <= ${safeIntegerMaximumSql}
        and ${table.commissionAmountMinor} >= 0
        and ${table.commissionAmountMinor} <= ${safeIntegerMaximumSql}
        and ${table.payableAmountMinor} >= 0
        and ${table.payableAmountMinor} <= ${safeIntegerMaximumSql}
        and ${table.grossCurrency} = 'RUB'
        and ${table.commissionCurrency} = ${table.grossCurrency}
        and ${table.payableCurrency} = ${table.grossCurrency}`
    ),
    check(
      "finance_order_economics_snapshots_allocation_check",
      sql`${table.commissionBps} between 0 and 10000
        and ${table.allocationRevision} = 'bps_half_up_v1'
        and ${table.grossAmountMinor} = ${table.commissionAmountMinor} + ${table.payableAmountMinor}
        and ${table.commissionAmountMinor} = floor(
          (${table.grossAmountMinor} * ${table.commissionBps} + 5000) / 10000
        )`
    ),
    check(
      "finance_order_economics_snapshots_digest_check",
      sql`${table.canonicalDigest} ~ ${digestSqlPattern}
        and length(${table.canonicalPreimage}) between 1 and 8000`
    )
  ]
);

export const financeRiskPolicyVersions = pgTable(
  "finance_risk_policy_versions",
  {
    policyId: varchar("policy_id", { length: 160 }).notNull(),
    policyVersion: financeRevisionString("policy_version").notNull(),
    effectiveRiskTier: text("effective_risk_tier").notNull(),
    holdAnchor: text("hold_anchor").notNull(),
    holdDurationHours: integer("hold_duration_hours").notNull(),
    reserveBps: integer("reserve_bps").notNull(),
    reserveReleaseDelayDays: integer("reserve_release_delay_days").notNull(),
    providerSettlementRequired: boolean("provider_settlement_required").notNull(),
    payoutMinimumAmountMinor: financeNumeric38String("payout_minimum_amount_minor").notNull(),
    payoutMinimumCurrency: text("payout_minimum_currency").notNull(),
    exceptionAuthorityId: varchar("exception_authority_id", { length: 200 }),
    exceptionAuthorityVersion: financeRevisionString("exception_authority_version"),
    effectiveAt: varchar("effective_at", { length: 40 }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistedAt: timestamp("persisted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "finance_risk_policy_versions_pk",
      columns: [table.policyId, table.policyVersion]
    }),
    unique("finance_risk_policy_versions_exact_owner_unique").on(
      table.policyId,
      table.policyVersion,
      table.canonicalDigest
    ),
    check("finance_risk_policy_versions_identifier_check", identifierCheck(table.policyId)),
    check(
      "finance_risk_policy_versions_shape_check",
      sql`${table.policyVersion} between 1 and ${safeIntegerMaximumSql}
        and ${table.effectiveRiskTier} in ${sql.raw(formatFinanceSqlValues(riskTierValues))}
        and ${table.holdAnchor} = 'booking_completed'
        and ${table.holdDurationHours} between 0 and 4320
        and ${table.reserveBps} between 0 and 10000
        and ${table.reserveReleaseDelayDays} between 0 and 540
        and ${table.payoutMinimumAmountMinor} between 0 and ${safeIntegerMaximumSql}
        and ${table.payoutMinimumCurrency} = 'RUB'
        and ${table.effectiveAt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$'
        and ${table.effectiveAt}::timestamptz is not null`
    ),
    check(
      "finance_risk_policy_versions_exception_authority_check",
      sql`(
          ${table.exceptionAuthorityId} is null
          and ${table.exceptionAuthorityVersion} is null
        ) or (
          ${table.exceptionAuthorityId} is not null
          and ${table.exceptionAuthorityVersion} between 1 and ${safeIntegerMaximumSql}
          and ${nullableIdentifierCheck(table.exceptionAuthorityId)}
        )`
    ),
    check(
      "finance_risk_policy_versions_digest_check",
      sql`${table.canonicalDigest} ~ ${digestSqlPattern}
        and length(${table.canonicalPreimage}) between 1 and 8000`
    )
  ]
);

export const financePaidProductFulfillmentDecisions = pgTable(
  "finance_paid_product_fulfillment_decisions",
  {
    supported: boolean("supported").notNull(),
    registryKey: varchar("registry_key", { length: 200 }).notNull(),
    registryRevision: financeRevisionString("registry_revision").notNull(),
    holdAnchor: text("hold_anchor").notNull(),
    terminalEvidenceOwner: text("terminal_evidence_owner").notNull(),
    terminalEvidenceStatus: text("terminal_evidence_status").notNull(),
    terminalEvidenceContractVersion: financeRevisionString(
      "terminal_evidence_contract_version"
    ).notNull(),
    cancellationAllocatorOwner: text("cancellation_allocator_owner").notNull(),
    cancellationAllocatorPort: text("cancellation_allocator_port").notNull(),
    cancellationAllocatorPolicyVersion: financeRevisionString(
      "cancellation_allocator_policy_version"
    ).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistedAt: timestamp("persisted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "finance_paid_product_fulfillment_decisions_pk",
      columns: [table.registryKey, table.registryRevision]
    }),
    unique("finance_paid_product_fulfillment_exact_owner_unique").on(
      table.registryKey,
      table.registryRevision,
      table.canonicalDigest
    ),
    check("finance_paid_product_fulfillment_identifier_check", identifierCheck(table.registryKey)),
    check(
      "finance_paid_product_fulfillment_supported_shape_check",
      sql`${table.supported} = true
        and ${table.registryRevision} between 1 and ${safeIntegerMaximumSql}
        and ${table.holdAnchor} = 'booking_completed'
        and ${table.terminalEvidenceOwner} = 'booking'
        and ${table.terminalEvidenceStatus} = 'completed'
        and ${table.terminalEvidenceContractVersion} between 1 and ${safeIntegerMaximumSql}
        and ${table.cancellationAllocatorOwner} = 'booking'
        and ${table.cancellationAllocatorPort} = 'BookingCancellationRefundDecisionPort'
        and ${table.cancellationAllocatorPolicyVersion} between 1 and ${safeIntegerMaximumSql}`
    ),
    check(
      "finance_paid_product_fulfillment_digest_check",
      sql`${table.canonicalDigest} ~ ${digestSqlPattern}
        and length(${table.canonicalPreimage}) between 1 and 8000`
    )
  ]
);

export const financeCaptureAuthoritiesIntegritySql = `
${financeCanonicalJsonV1Sql}

create or replace function finance_issue_capture_authority_snapshot()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  snapshot_value jsonb;
  issued_preimage text;
  issued_digest text;
begin
  if tg_table_name = 'finance_order_economics_snapshots' then
    snapshot_value := jsonb_build_object(
      'orderId', new.order_id,
      'astrologerUserId', new.astrologer_user_id,
      'planId', new.plan_id,
      'planVersionId', new.plan_version_id,
      'gross', jsonb_build_object(
        'amountMinor', new.gross_amount_minor,
        'currency', new.gross_currency
      ),
      'commission', jsonb_build_object(
        'amountMinor', new.commission_amount_minor,
        'currency', new.commission_currency
      ),
      'payable', jsonb_build_object(
        'amountMinor', new.payable_amount_minor,
        'currency', new.payable_currency
      ),
      'commissionBps', new.commission_bps,
      'allocationRevision', new.allocation_revision
    );
  elsif tg_table_name = 'finance_risk_policy_versions' then
    snapshot_value := jsonb_build_object(
      'id', new.policy_id,
      'policyVersion', new.policy_version,
      'effectiveRiskTier', new.effective_risk_tier,
      'holdAnchor', new.hold_anchor,
      'holdDurationHours', new.hold_duration_hours,
      'reserveBps', new.reserve_bps,
      'reserveReleaseDelayDays', new.reserve_release_delay_days,
      'providerSettlementRequired', new.provider_settlement_required,
      'payoutMinimum', jsonb_build_object(
        'amountMinor', new.payout_minimum_amount_minor,
        'currency', new.payout_minimum_currency
      ),
      'exceptionAuthority', case
        when new.exception_authority_id is null then 'null'::jsonb
        else jsonb_build_object(
          'id', new.exception_authority_id,
          'version', new.exception_authority_version
        )
      end,
      'effectiveAt', new.effective_at
    );
  elsif tg_table_name = 'finance_paid_product_fulfillment_decisions' then
    snapshot_value := jsonb_build_object(
      'supported', new.supported,
      'registryKey', new.registry_key,
      'registryRevision', new.registry_revision,
      'holdAnchor', new.hold_anchor,
      'terminalEvidence', jsonb_build_object(
        'owner', new.terminal_evidence_owner,
        'status', new.terminal_evidence_status,
        'contractVersion', new.terminal_evidence_contract_version
      ),
      'cancellationAllocator', jsonb_build_object(
        'owner', new.cancellation_allocator_owner,
        'port', new.cancellation_allocator_port,
        'policyVersion', new.cancellation_allocator_policy_version
      )
    );
  else
    raise exception 'unsupported capture authority snapshot table' using errcode = '55000';
  end if;

  issued_preimage := finance_canonical_jsonb_v1(snapshot_value);
  issued_digest := 'sha256:' || encode(
    digest(convert_to(issued_preimage, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.canonical_digest <> '' and new.canonical_digest <> issued_digest then
    raise exception 'canonical snapshot digest does not match scalar fields'
      using errcode = '23514';
  end if;
  new.canonical_preimage := issued_preimage;
  new.canonical_digest := issued_digest;
  new.persisted_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_order_economics_snapshots_00_issue_authority
before insert on finance_order_economics_snapshots
for each row execute function finance_issue_capture_authority_snapshot();
create trigger finance_risk_policy_versions_00_issue_authority
before insert on finance_risk_policy_versions
for each row execute function finance_issue_capture_authority_snapshot();
create trigger finance_paid_product_fulfillment_decisions_00_issue_authority
before insert on finance_paid_product_fulfillment_decisions
for each row execute function finance_issue_capture_authority_snapshot();

create or replace function finance_reject_capture_authority_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'capture authority snapshots are immutable' using errcode = '55000';
end;
$$;

create trigger finance_order_economics_snapshots_immutable
before update or delete on finance_order_economics_snapshots
for each row execute function finance_reject_capture_authority_mutation();
create trigger finance_order_economics_snapshots_no_truncate
before truncate on finance_order_economics_snapshots
for each statement execute function finance_reject_capture_authority_mutation();

create trigger finance_risk_policy_versions_immutable
before update or delete on finance_risk_policy_versions
for each row execute function finance_reject_capture_authority_mutation();
create trigger finance_risk_policy_versions_no_truncate
before truncate on finance_risk_policy_versions
for each statement execute function finance_reject_capture_authority_mutation();

create trigger finance_paid_product_fulfillment_decisions_immutable
before update or delete on finance_paid_product_fulfillment_decisions
for each row execute function finance_reject_capture_authority_mutation();
create trigger finance_paid_product_fulfillment_decisions_no_truncate
before truncate on finance_paid_product_fulfillment_decisions
for each statement execute function finance_reject_capture_authority_mutation();
`;

function identifierCheck(...columns: SQLWrapper[]): SQL {
  return sql.join(
    columns.map(
      (column) =>
        sql`length(${column}) between 1 and 200
          and btrim(${column}) = ${column}
          and ${column} !~ '[[:cntrl:]]'`
    ),
    sql` and `
  );
}

function nullableIdentifierCheck(column: SQLWrapper): SQL {
  return sql`(${column} is null or (${identifierCheck(column)}))`;
}
