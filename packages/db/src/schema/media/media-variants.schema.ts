import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { mediaAssets } from "./media-assets.schema";
import {
  formatMediaSqlValues,
  mediaImageMimeTypeValues,
  mediaVariantValues
} from "./media-values";

export const mediaVariants = pgTable(
  "media_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    variant: text("variant").notNull(),
    storageBucket: text("storage_bucket").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("media_variants_asset_variant_unique").on(table.assetId, table.variant),
    unique("media_variants_storage_bucket_storage_key_unique").on(
      table.storageBucket,
      table.storageKey
    ),
    check(
      "media_variants_variant_check",
      sql`${table.variant} in ${sql.raw(formatMediaSqlValues(mediaVariantValues))}`
    ),
    check(
      "media_variants_mime_type_check",
      sql`${table.mimeType} in ${sql.raw(formatMediaSqlValues(mediaImageMimeTypeValues))}`
    ),
    check("media_variants_width_check", sql`${table.width} > 0`),
    check("media_variants_height_check", sql`${table.height} > 0`),
    check("media_variants_size_bytes_check", sql`${table.sizeBytes} > 0`),
    index("media_variants_asset_id_idx").on(table.assetId)
  ]
);
