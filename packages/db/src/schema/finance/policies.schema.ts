import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { formatFinanceSqlValues, riskTierValues } from "./finance-values";

export const financePolicies = pgTable(
  "finance_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyVersion: integer("policy_version").notNull(),
    riskTier: text("risk_tier").notNull(),
    holdDurationHours: integer("hold_duration_hours").notNull().default(48),
    reserveBps: integer("reserve_bps").notNull().default(0),
    reserveReleaseDelayDays: integer("reserve_release_delay_days").notNull().default(0),
    platformFeeBps: integer("platform_fee_bps").notNull(),
    providerSettlementRequired: boolean("provider_settlement_required").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    snapshottedAt: timestamp("snapshotted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "finance_policies_risk_tier_check",
      sql`${table.riskTier} in ${sql.raw(formatFinanceSqlValues(riskTierValues))}`
    ),
    check(
      "finance_policies_hold_duration_check",
      sql`${table.holdDurationHours} between 0 and 4320`
    ),
    check("finance_policies_reserve_bps_check", sql`${table.reserveBps} between 0 and 10000`),
    check(
      "finance_policies_reserve_release_delay_check",
      sql`${table.reserveReleaseDelayDays} between 0 and 540`
    ),
    check(
      "finance_policies_platform_fee_bps_check",
      sql`${table.platformFeeBps} between 0 and 10000`
    ),
    uniqueIndex("finance_policies_version_unique").on(table.policyVersion),
    uniqueIndex("finance_policies_active_risk_tier_unique")
      .on(table.riskTier)
      .where(sql`${table.isActive} = true`),
    index("finance_policies_risk_version_idx").on(table.riskTier, table.policyVersion)
  ]
);

export const astrologerRiskProfiles = pgTable(
  "astrologer_risk_profiles",
  {
    astrologerUserId: uuid("astrologer_user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    riskTier: text("risk_tier").notNull().default("standard"),
    manualRiskTier: text("manual_risk_tier"),
    manualOverrideReason: text("manual_override_reason"),
    holdDurationHoursOverride: integer("hold_duration_hours_override"),
    reserveBpsOverride: integer("reserve_bps_override"),
    reserveReleaseDelayDaysOverride: integer("reserve_release_delay_days_override"),
    platformFeeBpsOverride: integer("platform_fee_bps_override"),
    providerSettlementRequiredOverride: boolean("provider_settlement_required_override"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "astrologer_risk_profiles_risk_tier_check",
      sql`${table.riskTier} in ${sql.raw(formatFinanceSqlValues(riskTierValues))}`
    ),
    check(
      "astrologer_risk_profiles_manual_risk_tier_check",
      sql`${table.manualRiskTier} is null or ${table.manualRiskTier} in ${sql.raw(
        formatFinanceSqlValues(riskTierValues)
      )}`
    ),
    check(
      "astrologer_risk_profiles_hold_override_check",
      sql`${table.holdDurationHoursOverride} is null or ${table.holdDurationHoursOverride} between 0 and 4320`
    ),
    check(
      "astrologer_risk_profiles_reserve_override_check",
      sql`${table.reserveBpsOverride} is null or ${table.reserveBpsOverride} between 0 and 10000`
    ),
    check(
      "astrologer_risk_profiles_reserve_release_override_check",
      sql`${table.reserveReleaseDelayDaysOverride} is null or ${table.reserveReleaseDelayDaysOverride} between 0 and 540`
    ),
    check(
      "astrologer_risk_profiles_fee_override_check",
      sql`${table.platformFeeBpsOverride} is null or ${table.platformFeeBpsOverride} between 0 and 10000`
    ),
    check(
      "astrologer_risk_profiles_manual_override_check",
      sql`(${table.manualRiskTier} is null and ${table.manualOverrideReason} is null and ${table.reviewedByUserId} is null and ${table.reviewedAt} is null) or (${table.manualRiskTier} is not null and ${table.manualOverrideReason} is not null and length(trim(${table.manualOverrideReason})) between 1 and 2000 and ${table.reviewedByUserId} is not null and ${table.reviewedAt} is not null)`
    ),
    index("astrologer_risk_profiles_risk_tier_idx").on(table.riskTier)
  ]
);
