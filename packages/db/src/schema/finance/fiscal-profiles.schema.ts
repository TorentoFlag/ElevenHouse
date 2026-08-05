import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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

export const financeFiscalProfileLifecycleValues = ["draft", "published", "retired"] as const;
export const financeFiscalVatRateValues = [
  "no_vat",
  "vat0",
  "vat10",
  "vat110",
  "vat20",
  "vat120"
] as const;
const transactionCategoryValues = ["client_purchase", "platform_subscription"] as const;
const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/** Stable identity: accounting terms are sealed in an immutable published version. */
export const financeFiscalProfileSeries = pgTable(
  "finance_fiscal_profile_series",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    transactionCategory: text("transaction_category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("finance_fiscal_profile_series_active_category_unique")
      .on(table.transactionCategory)
      .where(sql`${table.retiredAt} is null`),
    check(
      "finance_fiscal_profile_series_shape_check",
      sql`${table.transactionCategory} in ${sql.raw(formatFinanceSqlValues(transactionCategoryValues))}
        and length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id}) and ${table.id} !~ '[[:cntrl:]]'`
    )
  ]
);

/**
 * Values required by ArcPay embedded fiscalization. There are intentionally no defaults: admin
 * must submit the accounting-approved profile before it can be published.
 */
export const financeFiscalProfileVersions = pgTable(
  "finance_fiscal_profile_versions",
  {
    profileSeriesId: varchar("profile_series_id", { length: 160 }).notNull(),
    version: integer("version").notNull(),
    draftRevision: integer("draft_revision").notNull().default(1),
    lifecycle: text("lifecycle").notNull(),
    currency: text("currency").notNull(),
    fiscalizationProvider: text("fiscalization_provider").notNull(),
    merchantTaxId: varchar("merchant_tax_id", { length: 12 }).notNull(),
    buyerContactRequirement: text("buyer_contact_requirement").notNull(),
    vatRate: text("vat_rate").notNull(),
    paymentObject: varchar("payment_object", { length: 128 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 128 }).notNull(),
    measure: varchar("measure", { length: 128 }).notNull(),
    itemCode: varchar("item_code", { length: 128 }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [
    primaryKey({
      columns: [table.profileSeriesId, table.version],
      name: "finance_fiscal_profile_versions_pk"
    }),
    unique("finance_fiscal_profile_versions_exact_digest_unique").on(
      table.profileSeriesId,
      table.version,
      table.canonicalDigest
    ),
    foreignKey({
      columns: [table.profileSeriesId],
      foreignColumns: [financeFiscalProfileSeries.id],
      name: "finance_fiscal_profile_versions_series_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_fiscal_profile_versions_digest_unique").on(table.canonicalDigest),
    check(
      "finance_fiscal_profile_versions_shape_check",
      sql`${table.lifecycle} in ${sql.raw(formatFinanceSqlValues(financeFiscalProfileLifecycleValues))}
        and ${table.currency} = 'RUB' and ${table.fiscalizationProvider} = 'arc_pay_embedded'
        and ${table.version} >= 1 and ${table.draftRevision} >= 1
        and ${table.merchantTaxId} ~ '^(\\d{10}|\\d{12})$'
        and ${table.buyerContactRequirement} = 'email_or_phone'
        and ${table.vatRate} in ${sql.raw(formatFinanceSqlValues(financeFiscalVatRateValues))}
        and length(trim(${table.paymentObject})) between 1 and 128
        and length(trim(${table.paymentMethod})) between 1 and 128
        and length(trim(${table.measure})) between 1 and 128
        and length(trim(${table.itemCode})) between 1 and 128
        and ${table.canonicalDigest} ~ ${digestPattern}
        and length(${table.canonicalPreimage}) between 1 and 32000
        and ((${table.lifecycle} = 'draft' and ${table.publishedAt} is null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'published' and ${table.publishedAt} is not null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'retired' and ${table.publishedAt} is not null and ${table.retiredAt} is not null))`
    ),
    index("finance_fiscal_profile_versions_lookup_idx").on(
      table.profileSeriesId,
      table.lifecycle,
      table.version
    )
  ]
);

/** Baseline owner installs this after the profile tables, so legal/accounting evidence cannot be rewritten. */
export const financeFiscalProfileIntegritySql = `
create or replace function finance_reject_fiscal_profile_series_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'fiscal profile series identity is immutable' using errcode = '55000';
  end if;
  if old.retired_at is not null or new.id <> old.id
    or new.transaction_category <> old.transaction_category
    or new.created_at <> old.created_at
    or new.retired_at is null then
    raise exception 'fiscal profile series identity is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger finance_fiscal_profile_series_identity_immutable
before update or delete on finance_fiscal_profile_series
for each row execute function finance_reject_fiscal_profile_series_mutation();
create or replace function finance_reject_fiscal_profile_series_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'fiscal profile series cannot be truncated' using errcode = '55000';
end;
$$;
create trigger finance_fiscal_profile_series_no_truncate
before truncate on finance_fiscal_profile_series
for each statement execute function finance_reject_fiscal_profile_series_truncate();
create or replace function finance_reject_sealed_fiscal_profile_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' and old.lifecycle in ('published', 'retired') then
    raise exception 'published fiscal profile version is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'retired' then
    raise exception 'published fiscal profile version is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'published' and not (
    new.lifecycle = 'retired' and new.retired_at is not null
    and new.profile_series_id = old.profile_series_id and new.version = old.version
    and new.draft_revision = old.draft_revision and new.currency = old.currency
    and new.fiscalization_provider = old.fiscalization_provider
    and new.merchant_tax_id = old.merchant_tax_id
    and new.buyer_contact_requirement = old.buyer_contact_requirement
    and new.vat_rate = old.vat_rate and new.payment_object = old.payment_object
    and new.payment_method = old.payment_method and new.measure = old.measure
    and new.item_code = old.item_code and new.canonical_preimage = old.canonical_preimage
    and new.canonical_digest = old.canonical_digest and new.created_at = old.created_at
    and new.published_at = old.published_at
  ) then
    raise exception 'published fiscal profile version is immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger finance_fiscal_profile_versions_sealed_immutable
before update or delete on finance_fiscal_profile_versions
for each row execute function finance_reject_sealed_fiscal_profile_mutation();
create or replace function finance_reject_fiscal_profile_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'fiscal profile versions cannot be truncated' using errcode = '55000';
end;
$$;
create trigger finance_fiscal_profile_versions_no_truncate
before truncate on finance_fiscal_profile_versions
for each statement execute function finance_reject_fiscal_profile_truncate();
`;
