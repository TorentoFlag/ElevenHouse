import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import {
  formatSessionSqlValues,
  sessionParticipantRoleValues,
  sessionPresenceStateValues
} from "./session-values";
import { sessions } from "./sessions.schema";

export const sessionParticipants = pgTable(
  "session_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    providerParticipantId: uuid("provider_participant_id").notNull().defaultRandom(),
    displayNameSnapshot: text("display_name_snapshot").notNull(),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }),
    lastJoinedAt: timestamp("last_joined_at", { withTimezone: true }),
    presenceState: text("presence_state").notNull().default("absent"),
    presenceUpdatedAt: timestamp("presence_updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("session_participants_session_role_unique").on(table.sessionId, table.role),
    unique("session_participants_session_user_unique").on(table.sessionId, table.userId),
    unique("session_participants_provider_identity_unique").on(table.providerParticipantId),
    check(
      "session_participants_role_check",
      sql`${table.role} in ${sql.raw(formatSessionSqlValues(sessionParticipantRoleValues))}`
    ),
    check(
      "session_participants_presence_check",
      sql`${table.presenceState} in ${sql.raw(formatSessionSqlValues(sessionPresenceStateValues))}`
    ),
    check("session_participants_display_name_length_check", sql`length(trim(${table.displayNameSnapshot})) between 1 and 200`),
    check(
      "session_participants_join_evidence_check",
      sql`${table.lastJoinedAt} is null or ${table.firstJoinedAt} is not null`
    ),
    index("session_participants_user_session_idx").on(table.userId, table.sessionId)
  ]
);
