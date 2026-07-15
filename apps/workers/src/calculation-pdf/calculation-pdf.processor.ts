import { createHash } from "node:crypto";
import type { CalculationPdfJobStore, MediaAssetStore } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { UnrecoverableError } from "bullmq";
import {
  CalculationPdfPermanentError,
  type CalculationPdfRegistry
} from "./calculation-pdf.registry";
import type { CalculationPdfObjectStorage } from "./calculation-pdf.storage";

export async function processCalculationPdfJob(input: {
  readonly jobId: string;
  readonly finalAttempt: boolean;
  readonly store: CalculationPdfJobStore;
  readonly mediaStore: MediaAssetStore;
  readonly registry: CalculationPdfRegistry;
  readonly storage: Pick<CalculationPdfObjectStorage, "putPdf">;
  readonly now: Date;
  readonly logger?: Logger;
}): Promise<void> {
  const current = await input.store.findByJobId({ jobId: input.jobId });
  if (!current) throw new UnrecoverableError("Calculation PDF job was not found");
  if (current.status === "ready") return;
  if (current.status === "failed") {
    throw new UnrecoverableError("Calculation PDF job is already failed");
  }

  try {
    const claim = await input.store.claimForRendering({
      jobId: input.jobId,
      now: input.now.toISOString()
    });
    if (!claim) {
      throw new CalculationPdfPermanentError(
        "stale_job",
        "Calculation PDF job is stale or not renderable"
      );
    }
    const media = await input.mediaStore.findByOwnerAndId({
      ownerUserId: claim.ownerUserId,
      mediaId: claim.mediaAssetId
    });
    if (
      !media ||
      media.purpose !== "calculation_report_pdf" ||
      media.visibility !== "private" ||
      media.mimeType !== "application/pdf" ||
      (media.status !== "processing" && media.status !== "ready")
    ) {
      throw new CalculationPdfPermanentError(
        "invalid_delivery_target",
        "Calculation PDF delivery target is invalid"
      );
    }
    const rendered = await input.registry.render(claim);
    if (
      rendered.bytes.length === 0 ||
      !Number.isInteger(rendered.pageCount) ||
      rendered.pageCount < 1
    ) {
      throw new CalculationPdfPermanentError(
        "invalid_document",
        "Calculation PDF renderer returned an invalid document"
      );
    }
    const checksumSha256 = createHash("sha256").update(rendered.bytes).digest("hex");
    await input.storage.putPdf({
      storageBucket: media.storageBucket,
      storageKey: media.storageKey,
      originalFileName: media.originalFileName,
      bytes: rendered.bytes,
      checksumSha256
    });
    const completed = await input.store.complete({
      jobId: input.jobId,
      checksumSha256,
      sizeBytes: rendered.bytes.length,
      pageCount: rendered.pageCount,
      now: input.now.toISOString()
    });
    if (!completed) throw new Error("Calculation PDF completion could not be persisted");
    input.logger?.info("calculation PDF job completed", {
      jobId: input.jobId,
      sizeBytes: rendered.bytes.length,
      pageCount: rendered.pageCount,
      checksumSha256
    });
  } catch (error) {
    if (error instanceof CalculationPdfPermanentError) {
      const failed = await input.store.fail({
        jobId: input.jobId,
        code: error.code,
        reason: normalizeErrorMessage(error),
        now: input.now.toISOString()
      });
      if (!failed) throw new Error("Calculation PDF failure could not be persisted");
      throw new UnrecoverableError(error.message);
    }
    if (input.finalAttempt) {
      await input.store.fail({
        jobId: input.jobId,
        code: "retry_exhausted",
        reason: normalizeErrorMessage(error),
        now: input.now.toISOString()
      });
    }
    throw error;
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Calculation PDF generation failed";
}
