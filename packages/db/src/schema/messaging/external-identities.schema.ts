import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { messagingChannelConnections } from "./channel-connections.schema";
import {
  formatMessagingSqlValues,
  messagingExternalIdentityLinkStatusValues,
  messagingProviderValues
} from "./messaging-values";

export const messagingExternalIdentities = pgTable(
  "messaging_external_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelConnectionId: uuid("channel_connection_id").notNull(),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id"),
    providerChatId: text("provider_chat_id").notNull(),
    usernameSnapshot: text("username_snapshot"),
    displayNameSnapshot: text("display_name_snapshot"),
    avatarMediaId: uuid("avatar_media_id"),
    linkedClientUserId: uuid("linked_client_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    linkStatus: text("link_status").notNull().default("unlinked"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("messaging_external_identities_id_provider_unique").on(table.id, table.provider),
    foreignKey({
      columns: [table.channelConnectionId, table.provider],
      foreignColumns: [messagingChannelConnections.id, messagingChannelConnections.provider],
      name: "messaging_external_identities_connection_provider_fk"
    }).onDelete("cascade"),
    uniqueIndex("messaging_external_identities_connection_chat_unique").on(
      table.channelConnectionId,
      table.providerChatId
    ),
    index("messaging_external_identities_linked_client_idx").on(table.linkedClientUserId),
    check(
      "messaging_external_identities_provider_check",
      sql`${table.provider} in ${sql.raw(formatMessagingSqlValues(messagingProviderValues))}`
    ),
    check(
      "messaging_external_identities_link_status_check",
      sql`${table.linkStatus} in ${sql.raw(
        formatMessagingSqlValues(messagingExternalIdentityLinkStatusValues)
      )}`
    ),
    check(
      "messaging_external_identities_provider_chat_id_length_check",
      sql`length(trim(${table.providerChatId})) between 1 and 200`
    ),
    check(
      "messaging_external_identities_seen_at_check",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`
    )
  ]
);
