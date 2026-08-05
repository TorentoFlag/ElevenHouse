import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
  timestamp,
  text
} from "drizzle-orm/pg-core";

import {
  platformTariffInvoices,
  platformTariffSubscriptions
} from "../platform-billing/tariff-authority.schema";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "./economic-payments.schema";
import { financeProviderOperationIntents } from "./provider-operations.schema";
import { financeRevisionString } from "./finance-values";

/**
 * UUID aggregate for the transactional outbox. The immutable tariff invoice keeps its opaque
 * source ID; worker retries address this request and must reload the invoice from PostgreSQL.
 */
export const financePlatformTariffInvoiceChargePreparationRequests = pgTable(
  "finance_platform_tariff_invoice_charge_preparation_requests",
  {
    id: uuid("id").primaryKey(),
    invoiceId: varchar("invoice_id", { length: 160 }).notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    /** Monotonic invoice-scoped attempt identity; attempt 1 is the initial saved-card charge. */
    attemptNumber: integer("attempt_number").notNull().default(1),
    expectedInvoiceVersion: integer("expected_invoice_version").notNull(),
    expectedSubscriptionVersion: integer("expected_subscription_version").notNull(),
    state: text("state").notNull(),
    version: financeRevisionString("version").notNull(),
    /** Persisted exactly once when preparation commits its economic intent/session/operation. */
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.invoiceId],
      foreignColumns: [platformTariffInvoices.id],
      name: "finance_platform_tariff_invoice_charge_preparation_invoice_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subscriptionId],
      foreignColumns: [platformTariffSubscriptions.id],
      name: "finance_platform_tariff_invoice_charge_preparation_subscription_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financeEconomicPaymentIntents.id],
      name: "finance_platform_tariff_invoice_charge_preparation_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentSessionId],
      foreignColumns: [financeEconomicPaymentSessions.id],
      name: "finance_platform_tariff_invoice_charge_preparation_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_platform_tariff_invoice_charge_preparation_provider_operation_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_platform_tariff_invoice_charge_preparation_invoice_attempt_unique")
      .on(table.invoiceId, table.attemptNumber),
    uniqueIndex("finance_platform_tariff_invoice_charge_preparation_provider_operation_unique")
      .on(table.providerOperationIntentId)
      .where(sql`${table.providerOperationIntentId} is not null`),
    check(
      "finance_platform_tariff_invoice_charge_preparation_state_check",
      sql`${table.attemptNumber} >= 1 and ${table.expectedInvoiceVersion} >= 1 and ${table.expectedSubscriptionVersion} >= 1
        and (
          ${table.state} = 'pending' and ${table.version} = 1
          and ${table.economicPaymentIntentId} is null
          and ${table.economicPaymentSessionId} is null
          and ${table.providerOperationIntentId} is null
        or ${table.state} = 'prepared' and ${table.version} = 2
          and ${table.economicPaymentIntentId} is not null
          and ${table.economicPaymentSessionId} is not null
          and ${table.providerOperationIntentId} is not null
        )`
    ),
    index("finance_platform_tariff_invoice_charge_preparation_pending_idx")
      .on(table.state, table.createdAt, table.id)
  ]
);
