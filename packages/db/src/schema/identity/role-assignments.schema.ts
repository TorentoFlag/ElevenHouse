import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./accounts.schema";

export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "user_role_assignments_role_check",
      sql`${table.role} in ('client', 'astrologer', 'moderator', 'admin', 'super_admin')`
    ),
    uniqueIndex("user_role_assignments_user_role_unique").on(table.userId, table.role),
    index("user_role_assignments_role_index").on(table.role)
  ]
);
