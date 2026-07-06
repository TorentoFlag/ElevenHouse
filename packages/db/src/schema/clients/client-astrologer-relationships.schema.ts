import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  clientRelationshipSourceValues,
  clientRelationshipStatusValues,
  formatClientSqlValues
} from "./client-values";

export const clientAstrologerRelationships = pgTable(
  "client_astrologer_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull().default("active"),
    firstLinkedAt: timestamp("first_linked_at", { withTimezone: true }).notNull(),
    lastLinkedAt: timestamp("last_linked_at", { withTimezone: true }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("client_astrologer_relationships_unique").on(
      table.clientUserId,
      table.astrologerUserId
    ),
    index("client_astrologer_relationships_astrologer_status_idx").on(
      table.astrologerUserId,
      table.status
    ),
    index("client_astrologer_relationships_client_status_idx").on(
      table.clientUserId,
      table.status
    ),
    check(
      "client_astrologer_relationships_source_check",
      sql`${table.source} in ${sql.raw(formatClientSqlValues(clientRelationshipSourceValues))}`
    ),
    check(
      "client_astrologer_relationships_status_check",
      sql`${table.status} in ${sql.raw(formatClientSqlValues(clientRelationshipStatusValues))}`
    ),
    check(
      "client_astrologer_relationships_distinct_users_check",
      sql`${table.clientUserId} <> ${table.astrologerUserId}`
    )
  ]
);
