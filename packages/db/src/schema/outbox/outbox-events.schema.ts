import { sql } from "drizzle-orm";
import {
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
  CapturedSaleOutboxEvent,
  CalculationPdfDeleteRequestedPayload,
  CalculationPdfRequestedPayload,
  ChartCalculationRequestedPayload,
  MessagingMessageDeliveryRequestedPayload,
  RedactedAuthCodeDeliveryRequestedPayload
} from "@elevenhouse/domain";

export const outboxEventStatusValues = ["pending", "publishing", "published"] as const;

export type OutboxEventPayload =
  | AuthCodeDeliveryRequestedPayload
  | CapturedSaleOutboxEvent["payload"]
  | RedactedAuthCodeDeliveryRequestedPayload
  | CalculationPdfRequestedPayload
  | CalculationPdfDeleteRequestedPayload
  | ChartCalculationRequestedPayload
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
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "outbox_events_status_check",
      sql`${table.status} in ('pending', 'publishing', 'published')`
    ),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "outbox_events_pending_not_published_check",
      sql`${table.status} <> 'pending' or ${table.publishedAt} is null`
    ),
    check(
      "outbox_events_publishing_locked_check",
      sql`${table.status} <> 'publishing' or ${table.lockedAt} is not null`
    ),
    check(
      "outbox_events_published_at_check",
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`
    ),
    uniqueIndex("outbox_events_event_type_aggregate_id_unique").on(
      table.eventType,
      table.aggregateId
    ),
    index("outbox_events_pending_index").on(table.status, table.availableAt, table.createdAt),
    index("outbox_events_locked_at_index").on(table.lockedAt)
  ]
);
