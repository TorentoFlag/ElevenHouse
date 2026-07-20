import { createHash } from "node:crypto";
import {
  chartInputSnapshotSchema,
  chartSettingsSchema,
  type ChartNatalCalculationRequest,
  type StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import type { ChartJobProcessingStore } from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";
import { ChartEnginePermanentError } from "./chart-engine-client";

export type ChartEngineClient = {
  readonly calculateNatal: (
    payload: ChartNatalCalculationRequest
  ) => Promise<StoredChartCalculationPayload>;
};

export async function processChartCalculationJob(input: {
  readonly jobId: string;
  readonly finalAttempt: boolean;
  readonly store: ChartJobProcessingStore;
  readonly engine: ChartEngineClient;
  readonly now: Date;
}): Promise<void> {
  const current = await input.store.findByJobId(input.jobId);
  if (!current) throw new UnrecoverableError("Chart calculation job was not found");
  if (current.status === "succeeded") return;
  if (current.status === "failed") {
    throw new UnrecoverableError("Chart calculation job is already failed");
  }

  try {
    const claim = await input.store.claimForProcessing({
      jobId: input.jobId,
      now: input.now.toISOString()
    });
    if (!claim) throw new UnrecoverableError("Chart calculation job is stale");
    const request: ChartNatalCalculationRequest = {
      schemaVersion: "chart-request.v1",
      method: "natal",
      settings: chartSettingsSchema.parse(claim.settingsSnapshot),
      inputSnapshot: chartInputSnapshotSchema.parse(claim.inputSnapshot)
    };
    const result = await input.engine.calculateNatal(request);
    const completed = await input.store.complete({
      jobId: input.jobId,
      result,
      resultChecksum: checksum(result),
      now: input.now.toISOString()
    });
    if (!completed) throw new Error("Chart calculation completion could not be persisted");
  } catch (error) {
    if (error instanceof ChartEnginePermanentError || error instanceof UnrecoverableError) {
      if (error instanceof ChartEnginePermanentError) {
        await input.store.fail({
          jobId: input.jobId,
          code: "provider_invalid_result",
          reason: normalizeErrorMessage(error),
          now: input.now.toISOString()
        });
      }
      throw createUnrecoverableError(error);
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

function createUnrecoverableError(error: Error): UnrecoverableError {
  if (error instanceof UnrecoverableError) return error;
  const unrecoverableError = new UnrecoverableError(error.message);
  unrecoverableError.cause = error;
  return unrecoverableError;
}

function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Chart calculation failed";
}
