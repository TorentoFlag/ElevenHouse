import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeProviderAccounts } from "./provider-accounts.schema";
import { financeSavedCardConsents } from "./saved-card-consents.schema";
import {
  financeRestrictedCredentialLifecycleValues,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";

export const financeRestrictedProviderCredentials = pgTable(
  "finance_restricted_provider_credentials",
  {
    credentialId: varchar("credential_id", { length: 160 }).notNull(),
    credentialVersion: financeRevisionString("credential_version").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerCustomerId: varchar("provider_customer_id", { length: 160 }).notNull(),
    providerCredentialFingerprint: varchar("provider_credential_fingerprint", {
      length: 71
    }).notNull(),
    restrictedTokenHandleRef: varchar("restricted_token_handle_ref", { length: 640 }).notNull(),
    displayBrand: varchar("display_brand", { length: 32 }).notNull(),
    displayLast4: varchar("display_last4", { length: 4 }).notNull(),
    displayMask: varchar("display_mask", { length: 20 }).notNull(),
    expiryMonth: smallint("expiry_month").notNull(),
    expiryYear: integer("expiry_year").notNull(),
    consentId: varchar("consent_id", { length: 160 }).notNull(),
    consentVersion: financeRevisionString("consent_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.credentialId, table.credentialVersion],
      name: "finance_restricted_provider_credentials_pk"
    }),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_restricted_provider_credentials_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.consentId, table.consentVersion],
      foreignColumns: [financeSavedCardConsents.consentId, financeSavedCardConsents.consentVersion],
      name: "finance_restricted_provider_credentials_saved_card_consent_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_restricted_provider_credentials_scoped_fingerprint_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerCredentialFingerprint
    ),
    uniqueIndex("finance_restricted_provider_credentials_token_handle_unique").on(
      table.restrictedTokenHandleRef
    ),
    uniqueIndex("finance_restricted_provider_credentials_exact_owner_unique").on(
      table.credentialId,
      table.credentialVersion,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerCustomerId
    ),
    check(
      "finance_restricted_provider_credentials_version_check",
      sql`${table.credentialVersion} >= 1 and ${table.consentVersion} >= 1`
    ),
    check(
      "finance_restricted_provider_credentials_fingerprint_check",
      sql`${table.providerCredentialFingerprint} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "finance_restricted_provider_credentials_handle_check",
      sql`${table.restrictedTokenHandleRef} ~ '^(vault|kms)://[^[:space:]?#]+$'`
    ),
    check(
      "finance_restricted_provider_credentials_display_check",
      sql`${table.displayBrand} ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
        and ${table.displayLast4} ~ '^[0-9]{4}$'
        and ${table.displayMask} ~ '^\\*{4,16}[0-9]{4}$'
        and right(${table.displayMask}, 4) = ${table.displayLast4}`
    ),
    check(
      "finance_restricted_provider_credentials_expiry_check",
      sql`${table.expiryMonth} between 1 and 12 and ${table.expiryYear} between 2000 and 9999`
    ),
    index("finance_restricted_provider_credentials_customer_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerCustomerId,
      table.credentialId
    )
  ]
);

export const financeRestrictedProviderCredentialLifecycleEvents = pgTable(
  "finance_restricted_provider_credential_lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    credentialId: varchar("credential_id", { length: 160 }).notNull(),
    credentialVersion: financeRevisionString("credential_version").notNull(),
    eventSequence: financeRevisionString("event_sequence").notNull(),
    lifecycle: text("lifecycle").notNull(),
    reasonCode: varchar("reason_code", { length: 160 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.credentialId, table.credentialVersion],
      foreignColumns: [
        financeRestrictedProviderCredentials.credentialId,
        financeRestrictedProviderCredentials.credentialVersion
      ],
      name: "finance_restricted_provider_credential_lifecycle_events_credential_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_restricted_provider_credential_lifecycle_events_sequence_unique").on(
      table.credentialId,
      table.credentialVersion,
      table.eventSequence
    ),
    uniqueIndex("finance_restricted_provider_credential_lifecycle_events_exact_unique").on(
      table.credentialId,
      table.credentialVersion,
      table.eventSequence,
      table.lifecycle
    ),
    check(
      "finance_restricted_provider_credential_lifecycle_events_sequence_check",
      sql`${table.credentialVersion} >= 1 and ${table.eventSequence} >= 1`
    ),
    check(
      "finance_restricted_provider_credential_lifecycle_events_lifecycle_check",
      sql`${table.lifecycle} in ${sql.raw(
        formatFinanceSqlValues(financeRestrictedCredentialLifecycleValues)
      )}`
    ),
    check(
      "finance_restricted_provider_credential_lifecycle_events_reason_check",
      sql`(
        ${table.lifecycle} in ('pending_activation', 'active')
        and ${table.reasonCode} is null
      ) or (
        ${table.lifecycle} in ('revoked', 'expired', 'compromised')
        and ${table.reasonCode} is not null
      )`
    ),
    index("finance_restricted_provider_credential_lifecycle_events_time_idx").on(
      table.credentialId,
      table.credentialVersion,
      table.occurredAt,
      table.id
    )
  ]
);

export const financeRestrictedProviderCredentialHeads = pgTable(
  "finance_restricted_provider_credential_heads",
  {
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerCustomerId: varchar("provider_customer_id", { length: 160 }).notNull(),
    currentCredentialId: varchar("current_credential_id", { length: 160 }).notNull(),
    currentCredentialVersion: financeRevisionString("current_credential_version").notNull(),
    currentLifecycle: text("current_lifecycle").notNull(),
    lifecycleEventSequence: financeRevisionString("lifecycle_event_sequence").notNull(),
    headVersion: financeRevisionString("head_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerCustomerId
      ],
      name: "finance_restricted_provider_credential_heads_pk"
    }),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_restricted_provider_credential_heads_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.currentCredentialId,
        table.currentCredentialVersion,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerCustomerId
      ],
      foreignColumns: [
        financeRestrictedProviderCredentials.credentialId,
        financeRestrictedProviderCredentials.credentialVersion,
        financeRestrictedProviderCredentials.seriesId,
        financeRestrictedProviderCredentials.providerAccountId,
        financeRestrictedProviderCredentials.providerIdentityVersion,
        financeRestrictedProviderCredentials.providerCustomerId
      ],
      name: "finance_restricted_provider_credential_heads_exact_credential_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.currentCredentialId,
        table.currentCredentialVersion,
        table.lifecycleEventSequence,
        table.currentLifecycle
      ],
      foreignColumns: [
        financeRestrictedProviderCredentialLifecycleEvents.credentialId,
        financeRestrictedProviderCredentialLifecycleEvents.credentialVersion,
        financeRestrictedProviderCredentialLifecycleEvents.eventSequence,
        financeRestrictedProviderCredentialLifecycleEvents.lifecycle
      ],
      name: "finance_restricted_provider_credential_heads_exact_lifecycle_event_fk"
    }).onDelete("restrict"),
    check(
      "finance_restricted_provider_credential_heads_revision_check",
      sql`${table.currentCredentialVersion} >= 1
        and ${table.lifecycleEventSequence} >= 1
        and ${table.headVersion} >= 1`
    ),
    check(
      "finance_restricted_provider_credential_heads_lifecycle_check",
      sql`${table.currentLifecycle} in ${sql.raw(
        formatFinanceSqlValues(financeRestrictedCredentialLifecycleValues)
      )}`
    ),
    index("finance_restricted_provider_credential_heads_active_lookup_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.currentLifecycle,
      table.providerCustomerId
    )
  ]
);

export const financeTransientSecretRefs = pgTable(
  "finance_transient_secret_refs",
  {
    secretRefId: varchar("secret_ref_id", { length: 160 }).primaryKey(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerSetupId: varchar("provider_setup_id", { length: 160 }).notNull(),
    sealedSecretRef: varchar("sealed_secret_ref", { length: 640 }).notNull(),
    providerExpiresAt: timestamp("provider_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_transient_secret_refs_provider_identity_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_transient_secret_refs_sealed_ref_unique").on(table.sealedSecretRef),
    check(
      "finance_transient_secret_refs_handle_check",
      sql`${table.sealedSecretRef} ~ '^(vault|kms)://[^[:space:]?#]+$'`
    ),
    check(
      "finance_transient_secret_refs_expiry_check",
      sql`${table.providerExpiresAt} > ${table.createdAt}`
    ),
    index("finance_transient_secret_refs_available_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerExpiresAt,
      table.secretRefId
    )
  ]
);

export const financeTransientSecretConsumptions = pgTable(
  "finance_transient_secret_consumptions",
  {
    secretRefId: varchar("secret_ref_id", { length: 160 }).notNull(),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.secretRefId],
      name: "finance_transient_secret_consumptions_pk"
    }),
    foreignKey({
      columns: [table.secretRefId],
      foreignColumns: [financeTransientSecretRefs.secretRefId],
      name: "finance_transient_secret_consumptions_secret_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_transient_secret_consumptions_one_use_unique").on(table.secretRefId),
    uniqueIndex("finance_transient_secret_consumptions_operation_unique").on(
      table.providerOperationIntentId
    )
  ]
);

/** Baseline owner executes this DDL after Drizzle creates the tables. */
export const financeProviderCredentialImmutabilitySql = `
create or replace function finance_reject_provider_credential_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'finance provider credentials and secret evidence are append-only' using errcode = '55000';
end;
$$;

create trigger finance_restricted_provider_credentials_immutable before update or delete on finance_restricted_provider_credentials
for each row execute function finance_reject_provider_credential_mutation();
create trigger finance_restricted_provider_credentials_no_truncate before truncate on finance_restricted_provider_credentials
for each statement execute function finance_reject_provider_credential_mutation();
create trigger finance_restricted_provider_credential_lifecycle_events_immutable before update or delete on finance_restricted_provider_credential_lifecycle_events
for each row execute function finance_reject_provider_credential_mutation();
create trigger finance_restricted_provider_credential_lifecycle_events_no_truncate before truncate on finance_restricted_provider_credential_lifecycle_events
for each statement execute function finance_reject_provider_credential_mutation();
create trigger finance_restricted_provider_credential_heads_no_delete before delete on finance_restricted_provider_credential_heads
for each row execute function finance_reject_provider_credential_mutation();
create trigger finance_restricted_provider_credential_heads_no_truncate before truncate on finance_restricted_provider_credential_heads
for each statement execute function finance_reject_provider_credential_mutation();
create trigger finance_transient_secret_refs_immutable before update or delete on finance_transient_secret_refs
for each row execute function finance_reject_provider_credential_mutation();
create trigger finance_transient_secret_refs_no_truncate before truncate on finance_transient_secret_refs
for each statement execute function finance_reject_provider_credential_mutation();
create trigger finance_transient_secret_consumptions_immutable before update or delete on finance_transient_secret_consumptions
for each row execute function finance_reject_provider_credential_mutation();
create trigger finance_transient_secret_consumptions_no_truncate before truncate on finance_transient_secret_consumptions
for each statement execute function finance_reject_provider_credential_mutation();

create or replace function finance_validate_provider_credential_lifecycle_sequence()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  latest_sequence numeric(38, 0);
  latest_lifecycle text;
begin
  perform 1 from finance_restricted_provider_credentials
    where credential_id = new.credential_id and credential_version = new.credential_version
    for update;
  select event_sequence, lifecycle into latest_sequence, latest_lifecycle
    from finance_restricted_provider_credential_lifecycle_events
    where credential_id = new.credential_id and credential_version = new.credential_version
    order by event_sequence desc
    limit 1;
  if latest_sequence is null then
    if new.event_sequence <> 1 or new.lifecycle <> 'pending_activation' then
      raise exception 'credential lifecycle must start pending activation at sequence one' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.event_sequence <> latest_sequence + 1 then
    raise exception 'credential lifecycle sequence must advance by one' using errcode = '40001';
  end if;
  if not (
    (latest_lifecycle = 'pending_activation' and new.lifecycle in ('active', 'revoked', 'expired', 'compromised'))
    or (latest_lifecycle = 'active' and new.lifecycle in ('revoked', 'expired', 'compromised'))
  ) then
    raise exception 'credential lifecycle transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_provider_credential_lifecycle_sequence
before insert on finance_restricted_provider_credential_lifecycle_events
for each row execute function finance_validate_provider_credential_lifecycle_sequence();

create or replace function finance_validate_provider_credential_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  latest numeric(38, 0);
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' and new.head_version <> 1 then
    raise exception 'credential head must start at version one' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.series_id <> old.series_id
       or new.provider_account_id <> old.provider_account_id
       or new.provider_identity_version <> old.provider_identity_version
       or new.provider_customer_id <> old.provider_customer_id
       or new.head_version <> old.head_version + 1 then
      raise exception 'credential head identity is immutable and version must advance by one' using errcode = '40001';
    end if;
    if (
      new.current_credential_id <> old.current_credential_id
      or new.current_credential_version <> old.current_credential_version
    ) and (
      old.current_lifecycle not in ('revoked', 'expired', 'compromised')
      or new.current_lifecycle not in ('pending_activation', 'active')
    ) then
      raise exception 'credential replacement requires a terminal old head and a new usable version' using errcode = '23514';
    end if;
  end if;
  select max(event_sequence) into latest
    from finance_restricted_provider_credential_lifecycle_events
    where credential_id = new.current_credential_id
      and credential_version = new.current_credential_version;
  if latest is null or new.lifecycle_event_sequence <> latest then
    raise exception 'credential head must reference the latest lifecycle event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_provider_credential_head
before insert or update on finance_restricted_provider_credential_heads
for each row execute function finance_validate_provider_credential_head();

create or replace function finance_require_current_credential_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  owner finance_restricted_provider_credentials%rowtype;
  current_head finance_restricted_provider_credential_heads%rowtype;
begin
  select * into owner from finance_restricted_provider_credentials
    where credential_id = new.credential_id and credential_version = new.credential_version;
  select * into current_head from finance_restricted_provider_credential_heads
    where series_id = owner.series_id
      and provider_account_id = owner.provider_account_id
      and provider_identity_version = owner.provider_identity_version
      and provider_customer_id = owner.provider_customer_id;
  if not found then
    raise exception 'credential lifecycle event requires a current head' using errcode = '23514';
  end if;
  if current_head.current_credential_id <> new.credential_id
     or current_head.current_credential_version <> new.credential_version then
    if new.lifecycle not in ('revoked', 'expired', 'compromised') then
      raise exception 'non-terminal credential lifecycle event must become current' using errcode = '23514';
    end if;
    return null;
  end if;
  if current_head.lifecycle_event_sequence <> new.event_sequence
     or current_head.current_lifecycle <> new.lifecycle then
    raise exception 'latest credential lifecycle event must be reflected by the current head' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_current_credential_head
after insert on finance_restricted_provider_credential_lifecycle_events
deferrable initially deferred
for each row execute function finance_require_current_credential_head();

create or replace function finance_validate_transient_secret_consumption()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  secret finance_transient_secret_refs%rowtype;
begin
  select * into secret from finance_transient_secret_refs
    where secret_ref_id = new.secret_ref_id
    for update;
  if not found then
    raise exception 'transient secret reference does not exist' using errcode = '23503';
  end if;
  new.consumed_at := clock_timestamp();
  if new.consumed_at > secret.provider_expires_at then
    raise exception 'transient secret reference has expired' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_transient_secret_consumption
before insert on finance_transient_secret_consumptions
for each row execute function finance_validate_transient_secret_consumption();
`;

/**
 * Added only at the atomic provider-operation cutover once both normalized target tables exist.
 * The consent FK above is already live; a transient-secret consumption cannot refer to a
 * legacy/general-purpose payment table either.
 */
export const financeProviderCredentialDeferredForeignKeys = [
  {
    sourceTable: "finance_transient_secret_consumptions",
    sourceColumns: ["provider_operation_intent_id"],
    targetTable: "finance_provider_operation_intents",
    targetColumns: ["id"]
  }
] as const;
