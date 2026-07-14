import { createHash } from "node:crypto";
import type { MatrixPdfJobStore } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import type { MatrixPdfRenderer } from "./matrix-pdf.renderer";
import type { MatrixPdfObjectStorage } from "./matrix-pdf.storage";

export async function processMatrixPdfJob(input: {
  readonly jobId: string;
  readonly finalAttempt: boolean;
  readonly store: MatrixPdfJobStore;
  readonly renderer: MatrixPdfRenderer;
  readonly storage: MatrixPdfObjectStorage;
  readonly now: Date;
  readonly logger?: Logger;
}): Promise<void> {
  const current = await input.store.findByJobId({ jobId: input.jobId });
  if (!current) throw new Error("Matrix PDF job was not found");
  if (current.status === "ready") return;
  if (current.status === "failed") throw new Error("Matrix PDF job is already failed");

  try {
    const claim = await input.store.claimForRendering({
      jobId: input.jobId,
      now: input.now.toISOString()
    });
    if (!claim) throw new Error("Matrix PDF job is stale or not renderable");

    const bytes = await input.renderer.render(claim);
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    await input.storage.putPdf({
      storageBucket: claim.storageBucket,
      storageKey: claim.storageKey,
      originalFileName: claim.originalFileName,
      bytes,
      checksumSha256
    });
    const completed = await input.store.complete({
      jobId: input.jobId,
      checksumSha256,
      sizeBytes: bytes.length,
      now: input.now.toISOString()
    });
    if (!completed) throw new Error("Matrix PDF completion could not be persisted");
    input.logger?.info("matrix PDF job completed", {
      jobId: input.jobId,
      sizeBytes: bytes.length,
      checksumSha256
    });
  } catch (error) {
    if (input.finalAttempt) {
      await input.store.fail({
        jobId: input.jobId,
        reason: normalizeErrorMessage(error),
        now: input.now.toISOString()
      });
    }
    throw error;
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Matrix PDF generation failed";
}
