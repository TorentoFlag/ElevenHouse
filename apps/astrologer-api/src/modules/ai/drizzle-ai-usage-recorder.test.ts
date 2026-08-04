import { describe, expect, it } from "vitest";
import type {
  AiUsageAttempt,
  AiUsageAttemptCompleteInput,
  AiUsageAttemptFailInput,
  AiUsageAttemptStartInput,
  AiUsageStore
} from "@elevenhouse/domain";
import { DrizzleAiUsageRecorder } from "./drizzle-ai-usage-recorder";

describe("DrizzleAiUsageRecorder", () => {
  it("bridges the awaited app lifecycle to the durable domain store", async () => {
    const store = new RecordingAiUsageStore();
    const recorder = new DrizzleAiUsageRecorder(store);

    const generatedAttemptId = await recorder.start({
      attemptId: "11111111-1111-4111-8111-111111111111",
      feature: "chart.interpretationDraft",
      promptId: "chart.interpretationDraft",
      promptVersion: 3,
      provider: "openai",
      ownerSafetyId: `eh_${"a".repeat(61)}`,
      consentAuthorizations: [],
      processingAuthorityVersion: null,
      resourceEvidence: null,
      startedAt: new Date("2026-08-03T12:00:00.000Z")
    });
    expect(generatedAttemptId).toBe("11111111-1111-4111-8111-111111111111");
    await recorder.complete({
      attemptId: generatedAttemptId,
      model: "gpt-5.4-mini",
      finishReason: "completed",
      durationMs: 10,
      completedAt: new Date("2026-08-03T12:00:00.010Z")
    });

    expect(store.started[0]).toMatchObject({ id: generatedAttemptId });
    expect(store.completed[0]).toMatchObject({ attemptId: generatedAttemptId, durationMs: 10 });
  });
});

class RecordingAiUsageStore implements AiUsageStore {
  readonly started: AiUsageAttemptStartInput[] = [];
  readonly completed: AiUsageAttemptCompleteInput[] = [];
  readonly failed: AiUsageAttemptFailInput[] = [];
  private record: AiUsageAttempt | null = null;

  async startAttempt(input: AiUsageAttemptStartInput): Promise<AiUsageAttempt> {
    this.started.push(input);
    this.record = {
      id: input.id,
      feature: input.feature,
      promptId: input.promptId,
      promptVersion: input.promptVersion,
      provider: input.provider,
      ownerSafetyId: input.ownerSafetyId,
      consentRecordIds: input.consentAuthorizations.map(({ consentRecordId }) => consentRecordId),
      processingAuthorityVersion: input.processingAuthorityVersion,
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

  async failAttempt(input: AiUsageAttemptFailInput): Promise<AiUsageAttempt | null> {
    this.failed.push(input);
    return null;
  }

  async reconcileStaleAttempts(): Promise<readonly AiUsageAttempt[]> {
    return [];
  }
}
