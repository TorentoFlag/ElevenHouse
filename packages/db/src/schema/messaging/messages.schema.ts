import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { messagingChannelConnections } from "./channel-connections.schema";
import { messagingExternalIdentities } from "./external-identities.schema";
import {
  formatMessagingSqlValues,
  messagingMessageContentTypeValues,
  messagingMessageDirectionValues,
  messagingMessageSenderKindValues,
  messagingMessageStatusValues
} from "./messaging-values";
import { messagingThreads } from "./threads.schema";

export const messagingMessages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => messagingChannelConnections.id, { onDelete: "restrict" }),
    externalIdentityId: uuid("external_identity_id").references(
      () => messagingExternalIdentities.id,
      { onDelete: "set null" }
    ),
    direction: text("direction").notNull(),
    senderKind: text("sender_kind").notNull(),
    providerMessageId: text("provider_message_id"),
    providerUpdateId: text("provider_update_id"),
    providerSentAt: timestamp("provider_sent_at", { withTimezone: true }),
    contentType: text("content_type").notNull().default("text"),
    text: text("text").notNull(),
    mediaAssetId: uuid("media_asset_id"),
    status: text("status").notNull(),
    failureCode: text("failure_code"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("messages_inbound_provider_dedupe_unique")
      .on(table.channelConnectionId, table.externalIdentityId, table.providerMessageId, table.direction)
      .where(sql`${table.providerMessageId} is not null and ${table.externalIdentityId} is not null`),
    uniqueIndex("messages_outbound_idempotency_unique")
      .on(table.threadId, table.idempotencyKey)
      .where(sql`${table.direction} = 'outbound'`),
    index("messages_thread_created_idx").on(table.threadId, table.createdAt, table.id),
    check(
      "messages_direction_check",
      sql`${table.direction} in ${sql.raw(formatMessagingSqlValues(messagingMessageDirectionValues))}`
    ),
    check(
      "messages_sender_kind_check",
      sql`${table.senderKind} in ${sql.raw(formatMessagingSqlValues(messagingMessageSenderKindValues))}`
    ),
    check(
      "messages_content_type_check",
      sql`${table.contentType} in ${sql.raw(formatMessagingSqlValues(messagingMessageContentTypeValues))}`
    ),
    check(
      "messages_status_check",
      sql`${table.status} in ${sql.raw(formatMessagingSqlValues(messagingMessageStatusValues))}`
    ),
    check("messages_text_length_check", sql`length(${table.text}) <= 4000`),
    check(
      "messages_outbound_request_check",
      sql`${table.direction} <> 'outbound' or (${table.idempotencyKey} is not null and ${table.requestHash} ~ '^sha256:[a-f0-9]{64}$')`
    )
  ]
);
