import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { messagingMessages } from "./messages.schema";
import {
  formatMessagingSqlValues,
  messagingDeliveryAttemptStatusValues,
  messagingProviderValues
} from "./messaging-values";

export const messageDeliveryAttempts = pgTable(
  "message_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messagingMessages.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    providerRequestId: text("provider_request_id"),
    providerResponseMessageId: text("provider_response_message_id"),
    providerStatusCode: integer("provider_status_code"),
    status: text("status").notNull(),
    retryable: boolean("retryable").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("message_delivery_attempts_message_attempt_unique").on(
      table.messageId,
      table.attemptNumber
    ),
    check(
      "message_delivery_attempts_provider_check",
      sql`${table.provider} in ${sql.raw(formatMessagingSqlValues(messagingProviderValues))}`
    ),
    check(
      "message_delivery_attempts_status_check",
      sql`${table.status} in ${sql.raw(
        formatMessagingSqlValues(messagingDeliveryAttemptStatusValues)
      )}`
    ),
    check("message_delivery_attempts_number_check", sql`${table.attemptNumber} > 0`),
    check(
      "message_delivery_attempts_status_code_check",
      sql`${table.providerStatusCode} is null or ${table.providerStatusCode} between 100 and 599`
    )
  ]
);
