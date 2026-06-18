import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authChallengeDeliveries } from "./auth-challenge-deliveries.schema";

export const authChallengeDeliveryAttemptStatusValues = ["sent", "failed"] as const;
export type AuthChallengeDeliveryAttemptStatus =
  (typeof authChallengeDeliveryAttemptStatusValues)[number];

export const authChallengeDeliveryAttempts = pgTable(
  "auth_challenge_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => authChallengeDeliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    providerStatusCode: integer("provider_status_code"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "auth_challenge_delivery_attempts_attempt_number_check",
      sql`${table.attemptNumber} > 0`
    ),
    check(
      "auth_challenge_delivery_attempts_status_check",
      sql`${table.status} in ('sent', 'failed')`
    ),
    check(
      "auth_challenge_delivery_attempts_provider_status_code_check",
      sql`${table.providerStatusCode} is null or ${table.providerStatusCode} between 100 and 599`
    ),
    check(
      "auth_challenge_delivery_attempts_sent_fields_check",
      sql`${table.status} <> 'sent' or (${table.errorCode} is null and ${table.errorMessage} is null)`
    ),
    check(
      "auth_challenge_delivery_attempts_failed_fields_check",
      sql`${table.status} <> 'failed' or (${table.errorCode} is not null and ${table.errorMessage} is not null and ${table.providerMessageId} is null)`
    ),
    index("auth_challenge_delivery_attempts_delivery_id_index").on(table.deliveryId),
    index("auth_challenge_delivery_attempts_delivery_attempt_index").on(
      table.deliveryId,
      table.attemptNumber,
      table.attemptedAt
    ),
    index("auth_challenge_delivery_attempts_attempted_at_index").on(table.attemptedAt)
  ]
);
