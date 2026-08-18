import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { messagingChannelConnections } from "./channel-connections.schema";
import type { MessagingEncryptedSecretSnapshot } from "./telegram-mtproto-sessions.schema";

export const messagingInstagramGraphAccounts = pgTable(
  "messaging_instagram_graph_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => messagingChannelConnections.id, { onDelete: "cascade" }),
    instagramUserId: text("instagram_user_id").notNull(),
    instagramAppScopedUserId: text("instagram_app_scoped_user_id"),
    instagramUsername: text("instagram_username"),
    instagramDisplayName: text("instagram_display_name"),
    accessTokenEncrypted: jsonb("access_token_encrypted")
      .$type<MessagingEncryptedSecretSnapshot>()
      .notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("messaging_instagram_graph_accounts_connection_unique").on(table.channelConnectionId),
    unique("messaging_instagram_graph_accounts_instagram_user_unique").on(table.instagramUserId),
    unique("messaging_instagram_graph_accounts_app_scoped_user_unique").on(
      table.instagramAppScopedUserId
    ),
    check(
      "messaging_instagram_graph_accounts_instagram_user_id_length_check",
      sql`length(trim(${table.instagramUserId})) between 1 and 200`
    ),
    check(
      "messaging_instagram_graph_accounts_app_scoped_user_id_length_check",
      sql`${table.instagramAppScopedUserId} is null or length(trim(${table.instagramAppScopedUserId})) between 1 and 200`
    ),
    check(
      "messaging_instagram_graph_accounts_access_token_object_check",
      sql`jsonb_typeof(${table.accessTokenEncrypted}) = 'object'`
    )
  ]
);
