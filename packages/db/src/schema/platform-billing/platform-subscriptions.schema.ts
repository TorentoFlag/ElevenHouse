import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  billingCycleValues,
  formatPlatformBillingSqlValues,
  platformBillingProviderValues,
  platformSubscriptionStatusValues
} from "./platform-billing-values";
import { platformPlans } from "./platform-plans.schema";

export const platformSubscriptions = pgTable(
  "platform_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => platformPlans.id, { onDelete: "restrict" }),
    provider: text("provider").notNull().default("arc_pay"),
    providerSubscriptionId: text("provider_subscription_id"),
    status: text("status").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "platform_subscriptions_provider_check",
      sql`${table.provider} in ${sql.raw(formatPlatformBillingSqlValues(platformBillingProviderValues))}`
    ),
    check(
      "platform_subscriptions_status_check",
      sql`${table.status} in ${sql.raw(formatPlatformBillingSqlValues(platformSubscriptionStatusValues))}`
    ),
    check(
      "platform_subscriptions_billing_cycle_check",
      sql`${table.billingCycle} in ${sql.raw(formatPlatformBillingSqlValues(billingCycleValues))}`
    ),
    index("platform_subscriptions_owner_created_idx").on(table.ownerUserId, table.createdAt),
    uniqueIndex("platform_subscriptions_current_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.isCurrent} = true`)
  ]
);
