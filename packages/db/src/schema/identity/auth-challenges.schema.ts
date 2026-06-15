import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    identifier: text("identifier").notNull(),
    identifierNormalized: text("identifier_normalized").notNull(),
    codeHash: text("code_hash").notNull(),
    requestedRoles: jsonb("requested_roles").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("auth_challenges_channel_check", sql`${table.channel} in ('email', 'phone')`),
    check(
      "auth_challenges_status_check",
      sql`${table.status} in ('pending', 'consumed', 'cancelled')`
    ),
    check("auth_challenges_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("auth_challenges_max_attempts_check", sql`${table.maxAttempts} > 0`),
    check("auth_challenges_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "auth_challenges_consumed_at_check",
      sql`${table.status} <> 'consumed' or ${table.consumedAt} is not null`
    ),
    check(
      "auth_challenges_cancelled_at_check",
      sql`${table.status} <> 'cancelled' or ${table.cancelledAt} is not null`
    ),
    index("auth_challenges_identifier_status_index").on(
      table.channel,
      table.identifierNormalized,
      table.status
    ),
    index("auth_challenges_expires_at_index").on(table.expiresAt),
    index("auth_challenges_created_at_index").on(table.createdAt)
  ]
);
