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

export const financeSavedCardDisclosureLifecycleValues = ["draft", "published", "retired"] as const;
const localeValues = ["ru", "en"] as const;
const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/** Legal-controlled text served before saved-card consent. No provider request may use an unsealed draft. */
export const financeSavedCardDisclosureVersions = pgTable(
  "finance_saved_card_disclosure_versions",
  {
    disclosureSeriesId: varchar("disclosure_series_id", { length: 160 }).notNull(),
    version: integer("version").notNull(),
    locale: varchar("locale", { length: 8 }).notNull(),
    draftRevision: integer("draft_revision").notNull().default(1),
    lifecycle: text("lifecycle").notNull(),
    body: text("body").notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [
    primaryKey({
      columns: [table.disclosureSeriesId, table.version, table.locale],
      name: "finance_saved_card_disclosure_versions_pk"
    }),
    unique("finance_saved_card_disclosure_versions_exact_digest_unique").on(
      table.disclosureSeriesId,
      table.version,
      table.locale,
      table.canonicalDigest
    ),
    uniqueIndex("finance_saved_card_disclosure_versions_published_locale_unique")
      .on(table.disclosureSeriesId, table.locale)
      .where(sql`${table.lifecycle} = 'published'`),
    index("finance_saved_card_disclosure_versions_lookup_idx").on(
      table.disclosureSeriesId,
      table.locale,
      table.lifecycle,
      table.version
    ),
    check(
      "finance_saved_card_disclosure_versions_shape_check",
      sql`${table.lifecycle} in ${sql.raw(formatFinanceSqlValues(financeSavedCardDisclosureLifecycleValues))}
        and ${table.locale} in ${sql.raw(formatFinanceSqlValues(localeValues))}
        and ${table.version} >= 1 and ${table.draftRevision} >= 1
        and length(trim(${table.disclosureSeriesId})) between 1 and 160
        and ${table.disclosureSeriesId} = trim(${table.disclosureSeriesId})
        and ${table.disclosureSeriesId} !~ '[[:cntrl:]]'
        and length(trim(${table.body})) between 1 and 50000
        and length(${table.canonicalPreimage}) between 1 and 100000
        and ${table.canonicalDigest} ~ ${digestPattern}
        and ((${table.lifecycle} = 'draft' and ${table.publishedAt} is null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'published' and ${table.publishedAt} is not null and ${table.retiredAt} is null)
          or (${table.lifecycle} = 'retired' and ${table.publishedAt} is not null and ${table.retiredAt} is not null))`
    )
  ]
);

export const financeSavedCardDisclosureIntegritySql = `
create or replace function finance_reject_sealed_saved_card_disclosure_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' and old.lifecycle in ('published', 'retired') then
    raise exception 'published saved-card disclosure is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'retired' then
    raise exception 'published saved-card disclosure is immutable' using errcode = '55000';
  end if;
  if old.lifecycle = 'published' and not (
    new.lifecycle = 'retired' and new.retired_at is not null
    and new.disclosure_series_id = old.disclosure_series_id and new.version = old.version
    and new.locale = old.locale and new.draft_revision = old.draft_revision
    and new.body = old.body and new.canonical_preimage = old.canonical_preimage
    and new.canonical_digest = old.canonical_digest and new.created_at = old.created_at
    and new.published_at = old.published_at
  ) then
    raise exception 'published saved-card disclosure is immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger finance_saved_card_disclosure_versions_sealed_immutable
before update or delete on finance_saved_card_disclosure_versions
for each row execute function finance_reject_sealed_saved_card_disclosure_mutation();
create or replace function finance_reject_saved_card_disclosure_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'saved-card disclosure versions cannot be truncated' using errcode = '55000';
end;
$$;
create trigger finance_saved_card_disclosure_versions_no_truncate
before truncate on finance_saved_card_disclosure_versions
for each statement execute function finance_reject_saved_card_disclosure_truncate();
`;
