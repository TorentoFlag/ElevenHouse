import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").notNull().default("active"),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    deletionScheduledAt: timestamp("deletion_scheduled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("users_status_check", sql`${table.status} in ('active', 'suspended', 'deleted')`),
    check(
      "users_deletion_schedule_check",
      sql`${table.deletionScheduledAt} is null or ${table.deletionRequestedAt} is not null`
    ),
    check(
      "users_deleted_at_check",
      sql`${table.deletedAt} is null or ${table.deletionRequestedAt} is not null`
    )
  ]
);
