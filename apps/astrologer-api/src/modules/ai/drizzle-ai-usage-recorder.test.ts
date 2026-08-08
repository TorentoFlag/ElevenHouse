import { describe, expect, it } from "vitest";
import type {
  AiUsageAttempt,
  AiUsageAttemptCompleteInput,
  AiUsageAttemptFailInput,
  AiUsageAttemptStartInput,
  AiUsageStore
} from "@elevenhouse/domain";
import { createDrizzleAiUsageRecorder } from "@elevenhouse/db";
import { DrizzleAiUsageRecorder } from "./drizzle-ai-usage-recorder";

describe("DrizzleAiUsageRecorder", () => {
  it("exports the same durable recorder for non-Nest runtimes", async () => {
    const store = new RecordingAiUsageStore();
    const recorder = createDrizzleAiUsageRecorder(store);

    await recorder.start({
      attemptId: "22222222-2222-4222-8222-222222222222",
      feature: "chart.interpretationDraft",
      promptId: "chart.interpretationDraft",
      promptVersion: 3,
      provider: "openai",
      ownerSafetyId: `eh_${"b".repeat(61)}`,
      resourceEvidence: null,
      startedAt: new Date("2026-08-03T12:00:00.000Z")
    });

    expect(store.started[0]).toMatchObject({ id: "22222222-2222-4222-8222-222222222222" });
  });

  it("bridges technical resource evidence to the durable domain store", async () => {
    const store = new RecordingAiUsageStore();
    const recorder = new DrizzleAiUsageRecorder(store);
    const attemptId = await recorder.start({
      attemptId: "11111111-1111-4111-8111-111111111111",
      feature: "chart.interpretationDraft",
      promptId: "chart.interpretationDraft",
      promptVersion: 3,
      provider: "openai",
      ownerSafetyId: `eh_${"a".repeat(61)}`,
      resourceEvidence: null,
      startedAt: new Date("2026-08-03T12:00:00.000Z")
    });
    await recorder.complete({
      attemptId,
      model: "gpt-5.4-mini",
      finishReason: "completed",
      durationMs: 10,
      completedAt: new Date("2026-08-03T12:00:00.010Z")
    });
    expect(store.started[0]).toMatchObject({ id: attemptId, resourceEvidence: null });
    expect(store.completed[0]).toMatchObject({ attemptId, durationMs: 10 });
  });
});

class RecordingAiUsageStore implements AiUsageStore {
  readonly started: AiUsageAttemptStartInput[] = [];
  readonly completed: AiUsageAttemptCompleteInput[] = [];
  private record: AiUsageAttempt | null = null;

  async startAttempt(input: AiUsageAttemptStartInput): Promise<AiUsageAttempt> {
    this.started.push(input);
    this.record = recordFromStart(input);
    return this.record;
  }

  async completeAttempt(input: AiUsageAttemptCompleteInput): Promise<AiUsageAttempt | null> {
    this.completed.push(input);
    if (!this.record) return null;
    this.record = {
      ...this.record,
      status: "succeeded",
      model: input.model,
      finishReason: input.finishReason,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs,
      completedAt: input.completedAt
    };
    return this.record;
  }

  async failAttempt(_input: AiUsageAttemptFailInput): Promise<AiUsageAttempt | null> {
    void _input;
    return null;
  }

  async reconcileStaleAttempts(): Promise<readonly AiUsageAttempt[]> {
    return [];
  }
}

function recordFromStart(input: AiUsageAttemptStartInput): AiUsageAttempt {
  return {
    id: input.id,
    feature: input.feature,
    promptId: input.promptId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ownerSafetyId: input.ownerSafetyId,
    resourceType: input.resourceEvidence?.resourceType ?? null,
    resourceId: input.resourceEvidence?.resourceId ?? null,
    sourceChecksum: input.resourceEvidence?.sourceChecksum ?? null,
    startedAt: input.startedAt,
    status: "started",
    model: null,
    finishReason: null,
    safeErrorCode: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    durationMs: null,
    completedAt: null
  };
}
