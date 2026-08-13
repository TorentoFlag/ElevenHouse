import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  formatSessionSqlValues,
  sessionRealtimeEventTypeValues,
  sessionStateValues
} from "./session-values";
import { sessions } from "./sessions.schema";

export const sessionRealtimeEvents = pgTable(
  "session_realtime_events",
  {
    eventId: bigint("event_id", { mode: "bigint" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    messageId: uuid("message_id"),
    state: text("state"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "session_realtime_events_type_check",
      sql`${table.type} in ${sql.raw(formatSessionSqlValues(sessionRealtimeEventTypeValues))}`
    ),
    check(
      "session_realtime_events_state_check",
      sql`${table.state} is null or ${table.state} in ${sql.raw(formatSessionSqlValues(sessionStateValues))}`
    ),
    check(
      "session_realtime_events_ids_only_shape_check",
      sql`(
        ${table.type} = 'message.created' and ${table.messageId} is not null and ${table.state} is null
      ) or (
        ${table.type} = 'session.updated' and ${table.messageId} is null and ${table.state} is not null
      )`
    ),
    index("session_realtime_events_session_event_idx").on(table.sessionId, table.eventId)
  ]
);
