import { and, eq } from "drizzle-orm";
import type {
  AstroDiaryMediaAuthorizationContext,
  AstroDiaryMediaPendingUpload,
  AstroDiaryMediaUploadStore,
  MediaAsset,
  MediaImageMimeType,
  MediaMimeType,
  MediaPurpose,
  MediaStatus,
  MediaVariantName,
  MediaVisibility
} from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  astroDiaryJournals,
  astroDiaryMediaAuthorities,
  clientAstrologerRelationships,
  mediaAssets,
  mediaVariants
} from "../../schema";
import { insertReturningOne } from "../../shared";

const relationshipStateSchema = z.enum(["active", "archived", "blocked"]);
const journalStateSchema = z.enum(["active", "erasing", "erased"]);
const mediaStatusSchema = z.enum(["uploading", "processing", "ready", "failed", "deleted"]);

export type DrizzleAstroDiaryMediaStore = AstroDiaryMediaUploadStore &
  Readonly<{
    getAuthorizationContext(input: {
      readonly journalId: string;
      readonly actorUserId: string;
    }): Promise<AstroDiaryMediaAuthorizationContext | null>;
  }>;

export function createDrizzleAstroDiaryMediaStore(
  database: ElevenHouseDatabase
): DrizzleAstroDiaryMediaStore {
  return {
    getAuthorizationContext: async (input) => {
      const [row] = await database
        .select({
          journal: astroDiaryJournals,
          relationship: clientAstrologerRelationships
        })
        .from(astroDiaryJournals)
        .innerJoin(
          clientAstrologerRelationships,
          eq(clientAstrologerRelationships.id, astroDiaryJournals.relationshipId)
        )
        .where(eq(astroDiaryJournals.id, input.journalId))
        .limit(1);
      if (!row) return null;
      return {
        actorUserId: input.actorUserId,
        relationship: {
          id: row.relationship.id,
          clientUserId: row.relationship.clientUserId,
          astrologerUserId: row.relationship.astrologerUserId,
          state: relationshipStateSchema.parse(row.relationship.status)
        },
        journal: {
          id: row.journal.id,
          relationshipId: row.journal.relationshipId,
          clientUserId: row.journal.clientUserId,
          astrologerUserId: row.journal.astrologerUserId,
          state: journalStateSchema.parse(row.journal.state)
        }
      };
    },
    createPendingUpload: async (input) => {
      await database.transaction(async (transaction) => {
        await insertReturningOne(
          () =>
            transaction
              .insert(mediaAssets)
              .values({
                id: input.mediaId,
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
              })
              .returning({ id: mediaAssets.id }),
          "media_assets"
        );
        await insertReturningOne(
          () =>
            transaction
              .insert(astroDiaryMediaAuthorities)
              .values({
                mediaId: input.mediaId,
                journalId: input.journalId,
                ownerUserId: input.ownerUserId,
                purpose: input.purpose,
                visibility: "private",
                state: "pending",
                createdAt: new Date(input.now),
                updatedAt: new Date(input.now)
              })
              .returning({ mediaId: astroDiaryMediaAuthorities.mediaId }),
          "astro_diary_media_authorities"
        );
      });
    },
    findPendingUpload: async (input) => {
      const [row] = await database
        .select({ asset: mediaAssets, authority: astroDiaryMediaAuthorities })
        .from(astroDiaryMediaAuthorities)
        .innerJoin(mediaAssets, eq(mediaAssets.id, astroDiaryMediaAuthorities.mediaId))
        .where(
          and(
            eq(astroDiaryMediaAuthorities.journalId, input.journalId),
            eq(astroDiaryMediaAuthorities.mediaId, input.mediaId),
            eq(astroDiaryMediaAuthorities.ownerUserId, input.ownerUserId)
          )
        )
        .limit(1);
      if (!row) return null;
      return toPendingUpload(row.asset, row.authority, await listVariants(database, row.asset.id));
    },
    markReady: async (input) =>
      database.transaction(async (transaction) => {
        const [asset] = await transaction
          .update(mediaAssets)
          .set({
            status: "ready",
            checksumSha256: input.checksumSha256,
            width: input.width,
            height: input.height,
            failureReason: null,
            updatedAt: new Date(input.now)
          })
          .where(and(eq(mediaAssets.id, input.mediaId), eq(mediaAssets.status, "uploading")))
          .returning();
        if (!asset) return null;
        const [authority] = await transaction
          .update(astroDiaryMediaAuthorities)
          .set({
            state: "ready",
            readyAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(astroDiaryMediaAuthorities.mediaId, input.mediaId),
              eq(astroDiaryMediaAuthorities.state, "pending")
            )
          )
          .returning({ mediaId: astroDiaryMediaAuthorities.mediaId });
        if (!authority) throw new Error("AstroDiary media authority changed during completion");
        return toMediaAsset(asset, await listVariants(transaction, asset.id));
      }),
    markFailed: async (input) => {
      await database.transaction(async (transaction) => {
        await transaction
          .update(mediaAssets)
          .set({
            status: "failed",
            failureReason: input.reason,
            updatedAt: new Date(input.now)
          })
          .where(and(eq(mediaAssets.id, input.mediaId), eq(mediaAssets.status, "uploading")));
        await transaction
          .update(astroDiaryMediaAuthorities)
          .set({
            state: "failed",
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(astroDiaryMediaAuthorities.mediaId, input.mediaId),
              eq(astroDiaryMediaAuthorities.state, "pending")
            )
          );
      });
    }
  };
}

function toPendingUpload(
  asset: typeof mediaAssets.$inferSelect,
  authority: typeof astroDiaryMediaAuthorities.$inferSelect,
  variants: readonly (typeof mediaVariants.$inferSelect)[]
): AstroDiaryMediaPendingUpload {
  return {
    asset: toMediaAsset(asset, variants),
    media: {
      id: authority.mediaId,
      ownerUserId: authority.ownerUserId,
      journalId: authority.journalId,
      purpose: authority.purpose,
      visibility: "private",
      status:
        authority.state === "pending"
          ? mediaStatusSchema.parse(asset.status)
          : authority.state === "bound" || authority.state === "ready"
            ? "ready"
            : mediaStatusSchema.parse(authority.state),
      boundItemId: authority.boundItemId,
      accessRevoked: false
    }
  };
}

async function listVariants(
  database: Pick<ElevenHouseDatabase, "select">,
  assetId: string
): Promise<(typeof mediaVariants.$inferSelect)[]> {
  return database.select().from(mediaVariants).where(eq(mediaVariants.assetId, assetId));
}

function toMediaAsset(
  row: typeof mediaAssets.$inferSelect,
  variants: readonly (typeof mediaVariants.$inferSelect)[]
): MediaAsset {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    purpose: row.purpose as MediaPurpose,
    status: row.status as MediaStatus,
    visibility: row.visibility as MediaVisibility,
    storageBucket: row.storageBucket,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType as MediaMimeType,
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
