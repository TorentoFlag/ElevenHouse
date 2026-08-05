import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "./economic-payments.schema";
import { financeArtifacts } from "./finance-artifacts.schema";
import { financeRevisionString } from "./finance-values";
import { orders } from "./orders.schema";
import { financeProviderOperationIntents } from "./provider-operations.schema";

/**
 * Worker-mediated HPP preparation. The Hosted Checkout URL remains in its sealed provider
 * response artifact and is never materialized here; this durable read model only permits a
 * client-owner read port to resolve the exact worker-published action.
 */
export const financeClientCheckoutPreparations = pgTable(
  "finance_client_checkout_preparations",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", {
      length: 160
    }).notNull(),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }).notNull(),
    requestArtifactId: varchar("request_artifact_id", { length: 160 }).notNull(),
    requestArtifactDigest: varchar("request_artifact_digest", { length: 71 }).notNull(),
    state: text("state").notNull(),
    version: financeRevisionString("version").notNull(),
    providerCheckoutId: uuid("provider_checkout_id"),
    responseArtifactId: varchar("response_artifact_id", { length: 160 }),
    responseArtifactDigest: varchar("response_artifact_digest", { length: 71 }),
    failureCode: varchar("failure_code", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: "finance_client_checkout_preparations_order_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.clientUserId],
      foreignColumns: [users.id],
      name: "finance_client_checkout_preparations_client_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financeEconomicPaymentIntents.id],
      name: "finance_client_checkout_preparations_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentSessionId],
      foreignColumns: [financeEconomicPaymentSessions.id],
      name: "finance_client_checkout_preparations_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_client_checkout_preparations_provider_operation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.requestArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_client_checkout_preparations_request_artifact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.responseArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_client_checkout_preparations_response_artifact_fk"
    }).onDelete("restrict"),
    unique("finance_client_checkout_preparations_provider_operation_unique").on(
      table.providerOperationIntentId
    ),
    uniqueIndex("finance_client_checkout_preparations_one_active_order_unique")
      .on(table.orderId)
      .where(
        sql`${table.state} in ('checkout_requested', 'checkout_ready', 'provider_session_unknown')`
      ),
    index("finance_client_checkout_preparations_client_read_idx").on(
      table.clientUserId,
      table.createdAt,
      table.id
    ),
    check(
      "finance_client_checkout_preparations_state_shape_check",
      sql`${table.version} >= 1
        and ${table.state} in ('checkout_requested', 'checkout_ready', 'provider_session_unknown', 'failed')
        and ${table.requestArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and (
          (${table.state} = 'checkout_requested'
            and ${table.version} = 1
            and ${table.providerCheckoutId} is null
            and ${table.responseArtifactId} is null
            and ${table.responseArtifactDigest} is null
            and ${table.failureCode} is null)
          or (${table.state} = 'checkout_ready'
            and ${table.version} >= 2
            and ${table.providerCheckoutId} is not null
            and ${table.responseArtifactId} is not null
            and ${table.responseArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
            and ${table.failureCode} is null)
          or (${table.state} = 'provider_session_unknown'
            and ${table.version} >= 2
            and ${table.providerCheckoutId} is null
            and ${table.responseArtifactId} is null
            and ${table.responseArtifactDigest} is null
            and ${table.failureCode} is null)
          or (${table.state} = 'failed'
            and ${table.version} >= 2
            and ${table.providerCheckoutId} is null
            and ${table.responseArtifactId} is null
            and ${table.responseArtifactDigest} is null
            and ${table.failureCode} ~ '^[a-z0-9_]{1,100}$')
        )`
    ),
    check(
      "finance_client_checkout_preparations_identifier_check",
      sql`length(trim(${table.economicPaymentIntentId})) between 1 and 160
        and ${table.economicPaymentIntentId} = trim(${table.economicPaymentIntentId})
        and ${table.economicPaymentIntentId} !~ '[[:cntrl:]]'
        and length(trim(${table.economicPaymentSessionId})) between 1 and 160
        and ${table.economicPaymentSessionId} = trim(${table.economicPaymentSessionId})
        and ${table.economicPaymentSessionId} !~ '[[:cntrl:]]'
        and length(trim(${table.requestArtifactId})) between 1 and 160
        and ${table.requestArtifactId} = trim(${table.requestArtifactId})
        and ${table.requestArtifactId} !~ '[[:cntrl:]]'
        and (${table.responseArtifactId} is null or (
          length(trim(${table.responseArtifactId})) between 1 and 160
          and ${table.responseArtifactId} = trim(${table.responseArtifactId})
          and ${table.responseArtifactId} !~ '[[:cntrl:]]'
        ))
        and ${table.updatedAt} >= ${table.createdAt}`
    )
  ]
);

export const financeClientCheckoutPreparationIntegritySql = `
create or replace function finance_reject_client_checkout_preparation_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'client checkout preparation cannot be deleted or truncated' using errcode = '55000';
end;
$$;

create trigger finance_client_checkout_preparations_no_delete before delete on finance_client_checkout_preparations
for each row execute function finance_reject_client_checkout_preparation_history_mutation();
create trigger finance_client_checkout_preparations_no_truncate before truncate on finance_client_checkout_preparations
for each statement execute function finance_reject_client_checkout_preparation_history_mutation();

create or replace function finance_validate_client_checkout_preparation_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    if new.version <> 1 or new.state <> 'checkout_requested' then
      raise exception 'client checkout preparation must start requested at version one' using errcode = '23514';
    end if;
    return new;
  end if;
  new.updated_at := clock_timestamp();
  if new.id <> old.id
     or new.order_id <> old.order_id
     or new.client_user_id <> old.client_user_id
     or new.economic_payment_intent_id <> old.economic_payment_intent_id
     or new.economic_payment_session_id <> old.economic_payment_session_id
     or new.provider_operation_intent_id <> old.provider_operation_intent_id
     or new.request_artifact_id <> old.request_artifact_id
     or new.request_artifact_digest <> old.request_artifact_digest
     or new.created_at <> old.created_at then
    raise exception 'client checkout preparation identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'client checkout preparation version conflict' using errcode = '40001';
  end if;
  if old.state <> 'checkout_requested'
     or new.state not in ('checkout_ready', 'provider_session_unknown', 'failed') then
    raise exception 'client checkout preparation transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_client_checkout_preparation_head
before insert or update on finance_client_checkout_preparations
for each row execute function finance_validate_client_checkout_preparation_head();

create or replace function finance_validate_client_checkout_preparation_correlation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1
    from finance_client_checkout_authorizations authority
    join finance_provider_operation_intents operation
      on operation.id = authority.provider_operation_intent_id
    join finance_provider_dispatch_artifacts dispatch
      on dispatch.provider_operation_intent_id = operation.id
    where authority.order_id = new.order_id
      and authority.client_user_id = new.client_user_id
      and authority.economic_payment_intent_id = new.economic_payment_intent_id
      and authority.economic_payment_session_id = new.economic_payment_session_id
      and authority.provider_operation_intent_id = new.provider_operation_intent_id
      and operation.operation_kind = 'checkout_session_create'
      and operation.purpose = 'client_order'
      and operation.source_id = new.order_id::text
      and dispatch.artifact_id = new.request_artifact_id
      and dispatch.artifact_digest = new.request_artifact_digest
  ) then
    raise exception 'client checkout preparation does not match durable checkout authority' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_client_checkout_preparation_correlation
after insert on finance_client_checkout_preparations
deferrable initially deferred
for each row execute function finance_validate_client_checkout_preparation_correlation();
`;
