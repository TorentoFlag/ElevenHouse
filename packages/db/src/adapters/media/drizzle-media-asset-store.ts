import { and, eq } from "drizzle-orm";
import type {
  MediaAsset,
  MediaAssetStore,
  MediaAssetStoreCreateInput,
  MediaImageMimeType,
  MediaPurpose,
  MediaStatus,
  MediaVariantName,
  MediaVisibility
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { mediaAssets, mediaVariants } from "../../schema";
import { insertReturningOne } from "../../shared";

type MediaAssetRow = typeof mediaAssets.$inferSelect;
type MediaVariantRow = typeof mediaVariants.$inferSelect;

export function createDrizzleMediaAssetStore(database: ElevenHouseDatabase): MediaAssetStore {
  return {
    createUploadingAsset: async (input) => {
      const row = await insertReturningOne(
        () => database.insert(mediaAssets).values(toMediaAssetInsertRow(input)).returning(),
        "media_assets"
      );
      return toMediaAsset(row, []);
    },
    findByOwnerAndId: async (input) => {
      const [row] = await database
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.ownerUserId, input.ownerUserId), eq(mediaAssets.id, input.mediaId)))
        .limit(1);
      if (!row) return null;

      return toMediaAsset(row, await listVariants(database, row.id));
    },
    markReady: async (input) => {
      const [row] = await database
        .update(mediaAssets)
        .set({
          status: "ready",
          checksumSha256: input.checksumSha256,
          width: input.width,
          height: input.height,
          failureReason: null,
          updatedAt: new Date(input.now)
        })
        .where(eq(mediaAssets.id, input.mediaId))
        .returning();
      if (!row) return null;

      return toMediaAsset(row, await listVariants(database, row.id));
    },
    markFailed: async (input) => {
      const [row] = await database
        .update(mediaAssets)
        .set({
          status: "failed",
          failureReason: input.reason,
          updatedAt: new Date(input.now)
        })
        .where(eq(mediaAssets.id, input.mediaId))
        .returning();
      if (!row) return null;

      return toMediaAsset(row, await listVariants(database, row.id));
    }
  };
}

function toMediaAssetInsertRow(input: MediaAssetStoreCreateInput): typeof mediaAssets.$inferInsert {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    purpose: input.purpose,
    status: "uploading",
    visibility: input.visibility,
    storageBucket: input.storageBucket,
    storageKey: input.storageKey,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

async function listVariants(
  database: ElevenHouseDatabase,
  assetId: string
): Promise<MediaVariantRow[]> {
  return database.select().from(mediaVariants).where(eq(mediaVariants.assetId, assetId));
}

function toMediaAsset(row: MediaAssetRow, variants: readonly MediaVariantRow[]): MediaAsset {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    purpose: row.purpose as MediaPurpose,
    status: row.status as MediaStatus,
    visibility: row.visibility as MediaVisibility,
    storageBucket: row.storageBucket,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType as MediaImageMimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    width: row.width,
    height: row.height,
    altText: row.altText,
    failureReason: row.failureReason,
    variants: variants.map((variant) => ({
      variant: variant.variant as MediaVariantName,
      storageBucket: variant.storageBucket,
      storageKey: variant.storageKey,
      mimeType: variant.mimeType as MediaImageMimeType,
      width: variant.width,
      height: variant.height,
      sizeBytes: variant.sizeBytes,
      createdAt: toIsoString(variant.createdAt)
    })),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
