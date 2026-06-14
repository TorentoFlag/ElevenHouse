import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./accounts.schema";

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    check("user_sessions_status_check", sql`${table.status} in ('active', 'revoked')`),
    check("user_sessions_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "user_sessions_revoked_at_check",
      sql`${table.status} <> 'revoked' or ${table.revokedAt} is not null`
    ),
    uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash),
    index("user_sessions_user_id_index").on(table.userId),
    index("user_sessions_active_user_index")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index("user_sessions_expires_at_index").on(table.expiresAt)
  ]
);
