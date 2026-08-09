import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  financePaymentProviderValues,
  formatFinanceSqlValues,
  reconciliationStatusValues
} from "./finance-values";
import { paymentProviderEvents } from "./payments.schema";

export const reconciliationRecords = pgTable(
  "reconciliation_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    providerPayoutId: text("provider_payout_id"),
    providerSettlementId: text("provider_settlement_id"),
    providerEventId: uuid("provider_event_id").references(() => paymentProviderEvents.id, {
      onDelete: "set null"
    }),
    status: text("status").notNull().default("pending"),
    exceptionCode: text("exception_code"),
    exceptionMessage: text("exception_message"),
    providerOccurredAt: timestamp("provider_occurred_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull()
  },
  (table) => [
    check(
      "reconciliation_records_provider_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}`
    ),
    check(
      "reconciliation_records_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(reconciliationStatusValues))}`
    ),
    check(
      "reconciliation_records_provider_identifier_check",
      sql`${table.providerPaymentId} is not null or ${table.providerPayoutId} is not null or ${table.providerSettlementId} is not null`
    ),
    check(
      "reconciliation_records_exception_check",
      sql`${table.status} <> 'exception' or (${table.exceptionCode} is not null and length(trim(${table.exceptionCode})) between 1 and 120 and ${table.exceptionMessage} is not null and length(trim(${table.exceptionMessage})) between 1 and 2000)`
    ),
    check("reconciliation_records_payload_check", sql`jsonb_typeof(${table.payload}) = 'object'`),
    index("reconciliation_records_provider_payment_idx").on(table.provider, table.providerPaymentId),
    index("reconciliation_records_provider_payout_idx").on(table.provider, table.providerPayoutId),
    index("reconciliation_records_status_checked_idx").on(table.status, table.checkedAt)
  ]
);
