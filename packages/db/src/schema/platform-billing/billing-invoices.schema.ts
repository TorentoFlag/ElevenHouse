import { sql } from "drizzle-orm";
import {
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
import {
  billingCurrencyValues,
  billingCycleValues,
  billingInvoiceStatusValues,
  formatPlatformBillingSqlValues,
  platformBillingProviderValues
} from "./platform-billing-values";
import { platformPlans } from "./platform-plans.schema";

export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerInvoiceId: text("provider_invoice_id").notNull(),
    status: text("status").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => platformPlans.id, { onDelete: "restrict" }),
    billingCycle: text("billing_cycle").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    receiptUrl: text("receipt_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "billing_invoices_provider_check",
      sql`${table.provider} in ${sql.raw(formatPlatformBillingSqlValues(platformBillingProviderValues))}`
    ),
    check(
      "billing_invoices_status_check",
      sql`${table.status} in ${sql.raw(formatPlatformBillingSqlValues(billingInvoiceStatusValues))}`
    ),
    check(
      "billing_invoices_billing_cycle_check",
      sql`${table.billingCycle} in ${sql.raw(formatPlatformBillingSqlValues(billingCycleValues))}`
    ),
    check("billing_invoices_amount_minor_check", sql`${table.amountMinor} >= 0`),
    check(
      "billing_invoices_currency_check",
      sql`${table.currency} in ${sql.raw(formatPlatformBillingSqlValues(billingCurrencyValues))}`
    ),
    index("billing_invoices_owner_issued_idx").on(table.ownerUserId, table.issuedAt),
    uniqueIndex("billing_invoices_provider_invoice_unique").on(
      table.provider,
      table.providerInvoiceId
    )
  ]
);
