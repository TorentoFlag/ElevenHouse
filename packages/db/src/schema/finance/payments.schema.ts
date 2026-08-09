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
import {
  financeCurrencyValues,
  financePaymentProviderValues,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  paymentAttemptStatusValues,
  paymentProviderEventTypeValues,
  refundStatusValues
} from "./finance-values";
import { orders } from "./orders.schema";

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("created"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    providerPaymentId: text("provider_payment_id"),
    providerCheckoutId: text("provider_checkout_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("payment_attempts_provider_payment_unique")
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    check(
      "payment_attempts_provider_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}`
    ),
    check(
      "payment_attempts_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(paymentAttemptStatusValues))}`
    ),
    check(
      "payment_attempts_amount_check",
      sql`${table.amountMinor} >= 0 and ${table.amountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "payment_attempts_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "payment_attempts_provider_payment_id_length_check",
      sql`${table.providerPaymentId} is null or length(trim(${table.providerPaymentId})) between 1 and 160`
    ),
    check(
      "payment_attempts_provider_checkout_id_length_check",
      sql`${table.providerCheckoutId} is null or length(trim(${table.providerCheckoutId})) between 1 and 160`
    ),
    check(
      "payment_attempts_idempotency_key_length_check",
      sql`length(trim(${table.idempotencyKey})) between 1 and 160`
    ),
    check("payment_attempts_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("payment_attempts_order_created_idx").on(table.orderId, table.createdAt, table.id),
    index("payment_attempts_provider_status_idx").on(table.provider, table.status)
  ]
);

export const paymentProviderEvents = pgTable(
  "payment_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentAttemptId: uuid("payment_attempt_id").references(() => paymentAttempts.id, {
      onDelete: "set null"
    }),
    provider: text("provider").notNull(),
    providerWebhookId: text("provider_webhook_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull()
  },
  (table) => [
    uniqueIndex("payment_provider_events_webhook_unique").on(table.provider, table.providerWebhookId),
    check(
      "payment_provider_events_provider_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}`
    ),
    check(
      "payment_provider_events_type_check",
      sql`${table.type} in ${sql.raw(formatFinanceSqlValues(paymentProviderEventTypeValues))}`
    ),
    check(
      "payment_provider_events_webhook_id_length_check",
      sql`length(trim(${table.providerWebhookId})) between 1 and 160`
    ),
    check(
      "payment_provider_events_payment_id_length_check",
      sql`${table.providerPaymentId} is null or length(trim(${table.providerPaymentId})) between 1 and 160`
    ),
    check("payment_provider_events_payload_check", sql`jsonb_typeof(${table.payload}) = 'object'`),
    index("payment_provider_events_payment_idx").on(table.provider, table.providerPaymentId),
    index("payment_provider_events_received_idx").on(table.receivedAt, table.id)
  ]
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentAttemptId: uuid("payment_attempt_id")
      .notNull()
      .references(() => paymentAttempts.id, { onDelete: "restrict" }),
    providerEventId: uuid("provider_event_id").references(() => paymentProviderEvents.id, {
      onDelete: "set null"
    }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("requested"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    providerRefundId: text("provider_refund_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "refunds_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(refundStatusValues))}`
    ),
    check(
      "refunds_provider_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}`
    ),
    check(
      "refunds_amount_check",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "refunds_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "refunds_provider_refund_id_length_check",
      sql`${table.providerRefundId} is null or length(trim(${table.providerRefundId})) between 1 and 160`
    ),
    uniqueIndex("refunds_provider_refund_unique")
      .on(table.provider, table.providerRefundId)
      .where(sql`${table.providerRefundId} is not null`),
    index("refunds_order_created_idx").on(table.orderId, table.createdAt, table.id),
    index("refunds_payment_attempt_idx").on(table.paymentAttemptId)
  ]
);
