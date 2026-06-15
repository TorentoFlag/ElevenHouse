import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authChallenges } from "./auth-challenges.schema";

export const authChallengeDeliveries = pgTable(
  "auth_challenge_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => authChallenges.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true })
  },
  (table) => [
    check(
      "auth_challenge_deliveries_channel_check",
      sql`${table.channel} in ('email', 'phone')`
    ),
    check(
      "auth_challenge_deliveries_status_check",
      sql`${table.status} in ('queued', 'sent', 'failed')`
    ),
    check(
      "auth_challenge_deliveries_sent_at_check",
      sql`${table.status} <> 'sent' or ${table.sentAt} is not null`
    ),
    index("auth_challenge_deliveries_challenge_id_index").on(table.challengeId),
    index("auth_challenge_deliveries_provider_status_index").on(table.provider, table.status),
    index("auth_challenge_deliveries_created_at_index").on(table.createdAt)
  ]
);
