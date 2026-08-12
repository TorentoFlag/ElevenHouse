import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { clientSubscriptionPeriods } from "./client-subscription-periods.schema";
import { clientSubscriptionTransitionReceipts } from "./client-subscription-lifecycle.schema";
import { clientSubscriptions } from "./client-subscriptions.schema";

export const clientEntitlementTransitionApplications = pgTable(
  "client_entitlement_transition_applications",
  {
    id: uuid("id").primaryKey(),
    transitionId: uuid("transition_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    subscriptionVersion: integer("subscription_version").notNull(),
    scope: text("scope").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_entitlement_transition_applications_transition_unique").on(table.transitionId),
    unique("client_entitlement_transition_applications_subscription_version_unique").on(
      table.subscriptionId,
      table.subscriptionVersion
    ),
    unique("client_entitlement_transition_applications_exact_identity_unique").on(
      table.id,
      table.subscriptionId,
      table.transitionId
    ),
    unique("client_entitlement_transition_applications_id_subscription_unique").on(
      table.id,
      table.subscriptionId
    ),
    foreignKey({
      columns: [table.transitionId, table.subscriptionId, table.subscriptionVersion],
      foreignColumns: [
        clientSubscriptionTransitionReceipts.transitionId,
        clientSubscriptionTransitionReceipts.subscriptionId,
        clientSubscriptionTransitionReceipts.subscriptionVersion
      ],
      name: "client_entitlement_transition_applications_transition_fk"
    }).onDelete("restrict"),
    check(
      "client_entitlement_transition_applications_scope_check",
      sql`${table.scope} in ('period', 'subscription_all')`
    )
  ]
);

export const clientEntitlementGrants = pgTable(
  "client_entitlement_grants",
  {
    id: uuid("id").primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
    journalEpochId: uuid("journal_epoch_id").notNull(),
    periodId: uuid("period_id").notNull(),
    capability: text("capability").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    sourceTransitionId: uuid("source_transition_id").notNull(),
    sourceSubscriptionVersion: integer("source_subscription_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_entitlement_grants_subscription_period_capability_unique").on(
      table.subscriptionId,
      table.periodId,
      table.capability
    ),
    unique("client_entitlement_grants_exact_identity_unique").on(
      table.id,
      table.subscriptionId,
      table.periodId
    ),
    unique("client_entitlement_grants_id_subscription_unique").on(table.id, table.subscriptionId),
    foreignKey({
      columns: [table.subscriptionId, table.contractId, table.relationshipId, table.journalEpochId],
      foreignColumns: [
        clientSubscriptions.id,
        clientSubscriptions.contractId,
        clientSubscriptions.relationshipId,
        clientSubscriptions.journalEpochId
      ],
      name: "client_entitlement_grants_subscription_scope_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.periodId,
        table.subscriptionId,
        table.contractId,
        table.startsAt,
        table.endsAt
      ],
      foreignColumns: [
        clientSubscriptionPeriods.id,
        clientSubscriptionPeriods.subscriptionId,
        clientSubscriptionPeriods.contractId,
        clientSubscriptionPeriods.startsAt,
        clientSubscriptionPeriods.endsAt
      ],
      name: "client_entitlement_grants_period_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceTransitionId, table.subscriptionId, table.sourceSubscriptionVersion],
      foreignColumns: [
        clientSubscriptionTransitionReceipts.transitionId,
        clientSubscriptionTransitionReceipts.subscriptionId,
        clientSubscriptionTransitionReceipts.subscriptionVersion
      ],
      name: "client_entitlement_grants_source_transition_fk"
    }).onDelete("restrict"),
    check("client_entitlement_grants_capability_check", sql`${table.capability} = 'astro_diary'`),
    check(
      "client_entitlement_grants_state_check",
      sql`${table.state} in ('active', 'ended', 'revoked')`
    ),
    check(
      "client_entitlement_grants_half_open_range_check",
      sql`${table.startsAt} < ${table.endsAt}`
    ),
    check(
      "client_entitlement_grants_version_check",
      sql`${table.version} >= 1 and ${table.sourceSubscriptionVersion} >= 2`
    )
  ]
);

export const clientEntitlementTransitionEffects = pgTable(
  "client_entitlement_transition_effects",
  {
    applicationId: uuid("application_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    grantId: uuid("grant_id").notNull(),
    beforeVersion: integer("before_version"),
    beforeState: text("before_state"),
    afterVersion: integer("after_version").notNull(),
    afterState: text("after_state").notNull()
  },
  (table) => [
    unique("client_entitlement_transition_effects_application_grant_unique").on(
      table.applicationId,
      table.grantId
    ),
    foreignKey({
      columns: [table.applicationId, table.subscriptionId],
      foreignColumns: [
        clientEntitlementTransitionApplications.id,
        clientEntitlementTransitionApplications.subscriptionId
      ],
      name: "client_entitlement_transition_effects_application_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.grantId, table.subscriptionId],
      foreignColumns: [clientEntitlementGrants.id, clientEntitlementGrants.subscriptionId],
      name: "client_entitlement_transition_effects_grant_fk"
    }).onDelete("restrict"),
    check(
      "client_entitlement_transition_effects_version_check",
      sql`(
          ${table.beforeVersion} is null
          and ${table.beforeState} is null
          and ${table.afterVersion} = 1
        ) or (
          ${table.beforeVersion} is not null
          and ${table.beforeState} = 'active'
          and ${table.afterVersion} = ${table.beforeVersion} + 1
        )`
    ),
    check(
      "client_entitlement_transition_effects_state_check",
      sql`${table.afterState} in ('active', 'ended', 'revoked')`
    )
  ]
);
