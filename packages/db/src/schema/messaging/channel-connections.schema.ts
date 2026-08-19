import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  formatMessagingSqlValues,
  messagingChannelConnectionStatusValues,
  messagingChannelModeValues,
  messagingProviderValues
} from "./messaging-values";

export const messagingChannelConnections = pgTable(
  "messaging_channel_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("connecting"),
    externalAccountId: text("external_account_id"),
    externalOwnerUserId: text("external_owner_user_id"),
    displayNameSnapshot: text("display_name_snapshot"),
    usernameSnapshot: text("username_snapshot"),
    capabilities: jsonb("capabilities").$type<Record<string, boolean>>().notNull(),
    consentRecordId: uuid("consent_record_id"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "messaging_channel_connections_provider_check",
      sql`${table.provider} in ${sql.raw(formatMessagingSqlValues(messagingProviderValues))}`
    ),
    check(
      "messaging_channel_connections_mode_check",
      sql`${table.mode} in ${sql.raw(formatMessagingSqlValues(messagingChannelModeValues))}`
    ),
    check(
      "messaging_channel_connections_provider_mode_check",
      sql`(${table.provider} = 'telegram' and ${table.mode} in ('telegram_business_bot', 'telegram_mtproto_account')) or (${table.provider} = 'instagram' and ${table.mode} = 'instagram_graph') or (${table.provider} = 'whatsapp' and ${table.mode} = 'whatsapp_cloud')`
    ),
    check(
      "messaging_channel_connections_status_check",
      sql`${table.status} in ${sql.raw(
        formatMessagingSqlValues(messagingChannelConnectionStatusValues)
      )}`
    ),
    check(
      "messaging_channel_connections_capabilities_object_check",
      sql`jsonb_typeof(${table.capabilities}) = 'object'`
    ),
    check(
      "messaging_channel_connections_external_account_id_length_check",
      sql`${table.externalAccountId} is null or length(trim(${table.externalAccountId})) between 1 and 200`
    ),
    check(
      "messaging_channel_connections_external_owner_id_length_check",
      sql`${table.externalOwnerUserId} is null or length(trim(${table.externalOwnerUserId})) between 1 and 200`
    ),
    index("messaging_channel_connections_astrologer_provider_mode_status_idx").on(
      table.astrologerUserId,
      table.provider,
      table.mode,
      table.status
    ),
    unique("messaging_channel_connections_id_provider_unique").on(table.id, table.provider),
    uniqueIndex("messaging_channel_connections_external_account_unique")
      .on(table.provider, table.externalAccountId)
      .where(sql`${table.externalAccountId} is not null`)
  ]
);
