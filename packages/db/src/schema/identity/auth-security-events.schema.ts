import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./accounts.schema";
import { userSessions } from "./auth-sessions.schema";

export const authSecurityEvents = pgTable(
  "auth_security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => userSessions.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`)
  },
  (table) => [
    check(
      "auth_security_events_event_type_check",
      sql`${table.eventType} in (
        'registration_succeeded',
        'login_succeeded',
        'login_failed',
        'logout_succeeded',
        'session_revoked'
      )`
    ),
    index("auth_security_events_user_id_index").on(table.userId),
    index("auth_security_events_session_id_index").on(table.sessionId),
    index("auth_security_events_event_type_index").on(table.eventType),
    index("auth_security_events_occurred_at_index").on(table.occurredAt)
  ]
);
