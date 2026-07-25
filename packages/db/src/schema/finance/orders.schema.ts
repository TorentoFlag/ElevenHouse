import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clientJoinIntents } from "../clients/client-join-intents.schema";
import { users } from "../identity/accounts.schema";
import { products } from "../products/products.schema";
import {
  financeCurrencyValues,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  orderStatusValues
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
    index("orders_client_created_idx").on(table.clientUserId, table.createdAt, table.id),
    index("orders_astrologer_created_idx").on(table.astrologerUserId, table.createdAt, table.id),
    index("orders_status_created_idx").on(table.status, table.createdAt, table.id)
  ]
);
