import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
  financePaymentProviderEnvironmentValues,
  financePaymentProviderValues,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  payoutMethodValues,
  payoutRequestStatusValues
} from "./finance-values";

export const payoutMethods = pgTable(
  "payout_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    currency: text("currency").notNull().default("RUB"),
    displayName: text("display_name").notNull(),
    manualBankTransferDetails: jsonb("manual_bank_transfer_details").$type<Record<string, unknown>>(),
    provider: text("provider"),
    environment: text("environment"),
    providerPayoutAccountId: text("provider_payout_account_id"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "payout_methods_method_check",
      sql`${table.method} in ${sql.raw(formatFinanceSqlValues(payoutMethodValues))}`
    ),
    check(
      "payout_methods_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "payout_methods_provider_check",
      sql`${table.provider} is null or ${table.provider} in ${sql.raw(
        formatFinanceSqlValues(financePaymentProviderValues)
      )}`
    ),
    check(
      "payout_methods_environment_check",
      sql`${table.environment} is null or ${table.environment} in ${sql.raw(
        formatFinanceSqlValues(financePaymentProviderEnvironmentValues)
      )}`
    ),
    check("payout_methods_display_name_check", sql`length(trim(${table.displayName})) between 1 and 160`),
    check(
      "payout_methods_method_provider_shape_check",
      sql`(${table.method} = 'manual_bank_transfer' and ${table.provider} is null and ${table.environment} is null and ${table.providerPayoutAccountId} is null and ${table.manualBankTransferDetails} is not null and jsonb_typeof(${table.manualBankTransferDetails}) = 'object') or (${table.method} = 'arc_pay_provider' and ${table.provider} is not null and ${table.provider} = 'arc_pay' and ${table.environment} is not null and ${table.providerPayoutAccountId} is not null and length(trim(${table.providerPayoutAccountId})) between 1 and 160 and ${table.manualBankTransferDetails} is null)`
    ),
    uniqueIndex("payout_methods_default_astrologer_unique")
      .on(table.astrologerUserId)
      .where(sql`${table.isDefault} = true`),
    uniqueIndex("payout_methods_provider_account_unique")
      .on(table.provider, table.environment, table.providerPayoutAccountId)
      .where(sql`${table.providerPayoutAccountId} is not null`),
    index("payout_methods_astrologer_created_idx").on(table.astrologerUserId, table.createdAt)
  ]
);

export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    payoutMethodId: uuid("payout_method_id")
      .notNull()
      .references(() => payoutMethods.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("requested"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    provider: text("provider"),
    environment: text("environment"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    adminUserId: uuid("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    adminNote: text("admin_note"),
    failureReason: text("failure_reason"),
    externalReference: text("external_reference"),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    providerPayoutId: text("provider_payout_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "payout_requests_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(payoutRequestStatusValues))}`
    ),
    check(
      "payout_requests_method_check",
      sql`${table.method} in ${sql.raw(formatFinanceSqlValues(payoutMethodValues))}`
    ),
    check(
      "payout_requests_amount_check",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "payout_requests_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "payout_requests_provider_check",
      sql`${table.provider} is null or ${table.provider} in ${sql.raw(
        formatFinanceSqlValues(financePaymentProviderValues)
      )}`
    ),
    check(
      "payout_requests_environment_check",
      sql`${table.environment} is null or ${table.environment} in ${sql.raw(
        formatFinanceSqlValues(financePaymentProviderEnvironmentValues)
      )}`
    ),
    check(
      "payout_requests_method_provider_shape_check",
      sql`(${table.method} = 'manual_bank_transfer' and ${table.provider} is null and ${table.environment} is null and ${table.providerPayoutId} is null) or (${table.method} = 'arc_pay_provider' and ${table.provider} is not null and ${table.provider} = 'arc_pay' and ${table.environment} is not null)`
    ),
    check(
      "payout_requests_paid_evidence_check",
      sql`${table.status} <> 'paid' or (${table.externalReference} is not null and ${table.transferredAt} is not null)`
    ),
    check(
      "payout_requests_failure_reason_check",
      sql`${table.status} not in ('failed', 'rejected') or (${table.failureReason} is not null and length(trim(${table.failureReason})) between 1 and 2000)`
    ),
    check(
      "payout_requests_admin_note_length_check",
      sql`${table.adminNote} is null or length(trim(${table.adminNote})) between 1 and 2000`
    ),
    check(
      "payout_requests_external_reference_length_check",
      sql`${table.externalReference} is null or length(trim(${table.externalReference})) between 1 and 240`
    ),
    check(
      "payout_requests_provider_payout_id_length_check",
      sql`${table.providerPayoutId} is null or length(trim(${table.providerPayoutId})) between 1 and 160`
    ),
    check("payout_requests_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("payout_requests_astrologer_requested_idx").on(
      table.astrologerUserId,
      table.requestedAt,
      table.id
    ),
    index("payout_requests_status_requested_idx").on(table.status, table.requestedAt, table.id),
    uniqueIndex("payout_requests_provider_payout_unique")
      .on(table.provider, table.environment, table.providerPayoutId)
      .where(sql`${table.providerPayoutId} is not null`)
  ]
);
