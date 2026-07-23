import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { formatMessagingSqlValues, messagingThreadStatusValues } from "./messaging-values";

export const messagingThreads = pgTable(
  "messaging_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientUserId: uuid("client_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"),
    lastMessageId: uuid("last_message_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    unreadAstrologerCount: integer("unread_astrologer_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "messaging_threads_status_check",
      sql`${table.status} in ${sql.raw(formatMessagingSqlValues(messagingThreadStatusValues))}`
    ),
    check(
      "messaging_threads_unread_astrologer_count_check",
      sql`${table.unreadAstrologerCount} >= 0`
    ),
    index("messaging_threads_astrologer_status_last_message_idx").on(
      table.astrologerUserId,
      table.status,
      table.lastMessageAt
    ),
    index("messaging_threads_astrologer_client_idx").on(table.astrologerUserId, table.clientUserId)
  ]
);
