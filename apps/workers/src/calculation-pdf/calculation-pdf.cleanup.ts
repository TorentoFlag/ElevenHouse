import type { CalculationPdfCleanupStore } from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";
import type { CalculationPdfObjectStorage } from "./calculation-pdf.storage";

export async function processCalculationPdfCleanup(input: {
  readonly mediaAssetId: string;
  readonly store: CalculationPdfCleanupStore;
  readonly storage: Pick<CalculationPdfObjectStorage, "deletePdf">;
}): Promise<void> {
  const media = await input.store.findByMediaAssetId({ mediaAssetId: input.mediaAssetId });
  if (!media) return;
  if (media.purpose !== "calculation_report_pdf" || media.visibility !== "private") {
    throw new UnrecoverableError("Calculation PDF cleanup target is invalid");
  }
  await input.storage.deletePdf({
    storageBucket: media.storageBucket,
    storageKey: media.storageKey
  });
  const deleted = await input.store.deleteIfUnreferenced({
    mediaAssetId: media.id,
    expectedStorageBucket: media.storageBucket,
    expectedStorageKey: media.storageKey
  });
  if (deleted) return;
  const current = await input.store.findByMediaAssetId({ mediaAssetId: input.mediaAssetId });
  if (current) throw new Error("Calculation PDF Media is still referenced");
}
