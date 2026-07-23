import { sql } from "drizzle-orm";
import { bigserial, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { formatMessagingSqlValues, messagingRealtimeEventTypeValues } from "./messaging-values";

export const messagingRealtimeEvents = pgTable(
  "messaging_realtime_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: bigserial("event_id", { mode: "bigint" }).notNull(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    threadId: uuid("thread_id"),
    messageId: uuid("message_id"),
    channelConnectionId: uuid("channel_connection_id"),
    externalIdentityId: uuid("external_identity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "messaging_realtime_events_type_check",
      sql`${table.type} in ${sql.raw(formatMessagingSqlValues(messagingRealtimeEventTypeValues))}`
    ),
    uniqueIndex("messaging_realtime_events_event_id_unique").on(table.eventId),
    index("messaging_realtime_events_astrologer_event_id_idx").on(
      table.astrologerUserId,
      table.eventId
    )
  ]
);
