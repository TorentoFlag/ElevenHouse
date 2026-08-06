import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type {
  AuthCodeDeliveryRequestedPayload,
  AstroCalendarGenerationRequestedPayload,
  CapturedSaleOutboxEvent,
  CalculationPdfDeleteRequestedPayload,
  CalculationPdfRequestedPayload,
  ChartCalculationRequestedPayload,
  BookingLifecycleDispatchRequestedPayload,
  ClientBirthProfileUpdatedEvent,
  FlowBookingConfirmedEnrollmentRequestedPayloadV1,
  MessagingMessageDeliveryRequestedPayload,
  RedactedAuthCodeDeliveryRequestedPayload
} from "@elevenhouse/domain";
import type {
  FinanceEconomicPaymentCaptureAppliedPayload,
  FinancePlatformTariffInvoiceChargePreparationRequestedPayload,
  FinanceProviderOperationDispatchRequestedPayload,
  FinanceSavedCardSetupPreparationRequestedPayload
} from "@elevenhouse/domain/finance-core";

export const outboxEventStatusValues = [
  "pending",
  "publishing",
  "published",
  "quarantined"
] as const;

export type OutboxEventPayload =
  | AuthCodeDeliveryRequestedPayload
  | AstroCalendarGenerationRequestedPayload
  | CapturedSaleOutboxEvent["payload"]
  | RedactedAuthCodeDeliveryRequestedPayload
  | CalculationPdfRequestedPayload
  | CalculationPdfDeleteRequestedPayload
  | ChartCalculationRequestedPayload
  | BookingLifecycleDispatchRequestedPayload
  | ClientBirthProfileUpdatedEvent
  | FinanceProviderOperationDispatchRequestedPayload
  | FinanceEconomicPaymentCaptureAppliedPayload
  | FinanceSavedCardSetupPreparationRequestedPayload
  | FinancePlatformTariffInvoiceChargePreparationRequestedPayload
  | FlowBookingConfirmedEnrollmentRequestedPayloadV1
  | MessagingMessageDeliveryRequestedPayload;

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<OutboxEventPayload>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    claimFence: bigint("claim_fence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    quarantineReasonCode: text("quarantine_reason_code"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "outbox_events_status_check",
      sql`${table.status} in ('pending', 'publishing', 'published', 'quarantined')`
    ),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
    check("outbox_events_claim_fence_check", sql`${table.claimFence} >= 0`),
    check(
      "outbox_events_finance_dispatch_payload_check",
      sql`${table.eventType} <> 'finance.provider_operation.dispatch_requested' or (
        ${table.payload} = jsonb_build_object(
          'providerOperationIntentId',
          ${table.aggregateId}::text
        )
      )`
    ),
    check(
      "outbox_events_finance_capture_payload_check",
      sql`${table.eventType} <> 'finance.economic_payment.capture_applied' or (
        ${table.payload} = jsonb_build_object(
          'captureApplicationReceiptId',
          ${table.aggregateId}::text
        )
      )`
    ),
    check(
      "outbox_events_finance_saved_card_setup_preparation_payload_check",
      sql`${table.eventType} <> 'finance.saved_card_setup.preparation_requested' or (
        ${table.payload} = jsonb_build_object(
          'setupSessionId',
          ${table.aggregateId}::text
        )
      )`
    ),
    check(
      "outbox_events_finance_platform_tariff_invoice_charge_preparation_payload_check",
      sql`${table.eventType} <> 'finance.platform_tariff_invoice_charge.preparation_requested' or (
        ${table.payload} = jsonb_build_object(
          'preparationRequestId',
          ${table.aggregateId}::text
        )
      )`
    ),
    check(
      "outbox_events_booking_lifecycle_dispatch_payload_check",
      sql`${table.eventType} <> 'bookings.lifecycle_event.dispatch_requested.v1' or (
        ${table.payload} = jsonb_build_object(
          'schemaVersion', 'booking-lifecycle-event-dispatch-request.v1',
          'lifecycleEventId', ${table.aggregateId}::text
        )
      )`
    ),
    check(
      "outbox_events_quarantine_reason_code_check",
      sql`${table.quarantineReasonCode} is null or (
        length(${table.quarantineReasonCode}) between 3 and 120
        and ${table.quarantineReasonCode} ~ '^[A-Z][A-Z0-9_]+$'
      )`
    ),
    check(
      "outbox_events_state_check",
      sql`(
        ${table.status} = 'pending'
        and ${table.lockedAt} is null
        and ${table.publishedAt} is null
        and ${table.quarantinedAt} is null
        and ${table.quarantineReasonCode} is null
      ) or (
        ${table.status} = 'publishing'
        and ${table.lockedAt} is not null
        and ${table.publishedAt} is null
        and ${table.quarantinedAt} is null
        and ${table.quarantineReasonCode} is null
      ) or (
        ${table.status} = 'published'
        and ${table.lockedAt} is null
        and ${table.publishedAt} is not null
        and ${table.quarantinedAt} is null
        and ${table.quarantineReasonCode} is null
      ) or (
        ${table.status} = 'quarantined'
        and ${table.lockedAt} is null
        and ${table.publishedAt} is null
        and ${table.quarantinedAt} is not null
        and ${table.quarantineReasonCode} is not null
      )`
    ),
    uniqueIndex("outbox_events_event_type_aggregate_id_unique").on(
      table.eventType,
      table.aggregateId
    ),
    index("outbox_events_pending_index").on(table.status, table.availableAt, table.createdAt),
    index("outbox_events_locked_at_index").on(table.lockedAt),
    index("outbox_events_quarantined_index")
      .on(table.eventType, table.quarantinedAt, table.id)
      .where(sql`${table.status} = 'quarantined'`)
  ]
);
