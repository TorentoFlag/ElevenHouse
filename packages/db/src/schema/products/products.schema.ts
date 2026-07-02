import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  formatSqlValues,
  productCurrencyValues,
  productExecutionModeValues,
  productParticipantModeValues,
  productPaymentModelValues,
  productStatusValues,
  productSubscriptionPeriodValues,
  productTypeValues
} from "./product-values";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    coverMediaId: text("cover_media_id"),
    introVideoUrl: text("intro_video_url"),
    executionMode: text("execution_mode").notNull(),
    paymentModel: text("payment_model").notNull(),
    durationMinutes: integer("duration_minutes"),
    durationLabel: text("duration_label"),
    slaLabel: text("sla_label"),
    packageSessionCount: integer("package_session_count"),
    packageDiscountPercent: integer("package_discount_percent"),
    subscriptionPeriod: text("subscription_period"),
    trialDays: integer("trial_days"),
    participantMode: text("participant_mode").notNull(),
    groupSize: integer("group_size"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "products_status_check",
      sql`${table.status} in ${sql.raw(formatSqlValues(productStatusValues))}`
    ),
    check(
      "products_type_check",
      sql`${table.type} in ${sql.raw(formatSqlValues(productTypeValues))}`
    ),
    check(
      "products_currency_check",
      sql`${table.currency} in ${sql.raw(formatSqlValues(productCurrencyValues))}`
    ),
    check(
      "products_execution_mode_check",
      sql`${table.executionMode} in ${sql.raw(formatSqlValues(productExecutionModeValues))}`
    ),
    check(
      "products_payment_model_check",
      sql`${table.paymentModel} in ${sql.raw(formatSqlValues(productPaymentModelValues))}`
    ),
    check(
      "products_participant_mode_check",
      sql`${table.participantMode} in ${sql.raw(formatSqlValues(productParticipantModeValues))}`
    ),
    check("products_price_minor_check", sql`${table.priceMinor} >= 0`),
    check(
      "products_duration_minutes_check",
      sql`${table.durationMinutes} is null or ${table.durationMinutes} > 0`
    ),
    check(
      "products_package_session_count_check",
      sql`${table.packageSessionCount} is null or ${table.packageSessionCount} > 0`
    ),
    check(
      "products_package_discount_percent_check",
      sql`${table.packageDiscountPercent} is null or (${table.packageDiscountPercent} >= 0 and ${table.packageDiscountPercent} <= 100)`
    ),
    check(
      "products_subscription_period_check",
      sql`${table.subscriptionPeriod} is null or ${table.subscriptionPeriod} in ${sql.raw(
        formatSqlValues(productSubscriptionPeriodValues)
      )}`
    ),
    check(
      "products_trial_days_check",
      sql`${table.trialDays} is null or ${table.trialDays} >= 0`
    ),
    check(
      "products_group_size_check",
      sql`${table.groupSize} is null or ${table.groupSize} > 0`
    ),
    check(
      "products_free_price_check",
      sql`${table.paymentModel} <> 'free' or ${table.priceMinor} = 0`
    ),
    check(
      "products_package_settings_check",
      sql`${table.paymentModel} <> 'pack' or ${table.packageSessionCount} is not null`
    ),
    check(
      "products_subscription_settings_check",
      sql`${table.paymentModel} <> 'sub' or ${table.subscriptionPeriod} is not null`
    ),
    check(
      "products_group_settings_check",
      sql`${table.participantMode} <> 'group' or ${table.groupSize} is not null`
    ),
    index("products_owner_status_idx").on(table.ownerUserId, table.status)
  ]
);
