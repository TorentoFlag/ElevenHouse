import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  formatMediaSqlValues,
  mediaMimeTypeValues,
  mediaPurposeValues,
  mediaStatusValues,
  mediaVisibilityValues
} from "./media-values";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    status: text("status").notNull().default("uploading"),
    visibility: text("visibility").notNull(),
    storageBucket: text("storage_bucket").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256"),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("media_assets_storage_bucket_storage_key_unique").on(
      table.storageBucket,
      table.storageKey
    ),
    unique("media_assets_id_owner_unique").on(table.id, table.ownerUserId),
    check(
      "media_assets_purpose_check",
      sql`${table.purpose} in ${sql.raw(formatMediaSqlValues(mediaPurposeValues))}`
    ),
    check(
      "media_assets_status_check",
      sql`${table.status} in ${sql.raw(formatMediaSqlValues(mediaStatusValues))}`
    ),
    check(
      "media_assets_visibility_check",
      sql`${table.visibility} in ${sql.raw(formatMediaSqlValues(mediaVisibilityValues))}`
    ),
    check(
      "media_assets_mime_type_check",
      sql`${table.mimeType} in ${sql.raw(formatMediaSqlValues(mediaMimeTypeValues))}`
    ),
    check("media_assets_size_bytes_check", sql`${table.sizeBytes} >= 0`),
    check(
      "media_assets_ready_size_bytes_check",
      sql`${table.status} <> 'ready' or ${table.sizeBytes} > 0`
    ),
    check(
      "media_assets_width_check",
      sql`${table.width} is null or ${table.width} > 0`
    ),
    check(
      "media_assets_height_check",
      sql`${table.height} is null or ${table.height} > 0`
    ),
    check(
      "media_assets_checksum_sha256_check",
      sql`${table.checksumSha256} is null or ${table.checksumSha256} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "media_assets_alt_text_length_check",
      sql`${table.altText} is null or length(trim(${table.altText})) <= 300`
    ),
    index("media_assets_owner_purpose_status_created_idx").on(
      table.ownerUserId,
      table.purpose,
      table.status,
      table.createdAt
    ),
    index("media_assets_owner_created_id_idx").on(
      table.ownerUserId,
      table.createdAt,
      table.id
    )
  ]
);
