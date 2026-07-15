import { and, eq, notExists } from "drizzle-orm";
import type { CalculationPdfCleanupStore } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { calculationArtifacts, calculationPdfJobs, mediaAssets } from "../../schema";

export function createDrizzleCalculationPdfCleanupStore(
  database: ElevenHouseDatabase
): CalculationPdfCleanupStore {
  return {
    findByMediaAssetId: async (input) => {
      const [row] = await database
        .select({
          id: mediaAssets.id,
          purpose: mediaAssets.purpose,
          visibility: mediaAssets.visibility,
          storageBucket: mediaAssets.storageBucket,
          storageKey: mediaAssets.storageKey
        })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, input.mediaAssetId),
            eq(mediaAssets.purpose, "calculation_report_pdf"),
            eq(mediaAssets.visibility, "private")
          )
        )
        .limit(1);
      return row
        ? {
            ...row,
            purpose: "calculation_report_pdf" as const,
            visibility: "private" as const
          }
        : null;
    },
    deleteIfUnreferenced: async (input) => {
      const deleted = await database
        .delete(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, input.mediaAssetId),
            eq(mediaAssets.purpose, "calculation_report_pdf"),
            eq(mediaAssets.visibility, "private"),
            eq(mediaAssets.storageBucket, input.expectedStorageBucket),
            eq(mediaAssets.storageKey, input.expectedStorageKey),
            notExists(
              database
                .select({ id: calculationPdfJobs.id })
                .from(calculationPdfJobs)
                .where(eq(calculationPdfJobs.mediaAssetId, input.mediaAssetId))
            ),
            notExists(
              database
                .select({ id: calculationArtifacts.id })
                .from(calculationArtifacts)
                .where(eq(calculationArtifacts.mediaAssetId, input.mediaAssetId))
            )
          )
        )
        .returning({ id: mediaAssets.id });
      return deleted.length > 0;
    }
  };
}
