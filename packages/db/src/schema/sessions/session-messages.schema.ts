import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { formatSessionSqlValues, sessionParticipantRoleValues } from "./session-values";
import { sessions } from "./sessions.schema";

export const sessionMessages = pgTable(
  "session_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    operationId: uuid("operation_id").notNull(),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    senderRole: text("sender_role").notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("session_messages_session_sequence_unique").on(table.sessionId, table.sequence),
    unique("session_messages_actor_operation_unique").on(
      table.sessionId,
      table.senderUserId,
      table.operationId
    ),
    check("session_messages_sequence_check", sql`${table.sequence} > 0`),
    check(
      "session_messages_sender_role_check",
      sql`${table.senderRole} in ${sql.raw(formatSessionSqlValues(sessionParticipantRoleValues))}`
    ),
    check("session_messages_request_hash_check", sql`${table.requestHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check("session_messages_text_length_check", sql`char_length(${table.text}) between 1 and 4000`),
    index("session_messages_session_created_idx").on(table.sessionId, table.createdAt, table.id)
  ]
);
