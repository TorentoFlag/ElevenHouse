import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { platformTariffSubscriptions } from "../platform-billing/tariff-authority.schema";
import { financeEconomicPaymentIntents } from "./economic-payments.schema";
import { financeRevisionString, formatFinanceSqlValues } from "./finance-values";
import { financeProviderAccounts } from "./provider-accounts.schema";
import {
  financeRestrictedProviderCredentials,
  financeTransientSecretRefs
} from "./provider-credentials.schema";
import { financeSavedCardConsents } from "./saved-card-consents.schema";

export const financeSavedCardSetupSessionStateValues = [
  "setup_requested",
  "preparation_pending",
  "tokenization_required",
  "execution_pending",
  "requires_customer_action",
  "credential_active",
  "setup_failed",
  "expired",
  "provider_unknown"
] as const;

/** Durable coordinator for browser tokenization; it is not a monetary payment or an invoice. */
export const financeSavedCardSetupSessions = pgTable(
  "finance_saved_card_setup_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    expectedSubscriptionVersion: integer("expected_subscription_version").notNull(),
    consentId: varchar("consent_id", { length: 160 }).notNull(),
    consentVersion: financeRevisionString("consent_version").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerCustomerId: varchar("provider_customer_id", { length: 160 }).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }),
    providerSetupId: varchar("provider_setup_id", { length: 160 }),
    /** Separate token-free browser context for the one later 3DS Method completion. */
    threeDsMethodContextSecretRefId: varchar("three_ds_method_context_secret_ref_id", { length: 160 }),
    savedCardCredentialId: varchar("saved_card_credential_id", { length: 160 }),
    savedCardCredentialVersion: financeRevisionString("saved_card_credential_version"),
    state: text("state").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    terminalAt: timestamp("terminal_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.subscriptionId],
      foreignColumns: [platformTariffSubscriptions.id],
      name: "finance_saved_card_setup_sessions_subscription_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [users.id],
      name: "finance_saved_card_setup_sessions_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.consentId, table.consentVersion],
      foreignColumns: [financeSavedCardConsents.consentId, financeSavedCardConsents.consentVersion],
      name: "finance_saved_card_setup_sessions_consent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_saved_card_setup_sessions_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId, table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeEconomicPaymentIntents.id,
        financeEconomicPaymentIntents.seriesId,
        financeEconomicPaymentIntents.providerAccountId,
        financeEconomicPaymentIntents.providerIdentityVersion
      ],
      name: "finance_saved_card_setup_sessions_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.threeDsMethodContextSecretRefId],
      foreignColumns: [financeTransientSecretRefs.secretRefId],
      name: "finance_saved_card_setup_sessions_three_ds_method_context_secret_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.savedCardCredentialId,
        table.savedCardCredentialVersion,
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
      name: "finance_saved_card_setup_sessions_credential_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_saved_card_setup_sessions_one_active_subscription_unique")
      .on(table.subscriptionId)
      .where(sql`${table.state} in ('setup_requested', 'preparation_pending', 'tokenization_required', 'execution_pending', 'requires_customer_action', 'provider_unknown')`),
    uniqueIndex("finance_saved_card_setup_sessions_provider_setup_unique")
      .on(table.seriesId, table.providerAccountId, table.providerIdentityVersion, table.providerSetupId)
      .where(sql`${table.providerSetupId} is not null`),
    uniqueIndex("finance_saved_card_setup_sessions_economic_intent_unique")
      .on(table.economicPaymentIntentId)
      .where(sql`${table.economicPaymentIntentId} is not null`),
    index("finance_saved_card_setup_sessions_owner_state_idx").on(
      table.ownerUserId,
      table.state,
      table.updatedAt,
      table.id
    ),
    check(
      "finance_saved_card_setup_sessions_shape_check",
      sql`${table.state} in ${sql.raw(formatFinanceSqlValues(financeSavedCardSetupSessionStateValues))}
        and ${table.version} >= 1 and ${table.expectedSubscriptionVersion} >= 1
        and ${table.consentVersion} >= 1 and ${table.providerIdentityVersion} >= 1
        and ${table.updatedAt} >= ${table.createdAt}
        and length(trim(${table.providerCustomerId})) between 1 and 160
        and ${table.providerCustomerId} = trim(${table.providerCustomerId})
        and ${table.providerCustomerId} !~ '[[:cntrl:]]'
        and (${table.providerSetupId} is null or (length(trim(${table.providerSetupId})) between 1 and 160 and ${table.providerSetupId} = trim(${table.providerSetupId}) and ${table.providerSetupId} !~ '[[:cntrl:]]'))
        and (${table.economicPaymentIntentId} is null or (length(trim(${table.economicPaymentIntentId})) between 1 and 160 and ${table.economicPaymentIntentId} = trim(${table.economicPaymentIntentId}) and ${table.economicPaymentIntentId} !~ '[[:cntrl:]]'))
        and ((${table.savedCardCredentialId} is null and ${table.savedCardCredentialVersion} is null) or (${table.savedCardCredentialId} is not null and ${table.savedCardCredentialVersion} >= 1))
        and (( ${table.state} = 'setup_requested' and ${table.providerSetupId} is null and ${table.economicPaymentIntentId} is null and ${table.threeDsMethodContextSecretRefId} is null and ${table.savedCardCredentialId} is null and ${table.terminalAt} is null)
          or (${table.state} = 'preparation_pending' and ${table.providerSetupId} is null and ${table.economicPaymentIntentId} is not null and ${table.threeDsMethodContextSecretRefId} is null and ${table.savedCardCredentialId} is null and ${table.terminalAt} is null)
          or (${table.state} = 'tokenization_required' and ${table.providerSetupId} is not null and ${table.economicPaymentIntentId} is not null and ${table.threeDsMethodContextSecretRefId} is null and ${table.savedCardCredentialId} is null and ${table.terminalAt} is null)
          or (${table.state} in ('execution_pending', 'requires_customer_action', 'provider_unknown') and ${table.providerSetupId} is not null and ${table.economicPaymentIntentId} is not null and ${table.threeDsMethodContextSecretRefId} is not null and ${table.savedCardCredentialId} is null and ${table.terminalAt} is null)
          or (${table.state} = 'credential_active' and ${table.providerSetupId} is not null and ${table.economicPaymentIntentId} is not null and ${table.threeDsMethodContextSecretRefId} is not null and ${table.savedCardCredentialId} is not null and ${table.terminalAt} is not null)
          or (${table.state} in ('setup_failed', 'expired') and ${table.savedCardCredentialId} is null and ${table.terminalAt} is not null))`
    )
  ]
);

export const financeSavedCardSetupSessionIntegritySql = `
create or replace function finance_validate_saved_card_setup_session()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'saved-card setup sessions cannot be deleted' using errcode = '55000';
  end if;

  if tg_op = 'INSERT' then
    if new.version <> 1 or new.state <> 'setup_requested' then
      raise exception 'saved-card setup session must start requested at version one' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from platform_tariff_subscriptions subscription
      join finance_saved_card_consents consent
        on consent.consent_id = new.consent_id and consent.consent_version = new.consent_version
      where subscription.id = new.subscription_id
        and subscription.owner_user_id = new.owner_user_id
        and subscription.state = 'incomplete_setup'
        and subscription.version = new.expected_subscription_version
        and consent.subscription_id = subscription.id
        and consent.owner_user_id = subscription.owner_user_id
        and consent.series_id = new.series_id
        and consent.provider_account_id = new.provider_account_id
        and consent.provider_identity_version = new.provider_identity_version
        and consent.provider_customer_id = new.provider_customer_id
    ) then
      raise exception 'saved-card setup session requires exact incomplete subscription and consent' using errcode = '23514';
    end if;
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if new.id <> old.id or new.subscription_id <> old.subscription_id or new.owner_user_id <> old.owner_user_id
     or new.expected_subscription_version <> old.expected_subscription_version
     or new.consent_id <> old.consent_id or new.consent_version <> old.consent_version
     or new.series_id <> old.series_id or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version or new.provider_customer_id <> old.provider_customer_id
     or new.created_at <> old.created_at then
    raise exception 'saved-card setup session identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'saved-card setup session version must advance by one' using errcode = '40001';
  end if;
  if new.three_ds_method_context_secret_ref_id is distinct from old.three_ds_method_context_secret_ref_id
     and not (old.state = 'tokenization_required' and new.state = 'execution_pending'
              and old.three_ds_method_context_secret_ref_id is null
              and new.three_ds_method_context_secret_ref_id is not null) then
    raise exception 'saved-card setup 3DS Method context is immutable' using errcode = '55000';
  end if;
  if not (
    (old.state = 'setup_requested' and new.state = 'preparation_pending')
    or (old.state = 'preparation_pending' and new.state in ('tokenization_required', 'setup_failed', 'provider_unknown'))
    or (old.state = 'tokenization_required' and new.state in ('execution_pending', 'setup_failed', 'expired'))
    or (old.state = 'execution_pending' and new.state in ('requires_customer_action', 'credential_active', 'setup_failed', 'expired', 'provider_unknown'))
    or (old.state = 'requires_customer_action' and new.state in ('execution_pending', 'credential_active', 'setup_failed', 'expired', 'provider_unknown'))
    or (old.state = 'provider_unknown' and new.state in ('execution_pending', 'tokenization_required', 'credential_active', 'setup_failed', 'expired'))
  ) then
    raise exception 'saved-card setup session transition is invalid' using errcode = '23514';
  end if;
  if new.economic_payment_intent_id is not null and not exists (
    select 1 from finance_economic_payment_intents intent
    where intent.id = new.economic_payment_intent_id
      and intent.purpose = 'platform_card_setup'
      and intent.source_id = new.id::text
      and intent.series_id = new.series_id
      and intent.provider_account_id = new.provider_account_id
      and intent.provider_identity_version = new.provider_identity_version
      and intent.amount_minor = 0
      and intent.currency = 'RUB'
  ) then
    raise exception 'saved-card setup session requires its exact zero-amount economic intent' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_saved_card_setup_sessions_guard
before insert or update or delete on finance_saved_card_setup_sessions
for each row execute function finance_validate_saved_card_setup_session();

create or replace function finance_reject_saved_card_setup_sessions_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'saved-card setup sessions cannot be truncated' using errcode = '55000';
end;
$$;

create trigger finance_saved_card_setup_sessions_no_truncate
before truncate on finance_saved_card_setup_sessions
for each statement execute function finance_reject_saved_card_setup_sessions_truncate();
`;
