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
  formatPlatformBillingSqlValues,
  platformBillingProviderValues
} from "./platform-billing-values";

export const billingPaymentMethods = pgTable(
  "billing_payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerPaymentMethodId: text("provider_payment_method_id").notNull(),
    brand: text("brand").notNull(),
    last4: text("last4").notNull(),
    expiresAt: text("expires_at").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "billing_payment_methods_provider_check",
      sql`${table.provider} in ${sql.raw(formatPlatformBillingSqlValues(platformBillingProviderValues))}`
    ),
    check(
      "billing_payment_methods_brand_length_check",
      sql`length(trim(${table.brand})) between 1 and 40`
    ),
    check("billing_payment_methods_last4_check", sql`${table.last4} ~ '^[0-9]{4}$'`),
    check(
      "billing_payment_methods_expires_at_check",
      sql`${table.expiresAt} ~ '^[0-9]{2}/[0-9]{2}$'`
    ),
    index("billing_payment_methods_owner_created_idx").on(table.ownerUserId, table.createdAt),
    uniqueIndex("billing_payment_methods_provider_method_unique").on(
      table.provider,
      table.providerPaymentMethodId
    ),
    uniqueIndex("billing_payment_methods_default_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.isDefault} = true`)
  ]
);
