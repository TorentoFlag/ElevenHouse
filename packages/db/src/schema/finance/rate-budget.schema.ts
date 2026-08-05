import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import {
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";
import { financeProviderAccounts } from "./provider-accounts.schema";

const arcPayRateBudgetClassValues = ["api_requests"] as const;
const arcPayRateBudgetDecisionValues = [
  "granted",
  "distributed_budget",
  "provider_retry_after"
] as const;

const exactTokenAmount = (name: string) =>
  numeric(name, { precision: 38, scale: 9, mode: "string" });

export const financeArcPayRateBudgets = pgTable(
  "finance_arc_pay_rate_budgets",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    budgetClass: text("budget_class").notNull(),
    requestsPerSecond: financeNumeric38String("requests_per_second").notNull(),
    burstCapacity: financeNumeric38String("burst_capacity").notNull(),
    availableTokens: exactTokenAmount("available_tokens").notNull(),
    notBefore: timestamp("not_before", { withTimezone: true }),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }).notNull(),
    revision: financeRevisionString("revision").notNull(),
    fence: financeRevisionString("fence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_arc_pay_rate_budgets_provider_identity_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_arc_pay_rate_budgets_exact_budget_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.budgetClass
    ),
    unique("finance_arc_pay_rate_budgets_exact_owner_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.budgetClass
    ),
    check(
      "finance_arc_pay_rate_budgets_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and ${table.budgetClass} in ${sql.raw(formatFinanceSqlValues(arcPayRateBudgetClassValues))}`
    ),
    check(
      "finance_arc_pay_rate_budgets_capacity_check",
      sql`${table.requestsPerSecond} = 10
        and ${table.burstCapacity} = 20
        and ${table.availableTokens} >= 0
        and ${table.availableTokens} <= ${table.burstCapacity}`
    ),
    check(
      "finance_arc_pay_rate_budgets_revision_time_check",
      sql`${table.revision} >= 1
        and ${table.fence} >= 0
        and ${table.lastRefillAt} >= ${table.createdAt}
        and ${table.updatedAt} >= ${table.lastRefillAt}`
    ),
    index("finance_arc_pay_rate_budgets_next_eligible_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.notBefore,
      table.budgetClass
    )
  ]
);

export const financeArcPayRateBudgetHistory = pgTable(
  "finance_arc_pay_rate_budget_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: varchar("budget_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    budgetClass: text("budget_class").notNull(),
    revisionFrom: financeRevisionString("revision_from").notNull(),
    revisionTo: financeRevisionString("revision_to").notNull(),
    fence: financeRevisionString("fence").notNull(),
    decision: text("decision").notNull(),
    cost: financeNumeric38String("cost").notNull(),
    availableTokensBefore: exactTokenAmount("available_tokens_before").notNull(),
    availableTokensAfter: exactTokenAmount("available_tokens_after").notNull(),
    notBeforeAfter: timestamp("not_before_after", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.budgetId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.budgetClass
      ],
      foreignColumns: [
        financeArcPayRateBudgets.id,
        financeArcPayRateBudgets.seriesId,
        financeArcPayRateBudgets.providerAccountId,
        financeArcPayRateBudgets.providerIdentityVersion,
        financeArcPayRateBudgets.budgetClass
      ],
      name: "finance_arc_pay_rate_budget_history_budget_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_arc_pay_rate_budget_history_revision_unique").on(
      table.budgetId,
      table.revisionTo
    ),
    check(
      "finance_arc_pay_rate_budget_history_transition_check",
      sql`${table.revisionFrom} >= 1
        and ${table.revisionTo} = ${table.revisionFrom} + 1
        and ${table.fence} >= 1
        and ${table.decision} in ${sql.raw(formatFinanceSqlValues(arcPayRateBudgetDecisionValues))}
        and ${table.cost} between 0 and 1
        and ${table.availableTokensBefore} between 0 and 20
        and ${table.availableTokensAfter} between 0 and 20
        and (
          (${table.decision} = 'provider_retry_after' and ${table.notBeforeAfter} is not null)
          or ${table.decision} in ('granted', 'distributed_budget')
        )`
    ),
    index("finance_arc_pay_rate_budget_history_time_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.occurredAt,
      table.revisionTo
    )
  ]
);

/** Baseline owner executes this reviewed DDL; adapters call only these DB-clock primitives. */
export const financeArcPayRateBudgetIntegritySql = `
create or replace function finance_reject_arc_pay_rate_budget_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'ArcPay rate budget evidence cannot be deleted' using errcode = '55000';
end;
$$;

create trigger finance_arc_pay_rate_budgets_no_delete before delete on finance_arc_pay_rate_budgets
for each row execute function finance_reject_arc_pay_rate_budget_mutation();
create trigger finance_arc_pay_rate_budgets_no_truncate before truncate on finance_arc_pay_rate_budgets
for each statement execute function finance_reject_arc_pay_rate_budget_mutation();
create trigger finance_arc_pay_rate_budget_history_immutable before update or delete on finance_arc_pay_rate_budget_history
for each row execute function finance_reject_arc_pay_rate_budget_mutation();
create trigger finance_arc_pay_rate_budget_history_no_truncate before truncate on finance_arc_pay_rate_budget_history
for each statement execute function finance_reject_arc_pay_rate_budget_mutation();

create or replace function finance_issue_arc_pay_rate_budget_history_time()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.occurred_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_arc_pay_rate_budget_history_issue_time
before insert on finance_arc_pay_rate_budget_history
for each row execute function finance_issue_arc_pay_rate_budget_history_time();

create or replace function finance_validate_arc_pay_rate_budget_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.last_refill_at := new.created_at;
    if new.revision <> 1 or new.fence <> 0 or new.available_tokens <> new.burst_capacity then
      raise exception 'ArcPay rate budget must start full at revision one and fence zero' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id <> old.id
     or new.series_id <> old.series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.budget_class <> old.budget_class
     or new.requests_per_second <> old.requests_per_second
     or new.burst_capacity <> old.burst_capacity
     or new.created_at <> old.created_at then
    raise exception 'ArcPay rate budget identity and configuration are immutable' using errcode = '55000';
  end if;
  if new.revision <> old.revision + 1 or new.fence <> old.fence + 1 then
    raise exception 'ArcPay rate budget revision or fence conflict' using errcode = '40001';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_validate_arc_pay_rate_budget_head
before insert or update on finance_arc_pay_rate_budgets
for each row execute function finance_validate_arc_pay_rate_budget_head();

create or replace function finance_require_arc_pay_rate_budget_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_arc_pay_rate_budget_history history
    where history.budget_id = new.id
      and history.revision_from = old.revision
      and history.revision_to = new.revision
      and history.fence = new.fence
      and history.available_tokens_after = new.available_tokens
      and history.not_before_after is not distinct from new.not_before
  ) then
    raise exception 'ArcPay rate budget mutation requires append-only history' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_arc_pay_rate_budget_history
after update on finance_arc_pay_rate_budgets
deferrable initially deferred
for each row execute function finance_require_arc_pay_rate_budget_history();

create or replace function finance_take_arc_pay_rate_budget(
  p_series_id varchar,
  p_provider_account_id varchar,
  p_provider_identity_version integer,
  p_budget_class text,
  p_cost numeric
)
returns table(granted boolean, retry_at timestamptz, issued_revision numeric, issued_fence numeric)
language plpgsql set search_path = pg_catalog, public as $$
declare
  current_budget finance_arc_pay_rate_budgets%rowtype;
  v_now timestamptz := clock_timestamp();
  refilled_tokens numeric(38, 9);
  remaining_tokens numeric(38, 9);
  next_not_before timestamptz;
  decision_code text;
begin
  if p_cost <> 1 then
    raise exception 'ArcPay distributed budget cost must be exactly one' using errcode = '23514';
  end if;
  select * into current_budget
    from finance_arc_pay_rate_budgets
    where series_id = p_series_id
      and provider_account_id = p_provider_account_id
      and provider_identity_version = p_provider_identity_version
      and budget_class = p_budget_class
    for update;
  if not found then
    raise exception 'exact ArcPay rate budget does not exist' using errcode = '23503';
  end if;

  refilled_tokens := least(
    current_budget.burst_capacity,
    current_budget.available_tokens
      + greatest(extract(epoch from (v_now - current_budget.last_refill_at)), 0)
        * current_budget.requests_per_second
  );
  next_not_before := case
    when current_budget.not_before is not null and current_budget.not_before > v_now
      then current_budget.not_before
    else null
  end;

  if next_not_before is not null then
    granted := false;
    retry_at := next_not_before;
    remaining_tokens := refilled_tokens;
    decision_code := 'provider_retry_after';
  elsif refilled_tokens >= p_cost then
    granted := true;
    retry_at := null;
    remaining_tokens := refilled_tokens - p_cost;
    decision_code := 'granted';
  else
    granted := false;
    retry_at := v_now
      + (((p_cost - refilled_tokens) / current_budget.requests_per_second)::double precision
        * interval '1 second');
    remaining_tokens := refilled_tokens;
    decision_code := 'distributed_budget';
  end if;

  update finance_arc_pay_rate_budgets
    set available_tokens = remaining_tokens,
        not_before = next_not_before,
        last_refill_at = v_now,
        revision = current_budget.revision + 1,
        fence = current_budget.fence + 1,
        updated_at = v_now
    where id = current_budget.id;

  issued_revision := current_budget.revision + 1;
  issued_fence := current_budget.fence + 1;
  insert into finance_arc_pay_rate_budget_history (
    budget_id, series_id, provider_account_id, provider_identity_version, budget_class,
    revision_from, revision_to, fence, decision, cost,
    available_tokens_before, available_tokens_after, not_before_after, occurred_at
  ) values (
    current_budget.id, current_budget.series_id, current_budget.provider_account_id,
    current_budget.provider_identity_version, current_budget.budget_class,
    current_budget.revision, issued_revision, issued_fence, decision_code, p_cost,
    refilled_tokens, remaining_tokens, next_not_before, v_now
  );
  return next;
end;
$$;

create or replace function finance_apply_arc_pay_rate_limit(
  p_series_id varchar,
  p_provider_account_id varchar,
  p_provider_identity_version integer,
  p_budget_class text,
  p_provider_not_before timestamptz
)
returns table(issued_not_before timestamptz, issued_revision numeric, issued_fence numeric)
language plpgsql set search_path = pg_catalog, public as $$
declare
  current_budget finance_arc_pay_rate_budgets%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_provider_not_before <= v_now then
    raise exception 'provider not-before must be in the future' using errcode = '23514';
  end if;
  select * into current_budget
    from finance_arc_pay_rate_budgets
    where series_id = p_series_id
      and provider_account_id = p_provider_account_id
      and provider_identity_version = p_provider_identity_version
      and budget_class = p_budget_class
    for update;
  if not found then
    raise exception 'exact ArcPay rate budget does not exist' using errcode = '23503';
  end if;

  issued_not_before := greatest(current_budget.not_before, p_provider_not_before);
  issued_revision := current_budget.revision + 1;
  issued_fence := current_budget.fence + 1;
  update finance_arc_pay_rate_budgets
    set not_before = issued_not_before,
        revision = issued_revision,
        fence = issued_fence,
        updated_at = v_now
    where id = current_budget.id;
  insert into finance_arc_pay_rate_budget_history (
    budget_id, series_id, provider_account_id, provider_identity_version, budget_class,
    revision_from, revision_to, fence, decision, cost,
    available_tokens_before, available_tokens_after, not_before_after, occurred_at
  ) values (
    current_budget.id, current_budget.series_id, current_budget.provider_account_id,
    current_budget.provider_identity_version, current_budget.budget_class,
    current_budget.revision, issued_revision, issued_fence, 'provider_retry_after', 0,
    current_budget.available_tokens, current_budget.available_tokens, issued_not_before, v_now
  );
  return next;
end;
$$;
`;
