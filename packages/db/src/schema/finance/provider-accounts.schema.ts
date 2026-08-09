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
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import {
  financePaymentProviderValues,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";

export const financeProviderAccountSeries = pgTable(
  "finance_provider_account_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    provider: text("provider").notNull(),
    activeIdentityVersion: integer("active_identity_version").notNull(),
    headVersion: financeRevisionString("head_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("finance_provider_account_series_series_id_unique").on(table.seriesId),
    unique("finance_provider_account_series_series_provider_unique").on(
      table.seriesId,
      table.provider
    ),
    check(
      "finance_provider_account_series_provider_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}`
    ),
    check(
      "finance_provider_account_series_identifier_check",
      sql`length(trim(${table.seriesId})) between 1 and 160
        and ${table.seriesId} = trim(${table.seriesId})
        and ${table.seriesId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_provider_account_series_active_identity_version_check",
      sql`${table.activeIdentityVersion} >= 1`
    ),
    check("finance_provider_account_series_head_version_check", sql`${table.headVersion} >= 1`),
    index("finance_provider_account_series_active_head_idx").on(
      table.seriesId,
      table.activeIdentityVersion
    )
  ]
);

export const financeProviderAccounts = pgTable(
  "finance_provider_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    identityVersion: integer("identity_version").notNull(),
    provider: text("provider").notNull(),
    merchantTenantId: varchar("merchant_tenant_id", { length: 160 }).notNull(),
    terminalScope: varchar("terminal_scope", { length: 160 }).notNull(),
    settlementScope: varchar("settlement_scope", { length: 160 }).notNull(),
    predecessorProviderAccountId: varchar("predecessor_provider_account_id", { length: 160 }),
    predecessorIdentityVersion: integer("predecessor_identity_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.seriesId, table.provider],
      foreignColumns: [
        financeProviderAccountSeries.seriesId,
        financeProviderAccountSeries.provider
      ],
      name: "finance_provider_accounts_series_provider_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.seriesId,
        table.predecessorProviderAccountId,
        table.predecessorIdentityVersion
      ],
      foreignColumns: [table.seriesId, table.providerAccountId, table.identityVersion],
      name: "finance_provider_accounts_predecessor_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_provider_accounts_provider_account_id_unique").on(table.providerAccountId),
    uniqueIndex("finance_provider_accounts_series_version_unique").on(
      table.seriesId,
      table.identityVersion
    ),
    unique("finance_provider_accounts_exact_identity_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.identityVersion
    ),
    unique("finance_provider_accounts_resolved_exact_identity_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.identityVersion
    ),
    check(
      "finance_provider_accounts_provider_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}`
    ),
    check(
      "finance_provider_accounts_identifier_check",
      sql`length(trim(${table.seriesId})) between 1 and 160
        and ${table.seriesId} = trim(${table.seriesId})
        and ${table.seriesId} !~ '[[:cntrl:]]'
        and length(trim(${table.providerAccountId})) between 1 and 160
        and ${table.providerAccountId} = trim(${table.providerAccountId})
        and ${table.providerAccountId} !~ '[[:cntrl:]]'
        and length(trim(${table.merchantTenantId})) between 1 and 160
        and ${table.merchantTenantId} = trim(${table.merchantTenantId})
        and ${table.merchantTenantId} !~ '[[:cntrl:]]'
        and length(trim(${table.terminalScope})) between 1 and 160
        and ${table.terminalScope} = trim(${table.terminalScope})
        and ${table.terminalScope} !~ '[[:cntrl:]]'
        and length(trim(${table.settlementScope})) between 1 and 160
        and ${table.settlementScope} = trim(${table.settlementScope})
        and ${table.settlementScope} !~ '[[:cntrl:]]'
        and (
          ${table.predecessorProviderAccountId} is null
          or (
            length(trim(${table.predecessorProviderAccountId})) between 1 and 160
            and ${table.predecessorProviderAccountId} = trim(${table.predecessorProviderAccountId})
            and ${table.predecessorProviderAccountId} !~ '[[:cntrl:]]'
          )
        )`
    ),
    check("finance_provider_accounts_identity_version_check", sql`${table.identityVersion} >= 1`),
    check(
      "finance_provider_accounts_predecessor_check",
      sql`(
        ${table.identityVersion} = 1
        and ${table.predecessorProviderAccountId} is null
        and ${table.predecessorIdentityVersion} is null
      ) or (
        ${table.identityVersion} > 1
        and ${table.predecessorProviderAccountId} is not null
        and ${table.predecessorIdentityVersion} = ${table.identityVersion} - 1
        and ${table.predecessorProviderAccountId} <> ${table.providerAccountId}
      )`
    ),
    index("finance_provider_accounts_readiness_lookup_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.identityVersion
    )
  ]
);

/** Baseline owner executes this DDL after Drizzle creates the tables. */
export const financeProviderIdentityImmutabilitySql = `
create or replace function finance_reject_provider_identity_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'finance provider identity rows are immutable' using errcode = '55000';
end;
$$;

create trigger finance_provider_accounts_immutable_update_delete
before update or delete on finance_provider_accounts
for each row execute function finance_reject_provider_identity_mutation();

create trigger finance_provider_accounts_immutable_truncate
before truncate on finance_provider_accounts
for each statement execute function finance_reject_provider_identity_mutation();

create or replace function finance_protect_provider_series_identity()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance provider account series cannot be deleted' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    if new.active_identity_version <> 1 or new.head_version <> 1 then
      raise exception 'finance provider account series must start at version one' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id <> old.id
     or new.series_id <> old.series_id
     or new.provider <> old.provider
     or new.created_at <> old.created_at then
    raise exception 'finance provider account series identity is immutable' using errcode = '55000';
  end if;
  if new.active_identity_version <> old.active_identity_version + 1
     or new.head_version <> old.head_version + 1 then
    raise exception 'finance provider account series head must advance by one' using errcode = '40001';
  end if;
  return new;
end;
$$;

create trigger finance_provider_account_series_protected_insert_update_delete
before insert or update or delete on finance_provider_account_series
for each row execute function finance_protect_provider_series_identity();

create trigger finance_provider_account_series_immutable_truncate
before truncate on finance_provider_account_series
for each statement execute function finance_reject_provider_identity_mutation();

create or replace function finance_require_provider_series_active_account()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_provider_accounts account
    where account.series_id = new.series_id
      and account.identity_version = new.active_identity_version
      and account.provider = new.provider
  ) then
    raise exception 'provider account series head must resolve to an exact account' using errcode = '23503';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_provider_series_active_account
after insert or update on finance_provider_account_series
deferrable initially deferred
for each row execute function finance_require_provider_series_active_account();

create or replace function finance_require_provider_account_is_series_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_provider_account_series series
    where series.series_id = new.series_id
      and series.provider = new.provider
      and series.active_identity_version = new.identity_version
  ) then
    raise exception 'new provider account must be the committed series head' using errcode = '23503';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_provider_account_is_series_head
after insert on finance_provider_accounts
deferrable initially deferred
for each row execute function finance_require_provider_account_is_series_head();
`;
