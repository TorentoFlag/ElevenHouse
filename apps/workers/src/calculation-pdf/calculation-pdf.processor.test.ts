import { createHash } from "node:crypto";
import type { CalculationPdfJobStore, MediaAsset, MediaAssetStore } from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { processCalculationPdfJob } from "./calculation-pdf.processor";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";
import { job } from "./calculation-pdf.registry.test";

const now = new Date("2026-07-15T12:00:00.000Z");

describe("processCalculationPdfJob", () => {
  it("renders, uploads and atomically completes a claimed job", async () => {
    const bytes = Buffer.from("%PDF-rendered");
    const store = createJobStore();
    const mediaStore = createMediaStore();
    const registry = { render: vi.fn(async () => ({ bytes, pageCount: 3 })) };
    const storage = { putPdf: vi.fn(async () => undefined) };

    await processCalculationPdfJob({
      jobId: job().id,
      finalAttempt: false,
      store,
      mediaStore,
      registry,
      storage,
      now
    });

    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(storage.putPdf).toHaveBeenCalledWith({
      storageBucket: "elevenhouse-local-private",
      storageKey: "owner/calculation_report_pdf/job/report.pdf",
      originalFileName: "Нумерология.pdf",
      bytes,
      checksumSha256
    });
    expect(store.complete).toHaveBeenCalledWith({
      jobId: job().id,
      checksumSha256,
      sizeBytes: bytes.length,
      pageCount: 3,
      now: now.toISOString()
    });
  });

  it("returns an already ready job as an idempotent success", async () => {
    const store = createJobStore({ status: "ready" });
    const registry = { render: vi.fn() };

    await expect(
      processCalculationPdfJob({
        jobId: job().id,
        finalAttempt: true,
        store,
        mediaStore: createMediaStore(),
        registry,
        storage: { putPdf: vi.fn() },
        now
      })
    ).resolves.toBeUndefined();
    expect(store.claimForRendering).not.toHaveBeenCalled();
    expect(registry.render).not.toHaveBeenCalled();
  });

  it("stops a render superseded while it was in progress without recording a false failure", async () => {
    const store = createJobStore();
    vi.mocked(store.complete).mockResolvedValueOnce(null);

    const failure = await processCalculationPdfJob({
      jobId: job().id,
      finalAttempt: true,
      store,
      mediaStore: createMediaStore(),
      registry: {
        render: vi.fn(async () => ({ bytes: Buffer.from("%PDF"), pageCount: 1 }))
      },
      storage: { putPdf: vi.fn() },
      now
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("persists permanent failures and stops BullMQ retries", async () => {
    const store = createJobStore();
    const registry = {
      render: vi.fn(async () => {
        throw new CalculationPdfPermanentError("stale_source", "Source is stale");
      })
    };

    const failure = await processCalculationPdfJob({
      jobId: job().id,
      finalAttempt: false,
      store,
      mediaStore: createMediaStore(),
      registry,
      storage: { putPdf: vi.fn() },
      now
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(store.fail).toHaveBeenCalledWith({
      jobId: job().id,
      code: "stale_source",
      reason: "Source is stale",
      now: now.toISOString()
    });
  });

  it("keeps transient failures retryable and records exhausted delivery", async () => {
    const retryStore = createJobStore();
    const storage = {
      putPdf: vi.fn(async () => {
        throw new Error("S3 unavailable");
      })
    };
    const input = {
      jobId: job().id,
      store: retryStore,
      mediaStore: createMediaStore(),
      registry: { render: vi.fn(async () => ({ bytes: Buffer.from("%PDF"), pageCount: 1 })) },
      storage,
      now
    };

    await expect(processCalculationPdfJob({ ...input, finalAttempt: false })).rejects.toThrow(
      "S3 unavailable"
    );
    expect(retryStore.fail).not.toHaveBeenCalled();

    const finalStore = createJobStore({ status: "processing" });
    await expect(
      processCalculationPdfJob({ ...input, store: finalStore, finalAttempt: true })
    ).rejects.toThrow("S3 unavailable");
    expect(finalStore.fail).toHaveBeenCalledWith({
      jobId: job().id,
      code: "retry_exhausted",
      reason: "S3 unavailable",
      now: now.toISOString()
    });
  });
});

function createJobStore(overrides: Partial<ReturnType<typeof job>> = {}): CalculationPdfJobStore {
  const current = job(overrides);
  return {
    findLatestByCalculation: vi.fn(async () => current),
    findById: vi.fn(async () => current),
    findByJobId: vi.fn(async () => current),
    enqueue: vi.fn(async () => current),
    claimForRendering: vi.fn(async () => ({ ...current, status: "processing" as const })),
    complete: vi.fn(async () => ({ ...current, status: "ready" as const })),
    fail: vi.fn(async () => ({ ...current, status: "failed" as const }))
  };
}

function createMediaStore(): MediaAssetStore {
  const media: MediaAsset = {
    id: job().mediaAssetId,
    ownerUserId: job().ownerUserId,
    purpose: "calculation_report_pdf",
    status: "processing",
    visibility: "private",
    storageBucket: "elevenhouse-local-private",
    storageKey: "owner/calculation_report_pdf/job/report.pdf",
    originalFileName: "Нумерология.pdf",
    mimeType: "application/pdf",
    sizeBytes: 0,
    checksumSha256: null,
    width: null,
    height: null,
    altText: null,
    failureReason: null,
    variants: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return {
    createUploadingAsset: vi.fn(async () => never()),
    findByOwnerAndId: vi.fn(async () => media),
    markReady: vi.fn(async () => never()),
    markFailed: vi.fn(async () => never())
  };
}

function never(): never {
  throw new Error("Unexpected dependency call");
}
