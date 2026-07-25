import { sql } from "drizzle-orm";
import {
  bigint,
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
import { clientJoinIntents } from "../clients/client-join-intents.schema";
import { users } from "../identity/accounts.schema";
import { products } from "../products/products.schema";
import { bookings } from "../scheduling/bookings.schema";
import {
  financeCurrencyValues,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  orderStatusValues,
  riskTierValues
} from "./finance-values";
import { financePolicies } from "./policies.schema";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    directLinkIntentId: uuid("direct_link_intent_id").references(() => clientJoinIntents.id, {
      onDelete: "set null"
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending_payment"),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }).notNull(),
    grossCurrency: text("gross_currency").notNull(),
    platformFeeAmountMinor: bigint("platform_fee_amount_minor", { mode: "number" }).notNull(),
    platformFeeCurrency: text("platform_fee_currency").notNull(),
    astrologerNetAmountMinor: bigint("astrologer_net_amount_minor", {
      mode: "number"
    }).notNull(),
    astrologerNetCurrency: text("astrologer_net_currency").notNull(),
    financePolicySnapshotId: uuid("finance_policy_snapshot_id")
      .notNull()
      .references(() => financePolicies.id, { onDelete: "restrict" }),
    financePolicyRiskTier: text("finance_policy_risk_tier").notNull().default("standard"),
    financePolicyHoldDurationHours: integer("finance_policy_hold_duration_hours")
      .notNull()
      .default(48),
    financePolicyReserveBps: integer("finance_policy_reserve_bps").notNull().default(0),
    financePolicyReserveReleaseDelayDays: integer("finance_policy_reserve_release_delay_days")
      .notNull()
      .default(0),
    financePolicyPlatformFeeBps: integer("finance_policy_platform_fee_bps")
      .notNull()
      .default(1000),
    financePolicyProviderSettlementRequired: boolean(
      "finance_policy_provider_settlement_required"
    )
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "orders_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(orderStatusValues))}`
    ),
    check(
      "orders_money_currency_check",
      sql`${table.grossCurrency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))} and ${table.platformFeeCurrency} = ${table.grossCurrency} and ${table.astrologerNetCurrency} = ${table.grossCurrency}`
    ),
    check(
      "orders_money_amount_check",
      sql`${table.grossAmountMinor} >= 0 and ${table.grossAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.platformFeeAmountMinor} >= 0 and ${table.platformFeeAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.astrologerNetAmountMinor} >= 0 and ${table.astrologerNetAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "orders_money_allocation_check",
      sql`${table.grossAmountMinor} = ${table.platformFeeAmountMinor} + ${table.astrologerNetAmountMinor}`
    ),
    check(
      "orders_finance_policy_risk_tier_check",
      sql`${table.financePolicyRiskTier} in ${sql.raw(formatFinanceSqlValues(riskTierValues))}`
    ),
    check(
      "orders_finance_policy_hold_duration_check",
      sql`${table.financePolicyHoldDurationHours} between 0 and 4320`
    ),
    check(
      "orders_finance_policy_reserve_bps_check",
      sql`${table.financePolicyReserveBps} between 0 and 10000`
    ),
    check(
      "orders_finance_policy_reserve_release_check",
      sql`${table.financePolicyReserveReleaseDelayDays} between 0 and 540`
    ),
    check(
      "orders_finance_policy_platform_fee_check",
      sql`${table.financePolicyPlatformFeeBps} between 0 and 10000`
    ),
    index("orders_client_created_idx").on(table.clientUserId, table.createdAt, table.id),
    index("orders_astrologer_created_idx").on(table.astrologerUserId, table.createdAt, table.id),
    index("orders_status_created_idx").on(table.status, table.createdAt, table.id),
    uniqueIndex("orders_booking_unique").on(table.bookingId)
  ]
);
