import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { platformTariffInvoices } from "../platform-billing/tariff-authority.schema";
import { financeArtifacts } from "./finance-artifacts.schema";
import { financeTransientSecretRefs } from "./provider-credentials.schema";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "./economic-payments.schema";
import { financeRevisionString, formatFinanceSqlValues } from "./finance-values";
import { financeProviderOperationIntents } from "./provider-operations.schema";

const actionTypeValues = ["three_ds_method", "three_ds_challenge"] as const;
const actionPhaseValues = ["method", "challenge"] as const;
const actionStatusValues = ["pending", "superseded", "completed", "expired"] as const;

/**
 * A tariff invoice 3DS handoff is durable workflow state, not a payment success. Action fields
 * remain in the sealed provider response; this table only binds exact ownership and versions.
 */
export const financePlatformTariffInvoiceCustomerActions = pgTable(
  "finance_platform_tariff_invoice_customer_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: varchar("invoice_id", { length: 160 }).notNull(),
    invoiceVersion: financeRevisionString("invoice_version").notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }).notNull(),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }).notNull(),
    providerOperationIntentVersion: financeRevisionString(
      "provider_operation_intent_version"
    ).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    providerResponseArtifactId: varchar("provider_response_artifact_id", { length: 160 }).notNull(),
    providerResponseArtifactDigest: varchar("provider_response_artifact_digest", {
      length: 71
    }).notNull(),
    /**
     * Current-browser context is sealed only when a pending Method action is consumed. It is
     * never the fingerprint retained at the time a card was originally linked.
     */
    threeDsMethodContextSecretRefId: varchar("three_ds_method_context_secret_ref_id", {
      length: 160
    }),
    actionType: text("action_type").notNull(),
    phase: text("phase").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.invoiceId],
      foreignColumns: [platformTariffInvoices.id],
      name: "finance_platform_tariff_invoice_customer_actions_invoice_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financeEconomicPaymentIntents.id],
      name: "finance_platform_tariff_invoice_customer_actions_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentSessionId],
      foreignColumns: [financeEconomicPaymentSessions.id],
      name: "finance_platform_tariff_invoice_customer_actions_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_platform_tariff_invoice_customer_actions_operation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerResponseArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_platform_tariff_invoice_customer_actions_artifact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.threeDsMethodContextSecretRefId],
      foreignColumns: [financeTransientSecretRefs.secretRefId],
      name: "finance_platform_tariff_invoice_customer_actions_method_context_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_platform_tariff_invoice_customer_actions_operation_version_unique").on(
      table.providerOperationIntentId,
      table.providerOperationIntentVersion
    ),
    uniqueIndex("finance_platform_tariff_invoice_customer_actions_one_pending_invoice_unique")
      .on(table.invoiceId)
      .where(sql`${table.status} = 'pending'`),
    index("finance_platform_tariff_invoice_customer_actions_invoice_status_idx").on(
      table.invoiceId,
      table.status,
      table.createdAt,
      table.id
    ),
    check(
      "finance_platform_tariff_invoice_customer_actions_shape_check",
      sql`${table.invoiceVersion} >= 1
        and ${table.providerOperationIntentVersion} >= 1
        and ${table.providerResponseArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.actionType} in ${sql.raw(formatFinanceSqlValues(actionTypeValues))}
        and ${table.phase} in ${sql.raw(formatFinanceSqlValues(actionPhaseValues))}
        and ((${table.actionType} = 'three_ds_method' and ${table.phase} = 'method')
             or (${table.actionType} = 'three_ds_challenge' and ${table.phase} = 'challenge'))
        and ${table.status} in ${sql.raw(formatFinanceSqlValues(actionStatusValues))}
        and ((
          ${table.status} = 'pending'
          and ${table.resolvedAt} is null
          and ${table.threeDsMethodContextSecretRefId} is null
        ) or (
          ${table.status} = 'completed'
          and (${table.threeDsMethodContextSecretRefId} is null
            or ${table.actionType} = 'three_ds_method')
          and ${table.resolvedAt} is not null
          and ${table.resolvedAt} >= ${table.createdAt}
        ) or (
          ${table.status} in ('superseded', 'expired')
          and ${table.threeDsMethodContextSecretRefId} is null
          and ${table.resolvedAt} is not null
          and ${table.resolvedAt} >= ${table.createdAt}
        ))`
    )
  ]
);

export const financePlatformTariffInvoiceCustomerActionIntegritySql = `
create or replace function finance_validate_platform_tariff_invoice_customer_action()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  invoice platform_tariff_invoices%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
  economic_session finance_economic_payment_sessions%rowtype;
  provider_operation finance_provider_operation_intents%rowtype;
  response_artifact finance_artifacts%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'platform tariff invoice customer actions cannot be deleted' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id
       or new.invoice_id <> old.invoice_id
       or new.invoice_version <> old.invoice_version
       or new.economic_payment_intent_id <> old.economic_payment_intent_id
       or new.economic_payment_session_id <> old.economic_payment_session_id
       or new.provider_operation_intent_id <> old.provider_operation_intent_id
       or new.provider_operation_intent_version <> old.provider_operation_intent_version
       or new.provider_payment_id <> old.provider_payment_id
       or new.provider_response_artifact_id <> old.provider_response_artifact_id
       or new.provider_response_artifact_digest <> old.provider_response_artifact_digest
       or new.action_type <> old.action_type
       or new.phase <> old.phase
       or new.created_at <> old.created_at then
      raise exception 'platform tariff invoice customer action identity is immutable' using errcode = '55000';
    end if;
    if not (old.status = 'pending' and new.status in ('superseded', 'completed', 'expired')) then
      raise exception 'platform tariff invoice customer action transition is invalid' using errcode = '23514';
    end if;
    if not (old.three_ds_method_context_secret_ref_id is null and (
      (new.status = 'completed' and (
        new.three_ds_method_context_secret_ref_id is null
        or (old.action_type = 'three_ds_method' and new.three_ds_method_context_secret_ref_id is not null)
      )) or (
        new.status in ('superseded', 'expired')
        and new.three_ds_method_context_secret_ref_id is null
      )
    )) then
      raise exception 'platform tariff invoice customer action context transition is invalid' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into strict invoice from platform_tariff_invoices where id = new.invoice_id;
  select * into strict economic_intent from finance_economic_payment_intents where id = new.economic_payment_intent_id;
  select * into strict economic_session from finance_economic_payment_sessions where id = new.economic_payment_session_id;
  select * into strict provider_operation from finance_provider_operation_intents where id = new.provider_operation_intent_id;
  select * into strict response_artifact from finance_artifacts where id = new.provider_response_artifact_id;
  if economic_intent.purpose <> 'platform_invoice'
     or economic_intent.source_id <> invoice.id
     or economic_session.economic_payment_intent_id <> economic_intent.id
     or economic_session.id <> new.economic_payment_session_id
     or provider_operation.operation_kind not in ('saved_card_charge', 'saved_card_charge_3ds_method_complete')
     or provider_operation.purpose <> 'platform_invoice'
     or provider_operation.source_id <> invoice.id
     or provider_operation.economic_payment_intent_id <> economic_intent.id
     or provider_operation.economic_payment_session_id <> economic_session.id
     or provider_operation.series_id <> economic_intent.series_id
     or provider_operation.provider_account_id <> economic_intent.provider_account_id
     or provider_operation.provider_identity_version <> economic_intent.provider_identity_version
     or response_artifact.artifact_class <> (case
       when provider_operation.operation_kind = 'saved_card_charge' then 'provider_canonical_read'
       else 'provider_response'
     end)
     or response_artifact.binding_kind <> 'provider'
     or response_artifact.sha256_digest <> new.provider_response_artifact_digest
     or response_artifact.series_id <> provider_operation.series_id
     or response_artifact.provider_account_id <> provider_operation.provider_account_id
     or response_artifact.provider_identity_version <> provider_operation.provider_identity_version then
    raise exception 'platform tariff invoice customer action is cross-wired' using errcode = '23514';
  end if;
  if new.three_ds_method_context_secret_ref_id is not null then
    if new.action_type <> 'three_ds_method' then
      raise exception 'platform tariff invoice customer action context is cross-wired' using errcode = '23514';
    end if;
    if not exists (
      select 1 from finance_transient_secret_refs context
      where context.secret_ref_id = new.three_ds_method_context_secret_ref_id
        and context.series_id = provider_operation.series_id
        and context.provider_account_id = provider_operation.provider_account_id
        and context.provider_identity_version = provider_operation.provider_identity_version
        and context.provider_setup_id = new.provider_payment_id
    ) then
      raise exception 'platform tariff invoice customer action context is cross-wired' using errcode = '23514';
    end if;
  end if;
  if new.status = 'pending' and (
    invoice.state <> 'requires_customer_action'
     or invoice.version <> new.invoice_version
     or provider_operation.status <> 'requires_customer_action'
     or provider_operation.version <> new.provider_operation_intent_version
  ) then
    raise exception 'platform tariff invoice customer action is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger finance_validate_platform_tariff_invoice_customer_action
after insert or update or delete on finance_platform_tariff_invoice_customer_actions
deferrable initially deferred
for each row execute function finance_validate_platform_tariff_invoice_customer_action();

create or replace function finance_reject_platform_tariff_invoice_customer_actions_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'platform tariff invoice customer actions cannot be truncated' using errcode = '55000';
end;
$$;
create trigger finance_platform_tariff_invoice_customer_actions_no_truncate
before truncate on finance_platform_tariff_invoice_customer_actions
for each statement execute function finance_reject_platform_tariff_invoice_customer_actions_truncate();
`;
