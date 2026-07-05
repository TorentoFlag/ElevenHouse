import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { platformPlans } from "./platform-plans.schema";
import {
  formatPlatformBillingSqlValues,
  platformPlanFeatureValues
} from "./platform-billing-values";

export const platformPlanFeatures = pgTable(
  "platform_plan_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: text("plan_id")
      .notNull()
      .references(() => platformPlans.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    order: integer("order").notNull()
  },
  (table) => [
    check(
      "platform_plan_features_value_check",
      sql`${table.value} in ${sql.raw(formatPlatformBillingSqlValues(platformPlanFeatureValues))}`
    ),
    check("platform_plan_features_order_check", sql`${table.order} >= 0`),
    index("platform_plan_features_plan_id_idx").on(table.planId),
    uniqueIndex("platform_plan_features_plan_value_unique").on(table.planId, table.value)
  ]
);
