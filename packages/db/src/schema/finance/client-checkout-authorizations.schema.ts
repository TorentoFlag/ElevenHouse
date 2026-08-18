import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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
import {
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "./capture-authorities.schema";
import { financeRevisionString } from "./finance-values";
import { orders } from "./orders.schema";

/**
 * Durable server authority for a client-order Hosted Checkout operation. The row is created by
 * the checkout-preparation transaction while the order is locked; it is not a browser DTO and
 * carries the exact server-selected source/payment identifiers that a provider operation needs.
 */
export const financeClientCheckoutAuthorizations = pgTable(
  "finance_client_checkout_authorizations",
  {
    authorityId: varchar("authority_id", { length: 160 }).primaryKey(),
    orderId: uuid("order_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    paymentCommandId: uuid("payment_command_id").notNull(),
    orderSnapshotVersion: financeRevisionString("order_snapshot_version").notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", {
      length: 160
    }).notNull(),
    providerOperationIntentId: varchar("provider_operation_intent_id", {
      length: 160
    }).notNull(),
    riskPolicyId: varchar("risk_policy_id", { length: 160 }).notNull(),
    riskPolicyVersion: financeRevisionString("risk_policy_version").notNull(),
    riskPolicyDigest: varchar("risk_policy_digest", { length: 71 }).notNull(),
    fulfillmentDecisionId: varchar("fulfillment_decision_id", { length: 200 }).notNull(),
    fulfillmentDecisionVersion: financeRevisionString("fulfillment_decision_version").notNull(),
    fulfillmentDecisionDigest: varchar("fulfillment_decision_digest", { length: 71 }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(sql`''`),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: "finance_client_checkout_authorizations_order_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.clientUserId],
      foreignColumns: [users.id],
      name: "finance_client_checkout_authorizations_client_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financeEconomicPaymentIntents.id],
      name: "finance_client_checkout_authorizations_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentSessionId],
      foreignColumns: [financeEconomicPaymentSessions.id],
      name: "finance_client_checkout_authorizations_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.riskPolicyId, table.riskPolicyVersion, table.riskPolicyDigest],
      foreignColumns: [
        financeRiskPolicyVersions.policyId,
        financeRiskPolicyVersions.policyVersion,
        financeRiskPolicyVersions.canonicalDigest
      ],
      name: "finance_client_checkout_authorizations_risk_policy_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.fulfillmentDecisionId,
        table.fulfillmentDecisionVersion,
        table.fulfillmentDecisionDigest
      ],
      foreignColumns: [
        financePaidProductFulfillmentDecisions.registryKey,
        financePaidProductFulfillmentDecisions.registryRevision,
        financePaidProductFulfillmentDecisions.canonicalDigest
      ],
      name: "finance_client_checkout_authorizations_fulfillment_fk"
    }).onDelete("restrict"),
    unique("finance_client_checkout_authorizations_command_unique").on(table.paymentCommandId),
    unique("finance_client_checkout_authorizations_provider_operation_unique").on(
      table.providerOperationIntentId
    ),
    unique("finance_client_checkout_authorizations_exact_authority_unique").on(
      table.authorityId,
      table.orderSnapshotVersion,
      table.canonicalDigest
    ),
    uniqueIndex("finance_client_checkout_authorizations_order_snapshot_unique").on(
      table.orderId,
      table.orderSnapshotVersion
    ),
    check(
      "finance_client_checkout_authorizations_shape_check",
      sql`${table.orderSnapshotVersion} = 1
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 8000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    ),
    check(
      "finance_client_checkout_authorizations_identifier_check",
      sql`length(trim(${table.authorityId})) between 1 and 160
        and ${table.authorityId} = trim(${table.authorityId})
        and ${table.authorityId} !~ '[[:cntrl:]]'
        and length(trim(${table.economicPaymentIntentId})) between 1 and 160
        and ${table.economicPaymentIntentId} = trim(${table.economicPaymentIntentId})
        and ${table.economicPaymentIntentId} !~ '[[:cntrl:]]'
        and length(trim(${table.economicPaymentSessionId})) between 1 and 160
        and ${table.economicPaymentSessionId} = trim(${table.economicPaymentSessionId})
        and ${table.economicPaymentSessionId} !~ '[[:cntrl:]]'
        and length(trim(${table.providerOperationIntentId})) between 1 and 160
        and ${table.providerOperationIntentId} = trim(${table.providerOperationIntentId})
        and ${table.providerOperationIntentId} !~ '[[:cntrl:]]'
        and length(trim(${table.riskPolicyId})) between 1 and 160
        and ${table.riskPolicyId} = trim(${table.riskPolicyId})
        and ${table.riskPolicyId} !~ '[[:cntrl:]]'
        and ${table.riskPolicyVersion} >= 1
        and ${table.riskPolicyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(trim(${table.fulfillmentDecisionId})) between 1 and 200
        and ${table.fulfillmentDecisionId} = trim(${table.fulfillmentDecisionId})
        and ${table.fulfillmentDecisionId} !~ '[[:cntrl:]]'
        and ${table.fulfillmentDecisionVersion} >= 1
        and ${table.fulfillmentDecisionDigest} ~ '^sha256:[a-f0-9]{64}$'`
    )
  ]
);

export const financeClientCheckoutAuthorizationIntegritySql = `
create or replace function finance_reject_client_checkout_authorization_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'client checkout authorization is immutable' using errcode = '55000';
end;
$$;

create trigger finance_client_checkout_authorizations_immutable before update or delete on finance_client_checkout_authorizations
for each row execute function finance_reject_client_checkout_authorization_mutation();
create trigger finance_client_checkout_authorizations_no_truncate before truncate on finance_client_checkout_authorizations
for each statement execute function finance_reject_client_checkout_authorization_mutation();

create or replace function finance_issue_client_checkout_authorization()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  order_row orders%rowtype;
  intent finance_economic_payment_intents%rowtype;
  session finance_economic_payment_sessions%rowtype;
  finance_policy finance_policies%rowtype;
  risk_policy finance_risk_policy_versions%rowtype;
  fulfillment finance_paid_product_fulfillment_decisions%rowtype;
  product_row products%rowtype;
  subscription_purchase client_subscription_purchase_authorities%rowtype;
  subscription_fulfillment client_subscription_purchase_fulfillment_authorities%rowtype;
  fulfillment_matches_order boolean;
begin
  select * into strict order_row from orders where id = new.order_id for update;
  select * into subscription_purchase from client_subscription_purchase_authorities
    where order_id = new.order_id;
  if subscription_purchase.order_id is not null then
    select binding.* into strict subscription_fulfillment
      from client_subscription_purchase_fulfillment_authorities binding
     where binding.order_id = new.order_id;
    fulfillment_matches_order :=
      subscription_fulfillment.purchase_authority_digest = subscription_purchase.canonical_digest
      and new.fulfillment_decision_id = subscription_fulfillment.registry_key
      and new.fulfillment_decision_version = subscription_fulfillment.registry_revision
      and new.fulfillment_decision_digest = subscription_fulfillment.fulfillment_decision_digest;
  else
    if new.fulfillment_decision_id in ('async.once.async.solo', 'sub.sub.async.solo') then
      raise exception 'client checkout authorization does not match locked order and payment session' using errcode = '23514';
    end if;
    select * into strict product_row from products where id = order_row.product_id;
    select * into strict fulfillment from finance_paid_product_fulfillment_decisions
      where registry_key = new.fulfillment_decision_id
        and registry_revision = new.fulfillment_decision_version
        and canonical_digest = new.fulfillment_decision_digest;
    fulfillment_matches_order := fulfillment.registry_key = concat_ws(
      '.',
      product_row.type,
      product_row.payment_model,
      product_row.execution_mode,
      product_row.participant_mode
    );
  end if;
  select * into strict intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  select * into strict session from finance_economic_payment_sessions
    where id = new.economic_payment_session_id;
  select * into strict finance_policy from finance_policies
    where id = order_row.finance_policy_snapshot_id;
  select * into strict risk_policy from finance_risk_policy_versions
    where policy_id = new.risk_policy_id
      and policy_version = new.risk_policy_version
      and canonical_digest = new.risk_policy_digest;
  if order_row.client_user_id <> new.client_user_id
     or order_row.status <> 'pending_payment'
     or intent.purpose <> 'client_order'
     or intent.source_id <> new.order_id::text
     or session.economic_payment_intent_id <> intent.id
     or session.state <> 'checkout_opened'
     or intent.state <> 'checkout_opened'
     or session.intent_version_opened <> intent.version
     or risk_policy.policy_id <> order_row.finance_policy_snapshot_id::text
     or risk_policy.policy_version <> finance_policy.policy_version
     or risk_policy.effective_risk_tier <> order_row.finance_policy_risk_tier
     or risk_policy.hold_duration_hours <> order_row.finance_policy_hold_duration_hours
     or risk_policy.reserve_bps <> order_row.finance_policy_reserve_bps
     or risk_policy.reserve_release_delay_days <> order_row.finance_policy_reserve_release_delay_days
     or risk_policy.provider_settlement_required <> order_row.finance_policy_provider_settlement_required
     or risk_policy.effective_at::timestamptz > clock_timestamp()
     or not fulfillment_matches_order then
    raise exception 'client checkout authorization does not match locked order and payment session' using errcode = '23514';
  end if;
  new.order_snapshot_version := 1;
  new.committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := jsonb_build_object(
    'kind', 'client_order_checkout_authorization',
    'schemaVersion', 1,
    'authorityId', new.authority_id,
    'orderId', new.order_id::text,
    'clientUserId', new.client_user_id::text,
    'paymentCommandId', new.payment_command_id::text,
    'orderSnapshotVersion', new.order_snapshot_version::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'providerOperationIntentId', new.provider_operation_intent_id,
    'riskPolicyId', new.risk_policy_id,
    'riskPolicyVersion', new.risk_policy_version,
    'riskPolicyDigest', new.risk_policy_digest,
    'fulfillmentDecisionId', new.fulfillment_decision_id,
    'fulfillmentDecisionVersion', new.fulfillment_decision_version,
    'fulfillmentDecisionDigest', new.fulfillment_decision_digest,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_client_checkout_authorization
before insert on finance_client_checkout_authorizations
for each row execute function finance_issue_client_checkout_authorization();
`;
