import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  financeCurrencyValues,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  ledgerAccountTypeValues,
  ledgerEntrySideValues,
  ledgerOperationTypeValues,
  walletBalanceBucketValues
} from "./finance-values";
import { orders } from "./orders.schema";
import { payoutRequests } from "./payouts.schema";

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountType: text("account_type").notNull(),
    astrologerUserId: uuid("astrologer_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    balanceBucket: text("balance_bucket"),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "ledger_accounts_account_type_check",
      sql`${table.accountType} in ${sql.raw(formatFinanceSqlValues(ledgerAccountTypeValues))}`
    ),
    check(
      "ledger_accounts_balance_bucket_check",
      sql`${table.balanceBucket} is null or ${table.balanceBucket} in ${sql.raw(
        formatFinanceSqlValues(walletBalanceBucketValues)
      )}`
    ),
    check(
      "ledger_accounts_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "ledger_accounts_astrologer_shape_check",
      sql`(${table.accountType} in ('platform_clearing', 'platform_revenue', 'provider_fees', 'payout_clearing') and ${table.astrologerUserId} is null and ${table.balanceBucket} is null) or (${table.accountType} = 'astrologer_pending' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'pending') or (${table.accountType} = 'astrologer_available' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'available') or (${table.accountType} = 'astrologer_reserved' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'reserved') or (${table.accountType} = 'astrologer_payout_pending' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'payout_pending') or (${table.accountType} = 'astrologer_negative_balance' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'negative_balance')`
    ),
    uniqueIndex("ledger_accounts_platform_unique")
      .on(table.accountType, table.currency)
      .where(sql`${table.astrologerUserId} is null`),
    uniqueIndex("ledger_accounts_astrologer_unique")
      .on(table.astrologerUserId, table.accountType, table.currency)
      .where(sql`${table.astrologerUserId} is not null`),
    index("ledger_accounts_astrologer_bucket_idx").on(
      table.astrologerUserId,
      table.balanceBucket
    )
  ]
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operationType: text("operation_type").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    payoutRequestId: uuid("payout_request_id").references(() => payoutRequests.id, {
      onDelete: "restrict"
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull()
  },
  (table) => [
    check(
      "ledger_transactions_operation_type_check",
      sql`${table.operationType} in ${sql.raw(formatFinanceSqlValues(ledgerOperationTypeValues))}`
    ),
    check(
      "ledger_transactions_source_check",
      sql`${table.orderId} is not null or ${table.payoutRequestId} is not null or ${table.operationType} = 'manual_adjustment'`
    ),
    check("ledger_transactions_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("ledger_transactions_order_idx").on(table.orderId),
    index("ledger_transactions_payout_request_idx").on(table.payoutRequestId),
    index("ledger_transactions_posted_idx").on(table.postedAt, table.id)
  ]
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerTransactionId: uuid("ledger_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    side: text("entry_side").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "ledger_entries_side_check",
      sql`${table.side} in ${sql.raw(formatFinanceSqlValues(ledgerEntrySideValues))}`
    ),
    check(
      "ledger_entries_amount_check",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "ledger_entries_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check("ledger_entries_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("ledger_entries_transaction_account_side_idx").on(
      table.ledgerTransactionId,
      table.accountId,
      table.side
    ),
    index("ledger_entries_account_created_idx").on(table.accountId, table.createdAt)
  ]
);

export const walletBalanceReadModels = pgTable(
  "wallet_balance_read_models",
  {
    astrologerUserId: uuid("astrologer_user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    pendingAmountMinor: bigint("pending_amount_minor", { mode: "number" }).notNull().default(0),
    pendingCurrency: text("pending_currency").notNull().default("RUB"),
    availableAmountMinor: bigint("available_amount_minor", { mode: "number" }).notNull().default(0),
    availableCurrency: text("available_currency").notNull().default("RUB"),
    reservedAmountMinor: bigint("reserved_amount_minor", { mode: "number" }).notNull().default(0),
    reservedCurrency: text("reserved_currency").notNull().default("RUB"),
    payoutPendingAmountMinor: bigint("payout_pending_amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    payoutPendingCurrency: text("payout_pending_currency").notNull().default("RUB"),
    negativeBalanceAmountMinor: bigint("negative_balance_amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    negativeBalanceCurrency: text("negative_balance_currency").notNull().default("RUB"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "wallet_balance_read_models_amount_check",
      sql`${table.pendingAmountMinor} >= 0 and ${table.pendingAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.availableAmountMinor} >= 0 and ${table.availableAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.reservedAmountMinor} >= 0 and ${table.reservedAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.payoutPendingAmountMinor} >= 0 and ${table.payoutPendingAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.negativeBalanceAmountMinor} >= 0 and ${table.negativeBalanceAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "wallet_balance_read_models_currency_check",
      sql`${table.pendingCurrency} = 'RUB' and ${table.availableCurrency} = 'RUB' and ${table.reservedCurrency} = 'RUB' and ${table.payoutPendingCurrency} = 'RUB' and ${table.negativeBalanceCurrency} = 'RUB'`
    )
  ]
);
