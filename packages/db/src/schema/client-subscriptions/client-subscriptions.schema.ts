import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { clientSubscriptionContracts } from "./client-subscription-contracts.schema";
import { clientSubscriptionSlots } from "./client-subscription-slots.schema";

export const clientSubscriptions = pgTable(
  "client_subscriptions",
  {
    id: uuid("id").primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => clientSubscriptionContracts.id, { onDelete: "restrict" }),
    relationshipId: uuid("relationship_id").notNull(),
    productId: uuid("product_id").notNull(),
    journalEpochId: uuid("journal_epoch_id").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    cancellationEffectiveAt: timestamp("cancellation_effective_at", { withTimezone: true }),
    currentPeriodId: uuid("current_period_id"),
    futurePeriodId: uuid("future_period_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscriptions_contract_unique").on(table.contractId),
    unique("client_subscriptions_epoch_unique").on(table.journalEpochId),
    unique("client_subscriptions_exact_identity_unique").on(
      table.id,
      table.contractId,
      table.relationshipId,
      table.productId,
      table.journalEpochId
    ),
    unique("client_subscriptions_id_contract_unique").on(table.id, table.contractId),
    unique("client_subscriptions_projection_scope_unique").on(
      table.id,
      table.contractId,
      table.relationshipId,
      table.journalEpochId
    ),
    foreignKey({
      columns: [table.contractId, table.relationshipId, table.productId],
      foreignColumns: [
        clientSubscriptionContracts.id,
        clientSubscriptionContracts.relationshipId,
        clientSubscriptionContracts.productId
      ],
      name: "client_subscriptions_contract_scope_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.relationshipId, table.productId],
      foreignColumns: [clientSubscriptionSlots.relationshipId, clientSubscriptionSlots.productId],
      name: "client_subscriptions_slot_fk"
    }).onDelete("restrict"),
    check(
      "client_subscriptions_state_check",
      sql`${table.state} in ('pending_initial_payment', 'active', 'ended', 'revoked')`
    ),
    check("client_subscriptions_version_check", sql`${table.version} >= 1`),
    check(
      "client_subscriptions_state_pointer_shape_check",
      sql`(
        ${table.state} = 'pending_initial_payment'
        and ${table.currentPeriodId} is null
        and ${table.futurePeriodId} is null
        and ${table.cancellationEffectiveAt} is null
      ) or (
        ${table.state} = 'active'
        and ${table.currentPeriodId} is not null
        and ${table.cancellationEffectiveAt} is null
      ) or (
        ${table.state} = 'ended'
        and ${table.currentPeriodId} is null
        and ${table.futurePeriodId} is null
        and ${table.cancellationEffectiveAt} is null
      ) or (
        ${table.state} = 'revoked'
        and ${table.currentPeriodId} is null
        and ${table.futurePeriodId} is null
        and ${table.cancellationEffectiveAt} is null
      )`
    ),
    check(
      "client_subscriptions_distinct_period_pointers_check",
      sql`${table.futurePeriodId} is null or ${table.futurePeriodId} <> ${table.currentPeriodId}`
    ),
    uniqueIndex("client_subscriptions_current_relationship_product_unique")
      .on(table.relationshipId, table.productId)
      .where(sql`${table.state} in ('pending_initial_payment', 'active')`),
    index("client_subscriptions_contract_state_idx").on(table.contractId, table.state),
    index("client_subscriptions_relationship_state_idx").on(table.relationshipId, table.state)
  ]
);
