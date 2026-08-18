import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { mediaAssets } from "../media/media-assets.schema";
import {
  astroDiaryClientResponseWindowCalendarDaysBounds,
  astroDiaryReflectionCyclesPerPeriodBounds,
  astroDiaryResponseSlaWorkingDaysBounds,
  astroDiaryWorkingWeekdaysMaskBounds
} from "@elevenhouse/validation/products";
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

const astroDiaryReflectionCyclesPerPeriodMinSql = sql.raw(
  String(astroDiaryReflectionCyclesPerPeriodBounds.min)
);
const astroDiaryReflectionCyclesPerPeriodMaxSql = sql.raw(
  String(astroDiaryReflectionCyclesPerPeriodBounds.max)
);
const astroDiaryResponseSlaWorkingDaysMinSql = sql.raw(
  String(astroDiaryResponseSlaWorkingDaysBounds.min)
);
const astroDiaryResponseSlaWorkingDaysMaxSql = sql.raw(
  String(astroDiaryResponseSlaWorkingDaysBounds.max)
);
const astroDiaryClientResponseWindowCalendarDaysMinSql = sql.raw(
  String(astroDiaryClientResponseWindowCalendarDaysBounds.min)
);
const astroDiaryClientResponseWindowCalendarDaysMaxSql = sql.raw(
  String(astroDiaryClientResponseWindowCalendarDaysBounds.max)
);
const astroDiaryWorkingWeekdaysMaskMinSql = sql.raw(
  String(astroDiaryWorkingWeekdaysMaskBounds.min)
);
const astroDiaryWorkingWeekdaysMaskMaxSql = sql.raw(
  String(astroDiaryWorkingWeekdaysMaskBounds.max)
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    coverMediaId: uuid("cover_media_id").references(() => mediaAssets.id, {
      onDelete: "set null"
    }),
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
    astroDiaryReflectionCyclesPerPeriod: integer("astro_diary_reflection_cycles_per_period"),
    astroDiaryResponseSlaWorkingDays: integer("astro_diary_response_sla_working_days"),
    astroDiaryClientResponseWindowCalendarDays: integer(
      "astro_diary_client_response_window_calendar_days"
    ),
    astroDiaryWorkingWeekdaysMask: integer("astro_diary_working_weekdays_mask"),
    astroDiaryServiceTimezone: text("astro_diary_service_timezone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("products_id_owner_unique").on(table.id, table.ownerUserId),
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
    check("products_revision_check", sql`${table.revision} >= 1`),
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
    check("products_trial_days_check", sql`${table.trialDays} is null or ${table.trialDays} >= 0`),
    check("products_group_size_check", sql`${table.groupSize} is null or ${table.groupSize} > 0`),
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
    check(
      "products_astro_diary_config_completeness_check",
      sql`num_nonnulls(${table.astroDiaryReflectionCyclesPerPeriod}, ${table.astroDiaryResponseSlaWorkingDays}, ${table.astroDiaryClientResponseWindowCalendarDays}, ${table.astroDiaryWorkingWeekdaysMask}, ${table.astroDiaryServiceTimezone}) in (0, 5)`
    ),
    check(
      "products_astro_diary_shape_check",
      sql`${table.astroDiaryReflectionCyclesPerPeriod} is null or (${table.type} = 'async' and ${table.paymentModel} = 'once' and ${table.subscriptionPeriod} in ${sql.raw(
        formatSqlValues(productSubscriptionPeriodValues)
      )} and ${table.executionMode} = 'async' and ${table.participantMode} = 'solo' and ${table.durationMinutes} is null and ${table.durationLabel} is null and ${table.slaLabel} is null and ${table.packageSessionCount} is null and ${table.packageDiscountPercent} is null and ${table.trialDays} is null and ${table.groupSize} is null)`
    ),
    check(
      "products_astro_diary_reflection_cycles_check",
      sql`${table.astroDiaryReflectionCyclesPerPeriod} is null or ${table.astroDiaryReflectionCyclesPerPeriod} between ${astroDiaryReflectionCyclesPerPeriodMinSql} and ${astroDiaryReflectionCyclesPerPeriodMaxSql}`
    ),
    check(
      "products_astro_diary_response_sla_check",
      sql`${table.astroDiaryResponseSlaWorkingDays} is null or ${table.astroDiaryResponseSlaWorkingDays} between ${astroDiaryResponseSlaWorkingDaysMinSql} and ${astroDiaryResponseSlaWorkingDaysMaxSql}`
    ),
    check(
      "products_astro_diary_client_response_window_check",
      sql`${table.astroDiaryClientResponseWindowCalendarDays} is null or ${table.astroDiaryClientResponseWindowCalendarDays} between ${astroDiaryClientResponseWindowCalendarDaysMinSql} and ${astroDiaryClientResponseWindowCalendarDaysMaxSql}`
    ),
    check(
      "products_astro_diary_working_weekdays_mask_check",
      sql`${table.astroDiaryWorkingWeekdaysMask} is null or ${table.astroDiaryWorkingWeekdaysMask} between ${astroDiaryWorkingWeekdaysMaskMinSql} and ${astroDiaryWorkingWeekdaysMaskMaxSql}`
    ),
    check(
      "products_astro_diary_service_timezone_check",
      sql`${table.astroDiaryServiceTimezone} is null or (length(trim(${table.astroDiaryServiceTimezone})) between 1 and 100 and ${table.astroDiaryServiceTimezone} = trim(${table.astroDiaryServiceTimezone}))`
    ),
    index("products_owner_created_id_idx").on(table.ownerUserId, table.createdAt, table.id),
    index("products_owner_status_created_id_idx").on(
      table.ownerUserId,
      table.status,
      table.createdAt,
      table.id
    )
  ]
);
