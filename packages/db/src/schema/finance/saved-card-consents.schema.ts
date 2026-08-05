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
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { platformTariffSubscriptions } from "../platform-billing/tariff-authority.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";
import { financeSavedCardDisclosureVersions } from "./saved-card-disclosures.schema";
import { financeRevisionString, formatFinanceSqlValues } from "./finance-values";

const consentScopeValues = ["platform_tariff_saved_card_and_recurring_charge"] as const;
const noticeLocaleValues = ["ru", "en"] as const;
const consentLifecycleValues = ["granted", "revoked"] as const;
const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * Evidence that an astrologer accepted a particular paid tariff, its saved-card binding and
 * future recurring charges. The notice itself is retained by the approved legal configuration;
 * this row stores the exact served-content digest, never a mutable legal-text pointer.
 */
export const financeSavedCardConsents = pgTable(
  "finance_saved_card_consents",
  {
    consentId: varchar("consent_id", { length: 160 }).notNull(),
    consentVersion: financeRevisionString("consent_version").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    tariffSeriesId: varchar("tariff_series_id", { length: 160 }).notNull(),
    tariffVersion: integer("tariff_version").notNull(),
    tariffVersionDigest: varchar("tariff_version_digest", { length: 71 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerCustomerId: varchar("provider_customer_id", { length: 160 }).notNull(),
    /** Immutable, explicit fiscal receipt contact chosen by the owner; never emitted from public APIs. */
    buyerContactKind: text("buyer_contact_kind").notNull(),
    buyerContactValue: varchar("buyer_contact_value", { length: 254 }).notNull(),
    consentScope: text("consent_scope").notNull(),
    noticeLocale: varchar("notice_locale", { length: 8 }).notNull(),
    disclosureSeriesId: varchar("disclosure_series_id", { length: 160 }).notNull(),
    disclosureVersion: integer("disclosure_version").notNull(),
    disclosureDigest: varchar("disclosure_digest", { length: 71 }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.consentId, table.consentVersion],
      name: "finance_saved_card_consents_pk"
    }),
    foreignKey({
      columns: [
        table.subscriptionId,
        table.ownerUserId,
        table.tariffSeriesId,
        table.tariffVersion,
        table.tariffVersionDigest
      ],
      foreignColumns: [
        platformTariffSubscriptions.id,
        platformTariffSubscriptions.ownerUserId,
        platformTariffSubscriptions.tariffSeriesId,
        platformTariffSubscriptions.tariffVersion,
        platformTariffSubscriptions.tariffVersionDigest
      ],
      name: "finance_saved_card_consents_subscription_snapshot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_saved_card_consents_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.disclosureSeriesId,
        table.disclosureVersion,
        table.noticeLocale,
        table.disclosureDigest
      ],
      foreignColumns: [
        financeSavedCardDisclosureVersions.disclosureSeriesId,
        financeSavedCardDisclosureVersions.version,
        financeSavedCardDisclosureVersions.locale,
        financeSavedCardDisclosureVersions.canonicalDigest
      ],
      name: "finance_saved_card_consents_disclosure_snapshot_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_saved_card_consents_exact_subscription_provider_customer_unique").on(
      table.consentId,
      table.consentVersion,
      table.subscriptionId,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerCustomerId
    ),
    check(
      "finance_saved_card_consents_scope_check",
      sql`${table.consentScope} in ${sql.raw(formatFinanceSqlValues(consentScopeValues))}`
    ),
    check(
      "finance_saved_card_consents_notice_check",
      sql`${table.noticeLocale} in ${sql.raw(formatFinanceSqlValues(noticeLocaleValues))}
        and ${table.disclosureVersion} >= 1
        and length(trim(${table.disclosureSeriesId})) between 1 and 160
        and ${table.disclosureSeriesId} = trim(${table.disclosureSeriesId})
        and ${table.disclosureSeriesId} !~ '[[:cntrl:]]'
        and ${table.disclosureDigest} ~ ${digestPattern}
        and ${table.tariffVersionDigest} ~ ${digestPattern}`
    ),
    check(
      "finance_saved_card_consents_identity_check",
      sql`${table.consentVersion} >= 1 and ${table.tariffVersion} >= 1
        and ${table.providerIdentityVersion} >= 1
        and length(trim(${table.consentId})) between 1 and 160 and ${table.consentId} = trim(${table.consentId})
        and ${table.consentId} !~ '[[:cntrl:]]'
        and length(trim(${table.providerCustomerId})) between 1 and 160
        and ${table.providerCustomerId} = trim(${table.providerCustomerId})
        and ${table.providerCustomerId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_saved_card_consents_buyer_contact_check",
      sql`(
        ${table.buyerContactKind} = 'email'
        and ${table.buyerContactValue} = trim(${table.buyerContactValue})
        and ${table.buyerContactValue} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      ) or (
        ${table.buyerContactKind} = 'phone'
        and ${table.buyerContactValue} ~ '^\\+[1-9][0-9]{1,14}$'
      )`
    ),
    index("finance_saved_card_consents_subscription_idx").on(
      table.subscriptionId,
      table.consentVersion
    ),
    index("finance_saved_card_consents_provider_customer_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerCustomerId,
      table.consentId
    )
  ]
);

export const financeSavedCardConsentLifecycleEvents = pgTable(
  "finance_saved_card_consent_lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consentId: varchar("consent_id", { length: 160 }).notNull(),
    consentVersion: financeRevisionString("consent_version").notNull(),
    eventSequence: financeRevisionString("event_sequence").notNull(),
    lifecycle: text("lifecycle").notNull(),
    reasonCode: varchar("reason_code", { length: 160 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.consentId, table.consentVersion],
      foreignColumns: [financeSavedCardConsents.consentId, financeSavedCardConsents.consentVersion],
      name: "finance_saved_card_consent_lifecycle_events_consent_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_saved_card_consent_lifecycle_events_sequence_unique").on(
      table.consentId,
      table.consentVersion,
      table.eventSequence
    ),
    unique("finance_saved_card_consent_lifecycle_events_exact_unique").on(
      table.consentId,
      table.consentVersion,
      table.eventSequence,
      table.lifecycle
    ),
    check(
      "finance_saved_card_consent_lifecycle_events_shape_check",
      sql`${table.consentVersion} >= 1 and ${table.eventSequence} >= 1
        and ${table.lifecycle} in ${sql.raw(formatFinanceSqlValues(consentLifecycleValues))}
        and (
          (${table.lifecycle} = 'granted' and ${table.reasonCode} is null)
          or (${table.lifecycle} = 'revoked' and ${table.reasonCode} ~ '^[a-z0-9_][a-z0-9_-]{0,159}$')
        )`
    ),
    index("finance_saved_card_consent_lifecycle_events_time_idx").on(
      table.consentId,
      table.consentVersion,
      table.occurredAt,
      table.id
    )
  ]
);

/** Mutable lookup/projection only. The consent and its lifecycle evidence remain append-only. */
export const financeSavedCardConsentHeads = pgTable(
  "finance_saved_card_consent_heads",
  {
    consentId: varchar("consent_id", { length: 160 }).notNull(),
    consentVersion: financeRevisionString("consent_version").notNull(),
    currentLifecycle: text("current_lifecycle").notNull(),
    lifecycleEventSequence: financeRevisionString("lifecycle_event_sequence").notNull(),
    headVersion: financeRevisionString("head_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.consentId, table.consentVersion],
      name: "finance_saved_card_consent_heads_pk"
    }),
    foreignKey({
      columns: [table.consentId, table.consentVersion],
      foreignColumns: [financeSavedCardConsents.consentId, financeSavedCardConsents.consentVersion],
      name: "finance_saved_card_consent_heads_consent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.consentId, table.consentVersion, table.lifecycleEventSequence, table.currentLifecycle],
      foreignColumns: [
        financeSavedCardConsentLifecycleEvents.consentId,
        financeSavedCardConsentLifecycleEvents.consentVersion,
        financeSavedCardConsentLifecycleEvents.eventSequence,
        financeSavedCardConsentLifecycleEvents.lifecycle
      ],
      name: "finance_saved_card_consent_heads_lifecycle_fk"
    }).onDelete("restrict"),
    check(
      "finance_saved_card_consent_heads_lifecycle_check",
      sql`${table.currentLifecycle} in ${sql.raw(formatFinanceSqlValues(consentLifecycleValues))}`
    ),
    check(
      "finance_saved_card_consent_heads_revision_check",
      sql`${table.consentVersion} >= 1 and ${table.lifecycleEventSequence} >= 1 and ${table.headVersion} >= 1`
    ),
    index("finance_saved_card_consent_heads_active_lookup_idx").on(
      table.currentLifecycle,
      table.consentId,
      table.consentVersion
    )
  ]
);

/** Baseline owner installs this DDL after tariff, provider and consent tables exist. */
export const financeSavedCardConsentIntegritySql = `
create or replace function finance_reject_saved_card_consent_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'saved-card consent evidence is append-only' using errcode = '55000';
end;
$$;

create trigger finance_saved_card_consents_immutable before update or delete on finance_saved_card_consents
for each row execute function finance_reject_saved_card_consent_mutation();
create trigger finance_saved_card_consents_no_truncate before truncate on finance_saved_card_consents
for each statement execute function finance_reject_saved_card_consent_mutation();
create trigger finance_saved_card_consent_lifecycle_events_immutable before update or delete on finance_saved_card_consent_lifecycle_events
for each row execute function finance_reject_saved_card_consent_mutation();
create trigger finance_saved_card_consent_lifecycle_events_no_truncate before truncate on finance_saved_card_consent_lifecycle_events
for each statement execute function finance_reject_saved_card_consent_mutation();
create trigger finance_saved_card_consent_heads_no_delete before delete on finance_saved_card_consent_heads
for each row execute function finance_reject_saved_card_consent_mutation();
create trigger finance_saved_card_consent_heads_no_truncate before truncate on finance_saved_card_consent_heads
for each statement execute function finance_reject_saved_card_consent_mutation();

create or replace function finance_validate_saved_card_consent_lifecycle_sequence()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  latest_sequence numeric(38, 0);
  latest_lifecycle text;
begin
  perform 1 from finance_saved_card_consents
    where consent_id = new.consent_id and consent_version = new.consent_version
    for update;
  if not found then
    raise exception 'saved-card consent does not exist' using errcode = '23503';
  end if;
  select event_sequence, lifecycle into latest_sequence, latest_lifecycle
    from finance_saved_card_consent_lifecycle_events
    where consent_id = new.consent_id and consent_version = new.consent_version
    order by event_sequence desc
    limit 1;
  if latest_sequence is null then
    if new.event_sequence <> 1 or new.lifecycle <> 'granted' then
      raise exception 'saved-card consent lifecycle must start granted at sequence one' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.event_sequence <> latest_sequence + 1 then
    raise exception 'saved-card consent lifecycle sequence must advance by one' using errcode = '40001';
  end if;
  if latest_lifecycle <> 'granted' or new.lifecycle <> 'revoked' then
    raise exception 'saved-card consent lifecycle transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_saved_card_consent_lifecycle_sequence
before insert on finance_saved_card_consent_lifecycle_events
for each row execute function finance_validate_saved_card_consent_lifecycle_sequence();

create or replace function finance_validate_saved_card_consent_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  latest_sequence numeric(38, 0);
  latest_lifecycle text;
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.head_version <> 1 or new.current_lifecycle <> 'granted' or new.lifecycle_event_sequence <> 1 then
      raise exception 'saved-card consent head must start at granted sequence one' using errcode = '23514';
    end if;
  else
    if new.consent_id <> old.consent_id or new.consent_version <> old.consent_version
       or new.head_version <> old.head_version + 1 then
      raise exception 'saved-card consent head identity is immutable and version must advance by one' using errcode = '40001';
    end if;
    if old.current_lifecycle <> 'granted' or new.current_lifecycle <> 'revoked' then
      raise exception 'saved-card consent head may only advance from granted to revoked' using errcode = '23514';
    end if;
  end if;
  select event_sequence, lifecycle into latest_sequence, latest_lifecycle
    from finance_saved_card_consent_lifecycle_events
    where consent_id = new.consent_id and consent_version = new.consent_version
    order by event_sequence desc
    limit 1;
  if latest_sequence is null or new.lifecycle_event_sequence <> latest_sequence
     or new.current_lifecycle <> latest_lifecycle then
    raise exception 'saved-card consent head must reference latest lifecycle evidence' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_saved_card_consent_head
before insert or update on finance_saved_card_consent_heads
for each row execute function finance_validate_saved_card_consent_head();

create or replace function finance_require_saved_card_consent_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  head finance_saved_card_consent_heads%rowtype;
begin
  select * into head from finance_saved_card_consent_heads
    where consent_id = new.consent_id and consent_version = new.consent_version;
  if not found or head.lifecycle_event_sequence <> new.event_sequence
     or head.current_lifecycle <> new.lifecycle then
    raise exception 'latest saved-card consent lifecycle event requires matching head' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_saved_card_consent_head
after insert on finance_saved_card_consent_lifecycle_events
deferrable initially deferred
for each row execute function finance_require_saved_card_consent_head();
`;
