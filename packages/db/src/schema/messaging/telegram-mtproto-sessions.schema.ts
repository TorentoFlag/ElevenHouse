import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { messagingChannelConnections } from "./channel-connections.schema";
import { formatMessagingSqlValues, messagingMtprotoLoginStateValues } from "./messaging-values";

export type MessagingEncryptedSecretSnapshot = {
  readonly algorithm: "aes-256-gcm";
  readonly keyId: string;
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
};

export const messagingTelegramMtprotoSessions = pgTable(
  "messaging_telegram_mtproto_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => messagingChannelConnections.id, { onDelete: "cascade" }),
    loginState: text("login_state").notNull().default("code_required"),
    phoneNumberEncrypted: jsonb("phone_number_encrypted")
      .$type<MessagingEncryptedSecretSnapshot>()
      .notNull(),
    phoneCodeHashEncrypted: jsonb("phone_code_hash_encrypted")
      .$type<MessagingEncryptedSecretSnapshot>()
      .notNull(),
    sessionEncrypted: jsonb("session_encrypted").$type<MessagingEncryptedSecretSnapshot>(),
    phoneNumberLast4: text("phone_number_last4").notNull(),
    telegramUserId: text("telegram_user_id"),
    pts: integer("pts"),
    qts: integer("qts"),
    dateCursor: timestamp("date_cursor", { withTimezone: true }),
    seq: integer("seq"),
    leaseOwner: text("lease_owner"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    lastListenerHeartbeatAt: timestamp("last_listener_heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("messaging_telegram_mtproto_sessions_connection_unique").on(table.channelConnectionId),
    check(
      "messaging_telegram_mtproto_sessions_login_state_check",
      sql`${table.loginState} in ${sql.raw(formatMessagingSqlValues(messagingMtprotoLoginStateValues))}`
    ),
    check(
      "messaging_telegram_mtproto_sessions_phone_last4_check",
      sql`${table.phoneNumberLast4} ~ '^[0-9]{4}$'`
    ),
    check(
      "messaging_telegram_mtproto_sessions_phone_encrypted_object_check",
      sql`jsonb_typeof(${table.phoneNumberEncrypted}) = 'object'`
    ),
    check(
      "messaging_telegram_mtproto_sessions_phone_code_hash_encrypted_object_check",
      sql`jsonb_typeof(${table.phoneCodeHashEncrypted}) = 'object'`
    ),
    check(
      "messaging_telegram_mtproto_sessions_session_encrypted_object_check",
      sql`${table.sessionEncrypted} is null or jsonb_typeof(${table.sessionEncrypted}) = 'object'`
    ),
    check(
      "messaging_telegram_mtproto_sessions_update_cursors_check",
      sql`(${table.pts} is null or ${table.pts} >= 0) and (${table.qts} is null or ${table.qts} >= 0) and (${table.seq} is null or ${table.seq} >= 0)`
    ),
    check(
      "messaging_telegram_mtproto_sessions_telegram_user_id_length_check",
      sql`${table.telegramUserId} is null or length(trim(${table.telegramUserId})) between 1 and 200`
    ),
    check(
      "messaging_telegram_mtproto_sessions_lease_owner_length_check",
      sql`${table.leaseOwner} is null or length(trim(${table.leaseOwner})) between 1 and 200`
    ),
    index("messaging_telegram_mtproto_sessions_login_state_idx").on(table.loginState),
    index("messaging_telegram_mtproto_sessions_lease_idx").on(table.leasedUntil, table.loginState)
  ]
);
