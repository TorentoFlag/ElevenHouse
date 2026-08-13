import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { clientSubscriptionContracts } from "../client-subscriptions/client-subscription-contracts.schema";
import { clientSubscriptionPeriods } from "../client-subscriptions/client-subscription-periods.schema";
import { clientSubscriptionRenewalRequests } from "../client-subscriptions/client-subscription-renewal-requests.schema";
import { clientSubscriptions } from "../client-subscriptions/client-subscriptions.schema";
import { financeOnlineSaleCaptureApplications } from "./online-sale-capture.schema";
import { orders } from "./orders.schema";

/** Immutable payment-to-subscription dispatch authority. */
export const financeClientSubscriptionCaptureDispatchReceipts = pgTable(
  "finance_client_subscription_capture_dispatch_receipts",
  {
    dispatchReceiptId: uuid("dispatch_receipt_id").primaryKey(),
    captureApplicationReceiptId: uuid("capture_application_receipt_id").notNull(),
    captureApplicationDigest: varchar("capture_application_digest", { length: 71 }).notNull(),
    orderId: uuid("order_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    contractCanonicalDigest: varchar("contract_canonical_digest", { length: 71 }).notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    subscriptionExpectedVersion: integer("subscription_expected_version").notNull(),
    captureKind: text("capture_kind").notNull(),
    renewalRequestId: uuid("renewal_request_id"),
    intendedPeriodId: uuid("intended_period_id"),
    sourceEventId: uuid("source_event_id").notNull(),
    sourceEventDigest: varchar("source_event_digest", { length: 71 }).notNull(),
    periodId: uuid("period_id").notNull(),
    primaryLifecycleEventId: uuid("primary_lifecycle_event_id").notNull(),
    entitlementChangedEventId: uuid("entitlement_changed_event_id").notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("finance_client_subscription_capture_dispatch_capture_unique").on(
      table.captureApplicationReceiptId
    ),
    unique("finance_client_subscription_capture_dispatch_source_event_unique").on(
      table.sourceEventId
    ),
    unique("finance_client_subscription_capture_dispatch_digest_unique").on(table.canonicalDigest),
    foreignKey({
      columns: [table.captureApplicationReceiptId],
      foreignColumns: [financeOnlineSaleCaptureApplications.id],
      name: "finance_client_subscription_capture_dispatch_capture_v2_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: "finance_client_subscription_capture_dispatch_order_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.contractId],
      foreignColumns: [clientSubscriptionContracts.id],
      name: "finance_client_subscription_capture_dispatch_contract_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subscriptionId, table.contractId],
      foreignColumns: [clientSubscriptions.id, clientSubscriptions.contractId],
      name: "finance_client_subscription_capture_dispatch_subscription_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.renewalRequestId, table.subscriptionId, table.intendedPeriodId],
      foreignColumns: [
        clientSubscriptionRenewalRequests.id,
        clientSubscriptionRenewalRequests.subscriptionId,
        clientSubscriptionRenewalRequests.intendedPeriodId
      ],
      name: "finance_client_subscription_capture_dispatch_renewal_request_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.intendedPeriodId, table.subscriptionId],
      foreignColumns: [clientSubscriptionPeriods.id, clientSubscriptionPeriods.subscriptionId],
      name: "finance_client_subscription_capture_dispatch_intended_period_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.periodId, table.subscriptionId],
      foreignColumns: [clientSubscriptionPeriods.id, clientSubscriptionPeriods.subscriptionId],
      name: "finance_client_subscription_capture_dispatch_period_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_capture_dispatch_receipt_capture_kind_check",
      sql`(${table.captureKind} = 'initial'
          and ${table.renewalRequestId} is null
          and ${table.intendedPeriodId} is null)
        or (${table.captureKind} = 'renewal'
          and ${table.renewalRequestId} is not null
          and ${table.intendedPeriodId} is not null
          and ${table.periodId} = ${table.intendedPeriodId})`
    ),
    check(
      "client_subscription_capture_dispatch_receipt_output_ids_check",
      sql`${table.subscriptionExpectedVersion} >= 1
        and ${table.captureApplicationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.contractCanonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.sourceEventDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 32000
        and ${table.dispatchedAt} >= ${table.capturedAt}
        and ${table.dispatchReceiptId} <> ${table.captureApplicationReceiptId}
        and ${table.sourceEventId} <> ${table.captureApplicationReceiptId}
        and ${table.primaryLifecycleEventId} <> ${table.entitlementChangedEventId}
        and ${table.periodId} <> ${table.captureApplicationReceiptId}`
    )
  ]
);

/** Deferred integrity for the focused finance forward migration. */
export const clientSubscriptionCaptureDispatchIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_assert_client_subscription_capture_dispatch_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  capture_row record;
  application_row record;
  contract_row record;
  primary_event_row record;
  entitlement_event_row record;
begin
  select application.id, application.canonical_digest, intent.source_id, semantic.observed_at
    into capture_row
    from finance_online_sale_capture_applications application
    join finance_economic_payment_intents intent
      on intent.id = application.economic_payment_intent_id
    join finance_provider_semantic_facts semantic
      on semantic.id = application.semantic_fact_id
   where application.id = new.capture_application_receipt_id;
  if not found
     or capture_row.canonical_digest <> new.capture_application_digest
     or capture_row.source_id <> new.order_id::text then
    raise exception 'client subscription capture dispatch receipt capture authority is inconsistent'
      using errcode = '23514';
  end if;

  select source_event_id, source_event_digest, evidence_id, subscription_id,
         result_kind, result_version, transition_id
    into application_row
    from client_subscription_event_application_receipts
   where source_event_id = new.source_event_id;
  if not found
     or application_row.source_event_digest <> new.source_event_digest
     or application_row.evidence_id <> new.capture_application_receipt_id
     or application_row.subscription_id <> new.subscription_id
     or application_row.result_kind <> 'applied'
     or application_row.result_version <> new.subscription_expected_version + 1
     or application_row.transition_id is null then
    raise exception 'client subscription capture dispatch receipt source application authority is inconsistent'
      using errcode = '23514';
  end if;

  select id, order_id, canonical_digest
    into contract_row
    from client_subscription_contracts
   where id = new.contract_id;
  if not found
     or contract_row.order_id <> new.order_id
     or contract_row.canonical_digest <> new.contract_canonical_digest then
    raise exception 'client subscription capture dispatch receipt contract authority is inconsistent'
      using errcode = '23514';
  end if;

  if new.capture_kind = 'renewal' and not exists (
    select 1
      from client_subscription_renewal_requests
     where id = new.renewal_request_id
       and subscription_id = new.subscription_id
       and intended_period_id = new.intended_period_id
  ) then
    raise exception 'client subscription capture dispatch receipt renewal authority is inconsistent'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from client_subscription_periods
     where id = new.period_id
       and subscription_id = new.subscription_id
       and capture_evidence_id = new.capture_application_receipt_id
  ) then
    raise exception 'client subscription capture dispatch receipt period authority is inconsistent'
      using errcode = '23514';
  end if;

  select id, transition_id, subscription_id, contract_id, subscription_version, event_type, data
    into primary_event_row
    from client_subscription_lifecycle_events
   where id = new.primary_lifecycle_event_id;
  if not found
     or primary_event_row.subscription_id <> new.subscription_id
     or primary_event_row.contract_id <> new.contract_id
     or primary_event_row.transition_id <> application_row.transition_id
     or primary_event_row.subscription_version <> new.subscription_expected_version + 1
     or primary_event_row.data->>'periodId' <> new.period_id::text
     or (new.capture_kind = 'initial' and primary_event_row.event_type <> 'client_subscription.activated.v1')
     or (new.capture_kind = 'renewal' and primary_event_row.event_type <> 'client_subscription.period_renewed.v1') then
    raise exception 'client subscription capture dispatch receipt primary lifecycle event is inconsistent'
      using errcode = '23514';
  end if;

  select id, transition_id, subscription_id, contract_id, subscription_version, event_type, data
    into entitlement_event_row
    from client_subscription_lifecycle_events
   where id = new.entitlement_changed_event_id;
  if not found
     or entitlement_event_row.transition_id <> primary_event_row.transition_id
     or entitlement_event_row.subscription_id <> new.subscription_id
     or entitlement_event_row.contract_id <> new.contract_id
     or entitlement_event_row.subscription_version <> new.subscription_expected_version + 1
     or entitlement_event_row.event_type <> 'client_subscription.entitlement_changed.v1'
     or entitlement_event_row.data->>'scope' <> 'period'
     or entitlement_event_row.data->>'periodId' <> new.period_id::text then
    raise exception 'client subscription capture dispatch receipt entitlement event is inconsistent'
      using errcode = '23514';
  end if;

  new.captured_at := capture_row.observed_at;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'schemaVersion', 'finance-client-subscription-capture-dispatch-receipt.v1',
    'dispatchReceiptId', new.dispatch_receipt_id,
    'captureApplicationReceiptId', new.capture_application_receipt_id,
    'captureApplicationDigest', capture_row.canonical_digest,
    'orderId', new.order_id,
    'contractId', new.contract_id,
    'contractCanonicalDigest', contract_row.canonical_digest,
    'subscriptionId', new.subscription_id,
    'subscriptionExpectedVersion', new.subscription_expected_version,
    'applicationResultVersion', application_row.result_version,
    'transitionId', application_row.transition_id,
    'captureKind', new.capture_kind,
    'renewalRequestId', new.renewal_request_id,
    'intendedPeriodId', new.intended_period_id,
    'sourceEventId', application_row.source_event_id,
    'sourceEventDigest', application_row.source_event_digest,
    'evidenceId', application_row.evidence_id,
    'periodId', new.period_id,
    'primaryLifecycleEventId', new.primary_lifecycle_event_id,
    'entitlementChangedEventId', new.entitlement_changed_event_id,
    'capturedAt', new.captured_at
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );

  if cardinality(array[
    new.capture_application_receipt_id,
    new.order_id,
    new.contract_id,
    new.subscription_id,
    new.dispatch_receipt_id,
    new.source_event_id,
    new.period_id,
    new.primary_lifecycle_event_id,
    new.entitlement_changed_event_id
  ]) <> cardinality(array(
    select distinct value
      from unnest(array[
        new.capture_application_receipt_id,
        new.order_id,
        new.contract_id,
        new.subscription_id,
        new.dispatch_receipt_id,
        new.source_event_id,
        new.period_id,
        new.primary_lifecycle_event_id,
        new.entitlement_changed_event_id
      ]) as identities(value)
  )) then
    raise exception 'client subscription capture dispatch receipt output identities alias authority identities'
      using errcode = '23514';
  end if;

  if new.canonical_digest <> 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'),
    'hex'
  ) then
    raise exception 'client subscription capture dispatch receipt canonical digest is inconsistent'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger finance_issue_client_subscription_capture_dispatch_receipt
before insert on finance_client_subscription_capture_dispatch_receipts
for each row execute function finance_assert_client_subscription_capture_dispatch_receipt();

create or replace function finance_reject_client_subscription_capture_dispatch_receipt_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'finance client subscription capture dispatch receipt is immutable'
    using errcode = '23514';
end;
$$;

create trigger finance_client_subscription_capture_dispatch_receipts_immutable
before update or delete on finance_client_subscription_capture_dispatch_receipts
for each row execute function finance_reject_client_subscription_capture_dispatch_receipt_mutation();

create trigger finance_client_subscription_capture_dispatch_receipts_no_truncate
before truncate on finance_client_subscription_capture_dispatch_receipts
for each statement execute function finance_reject_client_subscription_capture_dispatch_receipt_mutation();

create or replace function finance_assert_client_subscription_capture_dispatch_installation()
returns void language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_subscription_capture_dispatch_receipt_capture_kind_check'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'client_subscription_capture_dispatch_receipt_output_ids_check'
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_issue_client_subscription_capture_dispatch_receipt'
      and tgrelid = 'finance_client_subscription_capture_dispatch_receipts'::regclass
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_client_subscription_capture_dispatch_receipts_immutable'
      and tgrelid = 'finance_client_subscription_capture_dispatch_receipts'::regclass
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_client_subscription_capture_dispatch_receipts_no_truncate'
      and tgrelid = 'finance_client_subscription_capture_dispatch_receipts'::regclass
  ) then
    raise exception 'client subscription capture dispatch receipt integrity installation is incomplete'
      using errcode = '23514';
  end if;
end;
$$;

do $$
begin
  perform finance_assert_client_subscription_capture_dispatch_installation();
end;
$$;
`;
