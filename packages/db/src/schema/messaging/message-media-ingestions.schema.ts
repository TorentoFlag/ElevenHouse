import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { mediaAssets } from "../media/media-assets.schema";
import { messagingChannelConnections } from "./channel-connections.schema";
import {
  formatMessagingSqlValues,
  messagingMediaIngestionStatusValues,
  messagingMessageContentTypeValues,
  messagingProviderValues
} from "./messaging-values";
import { messagingMessages } from "./messages.schema";

export const messageMediaIngestions = pgTable(
  "message_media_ingestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messagingMessages.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => messagingChannelConnections.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerFileId: text("provider_file_id").notNull(),
    providerFileUniqueId: text("provider_file_unique_id").notNull(),
    providerMimeType: text("provider_mime_type"),
    providerSizeBytes: integer("provider_size_bytes"),
    contentType: text("content_type").notNull(),
    durationSeconds: integer("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    downloadStatus: text("download_status").notNull().default("pending"),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "restrict"
    }),
    failureCode: text("failure_code"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    checksumSha256: text("checksum_sha256"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("message_media_ingestions_message_unique").on(table.messageId),
    index("message_media_ingestions_status_retry_idx").on(
      table.downloadStatus,
      table.nextRetryAt,
      table.createdAt
    ),
    index("message_media_ingestions_message_idx").on(table.messageId),
    check(
      "message_media_ingestions_provider_check",
      sql`${table.provider} in ${sql.raw(formatMessagingSqlValues(messagingProviderValues))}`
    ),
    check(
      "message_media_ingestions_content_type_check",
      sql`${table.contentType} in ${sql.raw(formatMessagingSqlValues(messagingMessageContentTypeValues))}`
    ),
    check(
      "message_media_ingestions_download_status_check",
      sql`${table.downloadStatus} in ${sql.raw(
        formatMessagingSqlValues(messagingMediaIngestionStatusValues)
      )}`
    ),
    check(
      "message_media_ingestions_provider_size_check",
      sql`${table.providerSizeBytes} is null or ${table.providerSizeBytes} >= 0`
    ),
    check(
      "message_media_ingestions_duration_check",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`
    ),
    check(
      "message_media_ingestions_width_check",
      sql`${table.width} is null or ${table.width} > 0`
    ),
    check(
      "message_media_ingestions_height_check",
      sql`${table.height} is null or ${table.height} > 0`
    ),
    check(
      "message_media_ingestions_attempt_count_check",
      sql`${table.attemptCount} >= 0`
    ),
    check(
      "message_media_ingestions_checksum_check",
      sql`${table.checksumSha256} is null or ${table.checksumSha256} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "message_media_ingestions_ready_media_check",
      sql`${table.downloadStatus} <> 'ready' or ${table.mediaAssetId} is not null`
    )
  ]
);
