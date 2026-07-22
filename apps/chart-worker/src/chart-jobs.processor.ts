import { createHash } from "node:crypto";
import {
  chartInputSnapshotSchema,
  chartSolarReturnCalculationRequestSchema,
  chartSettingsSchema,
  type ChartNatalCalculationRequest,
  type ChartSolarReturnCalculationRequest,
  chartSynastryCalculationRequestSchema,
  type ChartSynastryCalculationRequest,
  chartTransitSnapshotSchema,
  type ChartTransitCalculationRequest,
  type StoredChartSolarReturnCalculationPayload,
  type StoredChartSynastryCalculationPayload,
  type StoredChartTransitCalculationPayload,
  type StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import { ChartEnginePermanentError } from "@elevenhouse/chart-engine-client";
import type { ChartJobProcessingStore } from "@elevenhouse/domain";
import { UnrecoverableError } from "bullmq";

export type ChartEngineClient = {
  readonly calculateNatal: (
    payload: ChartNatalCalculationRequest
  ) => Promise<StoredChartCalculationPayload>;
  readonly calculateTransit: (
    payload: ChartTransitCalculationRequest
  ) => Promise<StoredChartTransitCalculationPayload>;
  readonly calculateSynastry: (
    payload: ChartSynastryCalculationRequest
  ) => Promise<StoredChartSynastryCalculationPayload>;
  readonly calculateSolarReturn: (
    payload: ChartSolarReturnCalculationRequest
  ) => Promise<StoredChartSolarReturnCalculationPayload>;
};

const transitJobInputSnapshotSchema = z
  .object({
    inputSnapshot: chartInputSnapshotSchema,
    transitSnapshot: chartTransitSnapshotSchema
  })
  .strict();

const synastryJobInputSnapshotSchema = chartSynastryCalculationRequestSchema
  .pick({
    inputSnapshot: true,
    partnerInputSnapshot: true,
    relationshipSnapshot: true
  })
  .strict();

const solarReturnJobInputSnapshotSchema = chartSolarReturnCalculationRequestSchema
  .pick({
    inputSnapshot: true,
    solarReturnSnapshot: true
  })
  .strict();

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
    const result = await calculateChartResult({ claim, engine: input.engine });
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

async function calculateChartResult(input: {
  readonly claim: Awaited<ReturnType<ChartJobProcessingStore["claimForProcessing"]>>;
  readonly engine: ChartEngineClient;
}): Promise<StoredChartCalculationPayload> {
  const claim = input.claim;
  if (!claim) throw new UnrecoverableError("Chart calculation job is stale");
  const settings = chartSettingsSchema.parse(claim.settingsSnapshot);
  if (claim.method === "natal") {
    const request: ChartNatalCalculationRequest = {
      schemaVersion: "chart-request.v1",
      method: "natal",
      settings,
      inputSnapshot: chartInputSnapshotSchema.parse(claim.inputSnapshot)
    };
    return input.engine.calculateNatal(request);
  }
  if (claim.method === "transit") {
    const snapshots = transitJobInputSnapshotSchema.parse(claim.inputSnapshot);
    const request: ChartTransitCalculationRequest = {
      schemaVersion: "chart-request.v1",
      method: "transit",
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      transitSnapshot: snapshots.transitSnapshot
    };
    return input.engine.calculateTransit(request);
  }
  if (claim.method === "synastry") {
    const snapshots = synastryJobInputSnapshotSchema.parse(claim.inputSnapshot);
    const request: ChartSynastryCalculationRequest = {
      schemaVersion: "chart-request.v1",
      method: "synastry",
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      partnerInputSnapshot: snapshots.partnerInputSnapshot,
      relationshipSnapshot: snapshots.relationshipSnapshot
    };
    return input.engine.calculateSynastry(request);
  }
  if (claim.method === "solar_return") {
    const snapshots = solarReturnJobInputSnapshotSchema.parse(claim.inputSnapshot);
    const request: ChartSolarReturnCalculationRequest = {
      schemaVersion: "chart-request.v1",
      method: "solar_return",
      settings,
      inputSnapshot: snapshots.inputSnapshot,
      solarReturnSnapshot: snapshots.solarReturnSnapshot
    };
    return input.engine.calculateSolarReturn(request);
  }
  throw new UnrecoverableError("Unsupported chart calculation method");
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
