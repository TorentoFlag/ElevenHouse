import { sql } from "drizzle-orm";
import { boolean, check, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { messagingChannelConnections } from "./channel-connections.schema";
import {
  formatMessagingSqlValues,
  messagingWhatsappCloudSyncStatusValues
} from "./messaging-values";
import type { MessagingEncryptedSecretSnapshot } from "./telegram-mtproto-sessions.schema";

export const messagingWhatsappCloudAccounts = pgTable(
  "messaging_whatsapp_cloud_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => messagingChannelConnections.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    businessId: text("business_id"),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    platformType: text("platform_type"),
    isOnBizApp: boolean("is_on_biz_app"),
    accessTokenEncrypted: jsonb("access_token_encrypted")
      .$type<MessagingEncryptedSecretSnapshot>()
      .notNull(),
    tokenScopes: jsonb("token_scopes").$type<readonly string[]>().notNull().default([]),
    connectedVia: text("connected_via").notNull(),
    historySyncStatus: text("history_sync_status").notNull().default("not_requested"),
    contactSyncStatus: text("contact_sync_status").notNull().default("not_requested"),
    tokenIssuedAt: timestamp("token_issued_at", { withTimezone: true }),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("messaging_whatsapp_cloud_accounts_connection_unique").on(table.channelConnectionId),
    unique("messaging_whatsapp_cloud_accounts_phone_unique").on(table.phoneNumberId),
    check(
      "messaging_whatsapp_cloud_accounts_waba_id_length_check",
      sql`length(trim(${table.wabaId})) between 1 and 200`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_business_id_length_check",
      sql`${table.businessId} is null or length(trim(${table.businessId})) between 1 and 200`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_phone_id_length_check",
      sql`length(trim(${table.phoneNumberId})) between 1 and 200`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_access_token_object_check",
      sql`jsonb_typeof(${table.accessTokenEncrypted}) = 'object'`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_token_scopes_array_check",
      sql`jsonb_typeof(${table.tokenScopes}) = 'array'`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_connected_via_check",
      sql`${table.connectedVia} = 'embedded_signup_coexistence'`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_history_status_check",
      sql`${table.historySyncStatus} in ${sql.raw(
        formatMessagingSqlValues(messagingWhatsappCloudSyncStatusValues)
      )}`
    ),
    check(
      "messaging_whatsapp_cloud_accounts_contact_status_check",
      sql`${table.contactSyncStatus} in ${sql.raw(
        formatMessagingSqlValues(messagingWhatsappCloudSyncStatusValues)
      )}`
    )
  ]
);
