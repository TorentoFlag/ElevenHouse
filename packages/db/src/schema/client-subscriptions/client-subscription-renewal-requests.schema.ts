import { foreignKey, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { clientSubscriptionPeriods } from "./client-subscription-periods.schema";
import { clientSubscriptions } from "./client-subscriptions.schema";

export const clientSubscriptionRenewalRequests = pgTable(
  "client_subscription_renewal_requests",
  {
    id: uuid("id").primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    sourcePeriodId: uuid("source_period_id").notNull(),
    intendedPeriodId: uuid("intended_period_id").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_renewal_requests_exact_identity_unique").on(
      table.id,
      table.subscriptionId,
      table.intendedPeriodId
    ),
    unique("client_subscription_renewal_requests_subscription_intended_unique").on(
      table.subscriptionId,
      table.intendedPeriodId
    ),
    foreignKey({
      columns: [table.subscriptionId],
      foreignColumns: [clientSubscriptions.id],
      name: "client_subscription_renewal_requests_subscription_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourcePeriodId, table.subscriptionId],
      foreignColumns: [clientSubscriptionPeriods.id, clientSubscriptionPeriods.subscriptionId],
      name: "client_subscription_renewal_requests_source_period_fk"
    }).onDelete("restrict")
  ]
);
