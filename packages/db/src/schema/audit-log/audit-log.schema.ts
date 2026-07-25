import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";

export const auditLogEntries = pgTable(
  "audit_log_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`)
  },
  (table) => [
    check("audit_log_entries_action_check", sql`length(trim(${table.action})) between 1 and 160`),
    check(
      "audit_log_entries_target_type_check",
      sql`length(trim(${table.targetType})) between 1 and 120`
    ),
    check(
      "audit_log_entries_target_id_check",
      sql`length(trim(${table.targetId})) between 1 and 200`
    ),
    check("audit_log_entries_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("audit_log_entries_actor_user_id_index").on(table.actorUserId),
    index("audit_log_entries_action_index").on(table.action),
    index("audit_log_entries_target_index").on(table.targetType, table.targetId),
    index("audit_log_entries_occurred_at_index").on(table.occurredAt)
  ]
);
