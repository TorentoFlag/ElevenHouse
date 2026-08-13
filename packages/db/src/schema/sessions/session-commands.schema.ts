import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import {
  formatSessionSqlValues,
  sessionCommandKindValues,
  sessionCommandStatusValues,
  sessionParticipantRoleValues
} from "./session-values";
import { sessions } from "./sessions.schema";

export const sessionCommands = pgTable(
  "session_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role").notNull(),
    kind: text("kind").notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    status: text("status").notNull(),
    safeFailureCode: text("safe_failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("session_commands_actor_kind_operation_unique").on(
      table.sessionId,
      table.actorUserId,
      table.kind,
      table.operationId
    ),
    check(
      "session_commands_actor_role_check",
      sql`${table.actorRole} in ${sql.raw(formatSessionSqlValues(sessionParticipantRoleValues))}`
    ),
    check(
      "session_commands_kind_check",
      sql`${table.kind} in ${sql.raw(formatSessionSqlValues(sessionCommandKindValues))}`
    ),
    check(
      "session_commands_status_check",
      sql`${table.status} in ${sql.raw(formatSessionSqlValues(sessionCommandStatusValues))}`
    ),
    check("session_commands_request_hash_check", sql`${table.requestHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check(
      "session_commands_outcome_evidence_check",
      sql`(
        ${table.status} = 'prepared' and ${table.completedAt} is null and ${table.safeFailureCode} is null
      ) or (
        ${table.status} = 'completed' and ${table.completedAt} is not null and ${table.safeFailureCode} is null
      ) or (
        ${table.status} = 'outcome_unknown' and ${table.completedAt} is null and ${table.safeFailureCode} is not null
      )`
    ),
    index("session_commands_status_updated_idx").on(table.status, table.updatedAt, table.id)
  ]
);
