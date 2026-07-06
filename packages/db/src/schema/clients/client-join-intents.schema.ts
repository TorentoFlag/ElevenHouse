import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { clientJoinIntentStatusValues, formatClientSqlValues } from "./client-values";

export const clientJoinIntents = pgTable(
  "client_join_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    publicHandleSnapshot: text("public_handle_snapshot").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedByClientUserId: uuid("claimed_by_client_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("client_join_intents_token_hash_unique").on(table.tokenHash),
    index("client_join_intents_astrologer_status_idx").on(table.astrologerUserId, table.status),
    index("client_join_intents_claimed_client_idx").on(table.claimedByClientUserId),
    check(
      "client_join_intents_status_check",
      sql`${table.status} in ${sql.raw(formatClientSqlValues(clientJoinIntentStatusValues))}`
    ),
    check(
      "client_join_intents_public_handle_check",
      sql`${table.publicHandleSnapshot} ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'`
    ),
    check(
      "client_join_intents_claimed_consistency_check",
      sql`(${table.status} = 'claimed') = (${table.claimedByClientUserId} is not null and ${table.claimedAt} is not null)`
    )
  ]
);
