import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import {
  formatMessagingSqlValues,
  messagingChannelModeValues,
  messagingProviderValues,
  messagingProviderWebhookEventStatusValues
} from "./messaging-values";
import type { MessagingEncryptedSecretSnapshot } from "./telegram-mtproto-sessions.schema";

export const messagingProviderWebhookEvents = pgTable(
  "messaging_provider_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    mode: text("mode").notNull(),
    eventKey: text("event_key").notNull(),
    field: text("field").notNull(),
    externalAccountId: text("external_account_id"),
    externalOwnerUserId: text("external_owner_user_id"),
    payloadRef: text("payload_ref"),
    payloadEncrypted: jsonb("payload_encrypted").$type<MessagingEncryptedSecretSnapshot>(),
    normalizedSummary: jsonb("normalized_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processingStatus: text("processing_status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true })
  },
  (table) => [
    unique("messaging_provider_webhook_events_event_key_unique").on(table.eventKey),
    index("messaging_provider_webhook_events_status_received_idx").on(
      table.processingStatus,
      table.receivedAt
    ),
    check(
      "messaging_provider_webhook_events_provider_check",
      sql`${table.provider} in ${sql.raw(formatMessagingSqlValues(messagingProviderValues))}`
    ),
    check(
      "messaging_provider_webhook_events_mode_check",
      sql`${table.mode} in ${sql.raw(formatMessagingSqlValues(messagingChannelModeValues))}`
    ),
    check(
      "messaging_provider_webhook_events_status_check",
      sql`${table.processingStatus} in ${sql.raw(
        formatMessagingSqlValues(messagingProviderWebhookEventStatusValues)
      )}`
    ),
    check(
      "messaging_provider_webhook_events_event_key_length_check",
      sql`length(trim(${table.eventKey})) between 1 and 500`
    ),
    check(
      "messaging_provider_webhook_events_field_length_check",
      sql`length(trim(${table.field})) between 1 and 200`
    ),
    check("messaging_provider_webhook_events_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "messaging_provider_webhook_events_summary_object_check",
      sql`jsonb_typeof(${table.normalizedSummary}) = 'object'`
    ),
    check(
      "messaging_provider_webhook_events_payload_encrypted_object_check",
      sql`${table.payloadEncrypted} is null or jsonb_typeof(${table.payloadEncrypted}) = 'object'`
    )
  ]
);
