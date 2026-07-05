import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { billingCurrencyValues, formatPlatformBillingSqlValues } from "./platform-billing-values";

export const platformPlans = pgTable(
  "platform_plans",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull(),
    monthlyPriceMinor: integer("monthly_price_minor").notNull(),
    yearlyPriceMinor: integer("yearly_price_minor").notNull(),
    currency: text("currency").notNull(),
    platformFeeBps: integer("platform_fee_bps").notNull(),
    seatsLimit: integer("seats_limit"),
    bookingsLimit: integer("bookings_limit"),
    aiRequestsLimit: integer("ai_requests_limit"),
    automationLimit: integer("automation_limit"),
    isPopular: boolean("is_popular").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("platform_plans_code_length_check", sql`length(trim(${table.code})) between 1 and 80`),
    check("platform_plans_name_length_check", sql`length(trim(${table.name})) between 1 and 120`),
    check(
      "platform_plans_tagline_length_check",
      sql`length(trim(${table.tagline})) between 1 and 240`
    ),
    check("platform_plans_monthly_price_minor_check", sql`${table.monthlyPriceMinor} >= 0`),
    check("platform_plans_yearly_price_minor_check", sql`${table.yearlyPriceMinor} >= 0`),
    check(
      "platform_plans_currency_check",
      sql`${table.currency} in ${sql.raw(formatPlatformBillingSqlValues(billingCurrencyValues))}`
    ),
    check(
      "platform_plans_platform_fee_bps_check",
      sql`${table.platformFeeBps} >= 0 and ${table.platformFeeBps} <= 10000`
    ),
    check(
      "platform_plans_seats_limit_check",
      sql`${table.seatsLimit} is null or ${table.seatsLimit} > 0`
    ),
    check(
      "platform_plans_bookings_limit_check",
      sql`${table.bookingsLimit} is null or ${table.bookingsLimit} > 0`
    ),
    check(
      "platform_plans_ai_requests_limit_check",
      sql`${table.aiRequestsLimit} is null or ${table.aiRequestsLimit} > 0`
    ),
    check(
      "platform_plans_automation_limit_check",
      sql`${table.automationLimit} is null or ${table.automationLimit} > 0`
    ),
    check("platform_plans_display_order_check", sql`${table.displayOrder} >= 0`)
  ]
);
