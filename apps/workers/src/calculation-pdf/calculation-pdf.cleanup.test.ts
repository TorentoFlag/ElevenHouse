import type { CalculationPdfCleanupStore } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { processCalculationPdfCleanup } from "./calculation-pdf.cleanup";

const mediaAssetId = "00000000-0000-4000-8000-000000000001";
const media = {
  id: mediaAssetId,
  storageBucket: "elevenhouse-local-private",
  storageKey: "owner/calculation_report_pdf/job/report.pdf",
  purpose: "calculation_report_pdf" as const,
  visibility: "private" as const
};

describe("processCalculationPdfCleanup", () => {
  it("deletes the private object before the unreferenced Media row", async () => {
    const calls: string[] = [];
    const store = createStore();
    const storage = {
      deletePdf: vi.fn(async () => {
        calls.push("object");
      })
    };
    vi.mocked(store.deleteIfUnreferenced).mockImplementationOnce(async () => {
      calls.push("media");
      return true;
    });

    await processCalculationPdfCleanup({ mediaAssetId, store, storage });

    expect(calls).toEqual(["object", "media"]);
    expect(store.deleteIfUnreferenced).toHaveBeenCalledWith({
      mediaAssetId,
      expectedStorageBucket: media.storageBucket,
      expectedStorageKey: media.storageKey
    });
  });

  it("treats an already removed Media row as success", async () => {
    const store = createStore(null);
    const storage = { deletePdf: vi.fn() };

    await expect(
      processCalculationPdfCleanup({ mediaAssetId, store, storage })
    ).resolves.toBeUndefined();
    expect(storage.deletePdf).not.toHaveBeenCalled();
  });

  it("does not delete the Media row when object storage fails", async () => {
    const store = createStore();
    const storage = {
      deletePdf: vi.fn(async () => {
        throw new Error("S3 unavailable");
      })
    };

    await expect(processCalculationPdfCleanup({ mediaAssetId, store, storage })).rejects.toThrow(
      "S3 unavailable"
    );
    expect(store.deleteIfUnreferenced).not.toHaveBeenCalled();
  });
});

function createStore(found: typeof media | null = media): CalculationPdfCleanupStore {
  return {
    findByMediaAssetId: vi.fn(async () => found),
    deleteIfUnreferenced: vi.fn(async () => true)
  };
}
