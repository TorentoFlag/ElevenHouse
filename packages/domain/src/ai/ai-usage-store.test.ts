import { describe, expect, it } from "vitest";
import {
  completeAiUsageAttempt,
  failAiUsageAttempt,
  reconcileStaleAiUsageAttempts,
  startAiUsageAttempt,
  type AiUsageAttempt,
  type AiUsageStore
} from "./ai-usage-store";

const attemptId = "11111111-1111-4111-8111-111111111111";
const startedAt = new Date("2026-08-03T12:00:00.000Z");
const resourceEvidence = {
  resourceType: "chart_calculation",
  resourceId: "88888888-8888-4888-8888-888888888888",
  sourceChecksum: `sha256:${"b".repeat(64)}`
} as const;

describe("AI usage lifecycle", () => {
  it("starts an immutable technical record with resource evidence only", async () => {
    const store = new MemoryAiUsageStore();
    const attempt = await startAiUsageAttempt({
      store,
      idGenerator: () => attemptId,
      feature: "chart.interpretationDraft",
      promptId: "chart.interpretationDraft",
      promptVersion: 3,
      provider: "openai",
      ownerSafetyId: `eh_${"a".repeat(61)}`,
      resourceEvidence,
      now: startedAt
    });

    expect(attempt).toMatchObject({
      id: attemptId,
      status: "started",
      feature: "chart.interpretationDraft",
      resourceType: resourceEvidence.resourceType,
      resourceId: resourceEvidence.resourceId,
      sourceChecksum: resourceEvidence.sourceChecksum,
      model: null,
      completedAt: null
    });
    expect(Object.keys(store.startedInputs[0] ?? {})).not.toContain("prompt");
    expect(Object.keys(store.startedInputs[0] ?? {})).not.toContain("chart");
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => attemptId,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        resourceEvidence,
        now: startedAt
      })
    ).resolves.toEqual(attempt);
  });

  it("rejects invalid resource evidence before persistence", async () => {
    const store = new MemoryAiUsageStore();
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => attemptId,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        resourceEvidence: { ...resourceEvidence, sourceChecksum: "not-a-checksum" },
        now: startedAt
      })
    ).rejects.toThrow("AI usage source checksum is invalid");
    expect(store.startedInputs).toHaveLength(0);
  });

  it("replays exact terminal evidence and rejects divergence", async () => {
    const store = new MemoryAiUsageStore([startedAttempt()]);
    const command = {
      store,
      attemptId,
      model: "gpt-5.4-mini",
      finishReason: "completed",
      durationMs: 125,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      now: new Date("2026-08-03T12:00:00.125Z")
    } as const;
    const completed = await completeAiUsageAttempt(command);
    expect(completed).toMatchObject({ status: "succeeded", totalTokens: 15 });
    await expect(completeAiUsageAttempt(command)).resolves.toEqual(completed);
    await expect(
      completeAiUsageAttempt({ ...command, durationMs: 126, now: new Date("2026-08-03T12:00:00.126Z") })
    ).rejects.toThrow("Completed AI usage evidence does not match its command");
    await expect(
      completeAiUsageAttempt({
        ...command,
        attemptId: "22222222-2222-4222-8222-222222222222",
        now: new Date("2026-08-03T12:00:00.125Z")
      })
    ).rejects.toThrow("AI usage attempt is missing or already finalized");
  });

  it("never stores raw provider failures and reconciles stale attempts", async () => {
    const store = new MemoryAiUsageStore([startedAttempt()]);
    const failed = await failAiUsageAttempt({
      store,
      attemptId,
      safeErrorCode: "AI_PROVIDER_TIMEOUT",
      durationMs: 500,
      now: new Date("2026-08-03T12:00:00.500Z")
    });
    expect(failed).toMatchObject({ status: "failed", safeErrorCode: "AI_PROVIDER_TIMEOUT" });
    expect(Object.keys(store.failedInputs[0] ?? {})).not.toContain("message");

    const staleStore = new MemoryAiUsageStore([startedAttempt()]);
    await expect(
      reconcileStaleAiUsageAttempts({
        store: staleStore,
        startedBefore: new Date("2026-08-03T12:04:00.000Z"),
        now: new Date("2026-08-03T12:05:00.000Z"),
        limit: 100
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: attemptId,
        status: "indeterminate",
        safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE",
        durationMs: 300_000
      })
    ]);
  });
});

class MemoryAiUsageStore implements AiUsageStore {
  readonly records = new Map<string, AiUsageAttempt>();
  readonly startedInputs: Parameters<AiUsageStore["startAttempt"]>[0][] = [];
  readonly failedInputs: Parameters<AiUsageStore["failAttempt"]>[0][] = [];

  constructor(records: readonly AiUsageAttempt[] = []) {
    for (const record of records) this.records.set(record.id, record);
  }

  async startAttempt(input: Parameters<AiUsageStore["startAttempt"]>[0]): Promise<AiUsageAttempt> {
    this.startedInputs.push(input);
    const existing = this.records.get(input.id);
    if (existing) return existing;
    const record: AiUsageAttempt = {
      id: input.id,
      status: "started",
      feature: input.feature,
      promptId: input.promptId,
      promptVersion: input.promptVersion,
      provider: input.provider,
      ownerSafetyId: input.ownerSafetyId,
      resourceType: input.resourceEvidence?.resourceType ?? null,
      resourceId: input.resourceEvidence?.resourceId ?? null,
      sourceChecksum: input.resourceEvidence?.sourceChecksum ?? null,
      model: null,
      finishReason: null,
      safeErrorCode: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      durationMs: null,
      startedAt: input.startedAt,
      completedAt: null
    };
    this.records.set(record.id, record);
    return record;
  }

  async completeAttempt(input: Parameters<AiUsageStore["completeAttempt"]>[0]): Promise<AiUsageAttempt | null> {
    const current = this.records.get(input.attemptId);
    if (!current) return null;
    if (current.status !== "started") return current;
    const record = {
      ...current,
      status: "succeeded" as const,
      model: input.model,
      finishReason: input.finishReason,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs,
      completedAt: input.completedAt
    };
    this.records.set(record.id, record);
    return record;
  }

  async failAttempt(input: Parameters<AiUsageStore["failAttempt"]>[0]): Promise<AiUsageAttempt | null> {
    this.failedInputs.push(input);
    const current = this.records.get(input.attemptId);
    if (!current) return null;
    if (current.status !== "started") return current;
    const record = {
      ...current,
      status: "failed" as const,
      safeErrorCode: input.safeErrorCode,
      durationMs: input.durationMs,
      completedAt: input.completedAt
    };
    this.records.set(record.id, record);
    return record;
  }

  async reconcileStaleAttempts(input: Parameters<AiUsageStore["reconcileStaleAttempts"]>[0]) {
    const reconciled: AiUsageAttempt[] = [];
    for (const current of this.records.values()) {
      if (current.status !== "started" || current.startedAt > input.startedBefore) continue;
      const record = {
        ...current,
        status: "indeterminate" as const,
        safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE" as const,
        durationMs: Date.parse(input.reconciledAt) - Date.parse(current.startedAt),
        completedAt: input.reconciledAt
      };
      this.records.set(record.id, record);
      reconciled.push(record);
    }
    return reconciled.slice(0, input.limit);
  }
}

function startedAttempt(): AiUsageAttempt {
  return {
    id: attemptId,
    status: "started",
    feature: "chart.interpretationDraft",
    promptId: "chart.interpretationDraft",
    promptVersion: 3,
    provider: "openai",
    ownerSafetyId: `eh_${"a".repeat(61)}`,
    resourceType: resourceEvidence.resourceType,
    resourceId: resourceEvidence.resourceId,
    sourceChecksum: resourceEvidence.sourceChecksum,
    model: null,
    finishReason: null,
    safeErrorCode: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    durationMs: null,
    startedAt: startedAt.toISOString(),
    completedAt: null
  };
}
