import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { MatrixPdfJob, MatrixPdfJobStore, MatrixPdfRenderClaim } from "@elevenhouse/domain";
import { processMatrixPdfJob } from "./matrix-pdf.processor";

describe("processMatrixPdfJob", () => {
  it("renders, uploads and atomically completes a claimed job", async () => {
    const bytes = Buffer.from("%PDF-rendered");
    const store = createStore();
    const renderer = { render: vi.fn(async () => bytes) };
    const storage = { putPdf: vi.fn(async () => undefined) };

    await processMatrixPdfJob({
      jobId: claim.job.id,
      finalAttempt: false,
      store,
      renderer,
      storage,
      now
    });

    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(storage.putPdf).toHaveBeenCalledWith({
      storageBucket: claim.storageBucket,
      storageKey: claim.storageKey,
      originalFileName: claim.originalFileName,
      bytes,
      checksumSha256
    });
    expect(store.complete).toHaveBeenCalledWith({
      jobId: claim.job.id,
      checksumSha256,
      sizeBytes: bytes.length,
      now: now.toISOString()
    });
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("treats an already ready delivery as an idempotent success", async () => {
    const store = createStore({ status: "ready" });
    const renderer = { render: vi.fn() };
    const storage = { putPdf: vi.fn() };

    await expect(
      processMatrixPdfJob({
        jobId: claim.job.id,
        finalAttempt: true,
        store,
        renderer,
        storage,
        now
      })
    ).resolves.toBeUndefined();
    expect(store.claimForRendering).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("preserves retryable state until the final attempt and then marks all linked state failed", async () => {
    const retryStore = createStore();
    const renderer = {
      render: vi.fn(async () => {
        throw new Error("renderer unavailable");
      })
    };
    const storage = { putPdf: vi.fn() };

    await expect(
      processMatrixPdfJob({
        jobId: claim.job.id,
        finalAttempt: false,
        store: retryStore,
        renderer,
        storage,
        now
      })
    ).rejects.toThrow("renderer unavailable");
    expect(retryStore.fail).not.toHaveBeenCalled();

    const finalStore = createStore({ status: "processing" });
    await expect(
      processMatrixPdfJob({
        jobId: claim.job.id,
        finalAttempt: true,
        store: finalStore,
        renderer,
        storage,
        now
      })
    ).rejects.toThrow("renderer unavailable");
    expect(finalStore.fail).toHaveBeenCalledWith({
      jobId: claim.job.id,
      reason: "renderer unavailable",
      now: now.toISOString()
    });
  });
});

const now = new Date("2026-07-14T12:00:00.000Z");
const claim: MatrixPdfRenderClaim = {
  job: {
    id: "00000000-0000-4000-8000-000000000001",
    calculationId: "00000000-0000-4000-8000-000000000002",
    ownerUserId: "00000000-0000-4000-8000-000000000003",
    reportId: "00000000-0000-4000-8000-000000000004",
    reportRevision: 1,
    resultChecksum: `sha256:${"a".repeat(64)}`,
    locale: "ru",
    status: "processing",
    artifactId: "00000000-0000-4000-8000-000000000005",
    mediaAssetId: "00000000-0000-4000-8000-000000000006",
    failureReason: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  },
  report: {
    content: {
      overview: "Обзор",
      corePortrait: "Портрет",
      strengthsAndTalents: "Таланты",
      growthAreas: "Рост",
      moneyAndRealization: "Деньги",
      relationships: "Отношения",
      lineageThemes: "Род",
      purposes: "Цели",
      yearProjection: null,
      reflectionQuestions: ["Вопрос?"],
      practicalSteps: ["Шаг"],
      disclaimer: "Важно"
    },
    plainText: "Обзор"
  },
  storageBucket: "elevenhouse-local-private",
  storageKey: "owner/matrix_report_pdf/job/report.pdf",
  originalFileName: "Матрица судьбы.pdf"
};

function createStore(overrides: Partial<MatrixPdfRenderClaim["job"]> = {}): MatrixPdfJobStore {
  const job: MatrixPdfJob = { ...claim.job, status: "queued", ...overrides };
  return {
    findLatestByCalculation: vi.fn(async () => job),
    findById: vi.fn(async () => job),
    findByJobId: vi.fn(async () => job),
    enqueue: vi.fn(async () => job),
    claimForRendering: vi.fn(async () => ({
      ...claim,
      job: { ...job, status: "processing" as const }
    })),
    complete: vi.fn(async () => ({ ...job, status: "ready" as const })),
    fail: vi.fn(async () => ({ ...job, status: "failed" as const }))
  };
}
