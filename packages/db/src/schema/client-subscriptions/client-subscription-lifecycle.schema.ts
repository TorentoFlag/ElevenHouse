import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { clientSubscriptionPeriods } from "./client-subscription-periods.schema";
import { clientSubscriptions } from "./client-subscriptions.schema";

export const clientSubscriptionTransitionReceipts = pgTable(
  "client_subscription_transition_receipts",
  {
    transitionId: uuid("transition_id").primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
    journalEpochId: uuid("journal_epoch_id").notNull(),
    subscriptionVersion: integer("subscription_version").notNull(),
    state: text("state").notNull(),
    entitlementState: text("entitlement_state").notNull(),
    entitlementScope: text("entitlement_scope").notNull(),
    primaryEventType: text("primary_event_type").notNull(),
    slotEffect: text("slot_effect").notNull(),
    periodId: uuid("period_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_transition_receipts_subscription_version_unique").on(
      table.subscriptionId,
      table.subscriptionVersion
    ),
    unique("client_subscription_transition_receipts_exact_identity_unique").on(
      table.transitionId,
      table.subscriptionId,
      table.contractId,
      table.subscriptionVersion
    ),
    unique("client_subscription_transition_receipts_subscription_identity_unique").on(
      table.transitionId,
      table.subscriptionId
    ),
    unique("client_subscription_transition_receipts_projection_source_unique").on(
      table.transitionId,
      table.subscriptionId,
      table.subscriptionVersion
    ),
    foreignKey({
      columns: [table.subscriptionId, table.contractId, table.relationshipId, table.journalEpochId],
      foreignColumns: [
        clientSubscriptions.id,
        clientSubscriptions.contractId,
        clientSubscriptions.relationshipId,
        clientSubscriptions.journalEpochId
      ],
      name: "client_subscription_transition_receipts_subscription_scope_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.periodId, table.subscriptionId],
      foreignColumns: [clientSubscriptionPeriods.id, clientSubscriptionPeriods.subscriptionId],
      name: "client_subscription_transition_receipts_period_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_transition_receipts_version_check",
      sql`${table.subscriptionVersion} >= 2`
    ),
    check(
      "client_subscription_transition_receipts_state_check",
      sql`${table.state} in ('active', 'ended', 'revoked')`
    ),
    check(
      "client_subscription_transition_receipts_entitlement_check",
      sql`${table.entitlementState} in ('active', 'ended', 'revoked')
        and ${table.entitlementScope} in ('none', 'period', 'subscription_all')
        and (
          (${table.primaryEventType} = 'client_subscription.initial_payment_ended.v1'
            and ${table.entitlementScope} = 'none'
            and ${table.periodId} is null
            and ${table.entitlementState} = 'ended'
            and ${table.state} = 'ended'
            and ${table.slotEffect} = 'release')
          or (${table.primaryEventType} = 'client_subscription.activated.v1'
            and ${table.entitlementScope} = 'period'
            and ${table.periodId} is not null
            and ${table.entitlementState} = 'active'
            and ${table.state} = 'active')
          or (${table.primaryEventType} = 'client_subscription.period_ended.v1'
            and ${table.entitlementScope} = 'period'
            and ${table.periodId} is not null
            and ${table.entitlementState} = 'ended'
            and ${table.state} in ('active', 'ended'))
          or (${table.primaryEventType} = 'client_subscription.revoked.v1'
            and ${table.entitlementScope} = 'subscription_all'
            and ${table.periodId} is null
            and ${table.entitlementState} = 'revoked')
        )`
    ),
    check(
      "client_subscription_transition_receipts_primary_event_check",
      sql`${table.primaryEventType} in (
        'client_subscription.initial_payment_ended.v1',
        'client_subscription.activated.v1',
        'client_subscription.period_ended.v1',
        'client_subscription.revoked.v1'
      )`
    ),
    check(
      "client_subscription_transition_receipts_slot_effect_check",
      sql`${table.slotEffect} in ('retain', 'release')
        and (${table.slotEffect} = 'retain' or ${table.state} in ('ended', 'revoked'))`
    )
  ]
);

export const clientSubscriptionLifecycleEvents = pgTable(
  "client_subscription_lifecycle_events",
  {
    id: uuid("id").primaryKey(),
    transitionId: uuid("transition_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    subscriptionVersion: integer("subscription_version").notNull(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull()
  },
  (table) => [
    unique("client_subscription_lifecycle_events_transition_type_unique").on(
      table.transitionId,
      table.eventType
    ),
    foreignKey({
      columns: [
        table.transitionId,
        table.subscriptionId,
        table.contractId,
        table.subscriptionVersion
      ],
      foreignColumns: [
        clientSubscriptionTransitionReceipts.transitionId,
        clientSubscriptionTransitionReceipts.subscriptionId,
        clientSubscriptionTransitionReceipts.contractId,
        clientSubscriptionTransitionReceipts.subscriptionVersion
      ],
      name: "client_subscription_lifecycle_events_transition_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_lifecycle_events_type_check",
      sql`${table.eventType} in (
        'client_subscription.initial_payment_ended.v1',
        'client_subscription.activated.v1',
        'client_subscription.period_ended.v1',
        'client_subscription.revoked.v1',
        'client_subscription.entitlement_changed.v1'
      )`
    ),
    check(
      "client_subscription_lifecycle_events_schema_version_check",
      sql`${table.schemaVersion} = 1`
    ),
    check(
      "client_subscription_lifecycle_events_envelope_check",
      sql`jsonb_typeof(${table.data}) = 'object'
        and ${table.data}->>'subscriptionId' = ${table.subscriptionId}::text
        and ${table.data}->>'contractId' = ${table.contractId}::text`
    ),
    check(
      "client_subscription_lifecycle_events_data_shape_check",
      sql`(
        ${table.eventType} = 'client_subscription.initial_payment_ended.v1'
        and ${table.data}->>'reason' in ('checkout_expired', 'payment_failed')
        and jsonb_typeof(${table.data}->'financeEvidenceId') = 'string'
        and ${table.data} - ARRAY['subscriptionId','contractId','financeEvidenceId','reason']::text[] = '{}'::jsonb
      ) or (
        ${table.eventType} in (
          'client_subscription.activated.v1',
          'client_subscription.period_ended.v1'
        )
        and jsonb_typeof(${table.data}->'periodId') = 'string'
        and ${table.data} - ARRAY['subscriptionId','contractId','periodId']::text[] = '{}'::jsonb
      ) or (
        ${table.eventType} = 'client_subscription.revoked.v1'
        and jsonb_typeof(${table.data}->'periodId') = 'string'
        and jsonb_typeof(${table.data}->'financeEvidenceId') = 'string'
        and ${table.data} - ARRAY['subscriptionId','contractId','periodId','financeEvidenceId']::text[] = '{}'::jsonb
      ) or (
        ${table.eventType} = 'client_subscription.entitlement_changed.v1'
        and ${table.data}->>'scope' in ('period', 'subscription_all')
        and jsonb_typeof(${table.data}->'relationshipId') = 'string'
        and jsonb_typeof(${table.data}->'journalEpochId') = 'string'
        and (
          (${table.data}->>'scope' = 'period'
            and jsonb_typeof(${table.data}->'periodId') = 'string'
            and ${table.data} - ARRAY['subscriptionId','contractId','scope','relationshipId','journalEpochId','periodId']::text[] = '{}'::jsonb)
          or (${table.data}->>'scope' = 'subscription_all'
            and ${table.data} - ARRAY['subscriptionId','contractId','scope','relationshipId','journalEpochId']::text[] = '{}'::jsonb)
        )
      )`
    )
  ]
);
