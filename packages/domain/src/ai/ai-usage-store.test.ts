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
const consentId = "22222222-2222-4222-8222-222222222222";
const clientUserId = "33333333-3333-4333-8333-333333333333";
const astrologerUserId = "44444444-4444-4444-8444-444444444444";
const startedAt = new Date("2026-08-03T12:00:00.000Z");

describe("AI usage lifecycle", () => {
  it("starts an attempt with only safe metadata and unique consent evidence", async () => {
    const store = new MemoryAiUsageStore();

    const attempt = await startAiUsageAttempt({
      store,
      idGenerator: () => attemptId,
      feature: "chart.interpretationDraft",
      promptId: "chart.interpretationDraft",
      promptVersion: 3,
      provider: "openai",
      ownerSafetyId: `eh_${"a".repeat(61)}`,
      consentAuthorizations: [
        { consentRecordId: consentId, clientUserId, astrologerUserId },
        { consentRecordId: consentId, clientUserId, astrologerUserId }
      ],
      processingAuthorityVersion: "openai-processing-authority.v1",
      resourceEvidence: {
        resourceType: "chart_calculation",
        resourceId: "88888888-8888-4888-8888-888888888888",
        sourceChecksum: `sha256:${"b".repeat(64)}`
      },
      now: startedAt
    });

    expect(attempt).toMatchObject({
      id: attemptId,
      status: "started",
      feature: "chart.interpretationDraft",
      model: null,
      safeErrorCode: null,
      completedAt: null,
      consentRecordIds: [consentId]
    });
    expect(attempt).toMatchObject({
      processingAuthorityVersion: "openai-processing-authority.v1",
      resourceType: "chart_calculation",
      resourceId: "88888888-8888-4888-8888-888888888888",
      sourceChecksum: `sha256:${"b".repeat(64)}`
    });
    expect(Object.keys(store.startedInputs[0] ?? {})).not.toContain("prompt");
    expect(Object.keys(store.startedInputs[0] ?? {})).not.toContain("chart");
    expect(store.startedInputs[0]?.consentAuthorizations).toEqual([
      { consentRecordId: consentId, clientUserId, astrologerUserId }
    ]);

    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => attemptId,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        consentAuthorizations: [
          { consentRecordId: consentId, clientUserId, astrologerUserId }
        ],
        processingAuthorityVersion: "openai-processing-authority.v1",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: "88888888-8888-4888-8888-888888888888",
          sourceChecksum: `sha256:${"b".repeat(64)}`
        },
        now: startedAt
      })
    ).resolves.toEqual(attempt);
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => attemptId,
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        consentAuthorizations: [],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: startedAt
      })
    ).rejects.toThrow("Started AI usage evidence does not match its command");
  });

  it("replays the exact successful terminal evidence and rejects divergent evidence", async () => {
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

    expect(completed).toMatchObject({
      status: "succeeded",
      model: "gpt-5.4-mini",
      finishReason: "completed",
      durationMs: 125,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      safeErrorCode: null
    });
    await expect(completeAiUsageAttempt(command)).resolves.toEqual(completed);
    await expect(
      completeAiUsageAttempt({
        ...command,
        durationMs: 130,
        now: new Date("2026-08-03T12:00:00.130Z")
      })
    ).rejects.toThrow("Completed AI usage evidence does not match its command");
  });

  it("rejects completion evidence that predates the durable start", async () => {
    const store = new MemoryAiUsageStore([startedAttempt()]);

    await expect(
      completeAiUsageAttempt({
        store,
        attemptId,
        model: "gpt-5.4-mini",
        finishReason: "completed",
        durationMs: 1,
        now: new Date("2026-08-03T11:59:59.999Z")
      })
    ).rejects.toThrow("Completed AI usage evidence does not match its command");
  });

  it("replays exact failed terminal evidence and never stores a raw error", async () => {
    const store = new MemoryAiUsageStore([startedAttempt()]);
    const command = {
      store,
      attemptId,
      safeErrorCode: "AI_PROVIDER_TIMEOUT",
      durationMs: 500,
      now: new Date("2026-08-03T12:00:00.500Z")
    } as const;

    const failed = await failAiUsageAttempt(command);

    expect(failed).toMatchObject({
      status: "failed",
      safeErrorCode: "AI_PROVIDER_TIMEOUT",
      durationMs: 500,
      model: null,
      finishReason: null
    });
    await expect(failAiUsageAttempt(command)).resolves.toEqual(failed);
    await expect(
      failAiUsageAttempt({ ...command, safeErrorCode: "AI_PROVIDER_SERVER_ERROR" })
    ).rejects.toThrow("Failed AI usage evidence does not match its command");
    expect(Object.keys(store.failedInputs[0] ?? {})).not.toContain("error");
    expect(Object.keys(store.failedInputs[0] ?? {})).not.toContain("message");
  });

  it("rejects unsafe or internally inconsistent lifecycle inputs before persistence", async () => {
    const store = new MemoryAiUsageStore();

    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => attemptId,
        feature: " ",
        promptId: "prompt",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        consentAuthorizations: [],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: startedAt
      })
    ).rejects.toThrow("AI usage feature is required");
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => attemptId,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        consentAuthorizations: [{ consentRecordId: consentId, clientUserId, astrologerUserId }],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: startedAt
      })
    ).rejects.toThrow("Consent-bound AI usage requires processing authority and resource evidence");
    await expect(
      completeAiUsageAttempt({
        store,
        attemptId,
        model: "gpt-5.4-mini",
        finishReason: "completed",
        durationMs: 1,
        usage: { promptTokens: 2, completionTokens: 3, totalTokens: 99 },
        now: startedAt
      })
    ).rejects.toThrow("AI usage total tokens must equal prompt and completion tokens");
    expect(store.startedInputs).toHaveLength(0);
    expect(store.completedInputs).toHaveLength(0);
  });

  it("rejects a started record that already contains outcome evidence", async () => {
    await expect(
      startAiUsageAttempt({
        store: {
          startAttempt: async (input) => ({
            ...startedAttempt(),
            id: input.id,
            feature: input.feature,
            promptId: input.promptId,
            promptVersion: input.promptVersion,
            provider: input.provider,
            ownerSafetyId: input.ownerSafetyId,
            consentRecordIds: [],
            processingAuthorityVersion: null,
            resourceType: null,
            resourceId: null,
            sourceChecksum: null,
            startedAt: input.startedAt,
            model: "gpt-5.4-mini"
          })
        },
        idGenerator: () => attemptId,
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId: `eh_${"a".repeat(61)}`,
        consentAuthorizations: [],
        processingAuthorityVersion: null,
        resourceEvidence: null,
        now: startedAt
      })
    ).rejects.toThrow("Started AI usage evidence does not match its command");
  });

  it("rejects cross-owner or ambiguous consent authorization tuples before persistence", async () => {
    const store = new MemoryAiUsageStore();
    const base = {
      store,
      idGenerator: () => attemptId,
      feature: "chart.interpretationDraft",
      promptId: "chart.interpretationDraft",
      promptVersion: 3,
      provider: "openai",
      ownerSafetyId: `eh_${"a".repeat(61)}`,
      processingAuthorityVersion: "openai-processing-authority.v1",
      resourceEvidence: {
        resourceType: "chart_calculation",
        resourceId: "88888888-8888-4888-8888-888888888888",
        sourceChecksum: `sha256:${"b".repeat(64)}`
      },
      now: startedAt
    };

    await expect(
      startAiUsageAttempt({
        ...base,
        consentAuthorizations: [
          { consentRecordId: consentId, clientUserId, astrologerUserId },
          {
            consentRecordId: "55555555-5555-4555-8555-555555555555",
            clientUserId: "66666666-6666-4666-8666-666666666666",
            astrologerUserId: "77777777-7777-4777-8777-777777777777"
          }
        ]
      })
    ).rejects.toThrow("must belong to one astrologer");
    await expect(
      startAiUsageAttempt({
        ...base,
        consentAuthorizations: [
          { consentRecordId: consentId, clientUserId, astrologerUserId },
          {
            consentRecordId: "55555555-5555-4555-8555-555555555555",
            clientUserId,
            astrologerUserId
          }
        ]
      })
    ).rejects.toThrow("repeat a client with different evidence");
    expect(store.startedInputs).toHaveLength(0);
  });

  it("terminalizes stale started attempts as outcome-indeterminate without inventing provider evidence", async () => {
    const store = new MemoryAiUsageStore([startedAttempt()]);

    const reconciled = await reconcileStaleAiUsageAttempts({
      store,
      startedBefore: new Date("2026-08-03T12:04:00.000Z"),
      now: new Date("2026-08-03T12:05:00.000Z"),
      limit: 100
    });

    expect(reconciled).toEqual([
      expect.objectContaining({
        id: attemptId,
        status: "indeterminate",
        safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE",
        model: null,
        finishReason: null,
        durationMs: 300_000,
        completedAt: "2026-08-03T12:05:00.000Z"
      })
    ]);
    await expect(
      reconcileStaleAiUsageAttempts({
        store,
        startedBefore: new Date("2026-08-03T12:06:00.000Z"),
        now: new Date("2026-08-03T12:05:00.000Z"),
        limit: 100
      })
    ).rejects.toThrow("AI usage stale cutoff must not follow reconciliation time");
  });
});

class MemoryAiUsageStore implements AiUsageStore {
  readonly records = new Map<string, AiUsageAttempt>();
  readonly startedInputs: Parameters<AiUsageStore["startAttempt"]>[0][] = [];
  readonly completedInputs: Parameters<AiUsageStore["completeAttempt"]>[0][] = [];
  readonly failedInputs: Parameters<AiUsageStore["failAttempt"]>[0][] = [];
  readonly reconciledInputs: Parameters<AiUsageStore["reconcileStaleAttempts"]>[0][] = [];

  constructor(records: readonly AiUsageAttempt[] = []) {
    for (const record of records) this.records.set(record.id, record);
  }

  async startAttempt(input: Parameters<AiUsageStore["startAttempt"]>[0]) {
    this.startedInputs.push(input);
    const existing = this.records.get(input.id);
    if (existing) return existing;
    const record: AiUsageAttempt = {
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
    this.records.set(record.id, record);
    return record;
  }

  async completeAttempt(input: Parameters<AiUsageStore["completeAttempt"]>[0]) {
    this.completedInputs.push(input);
    const current = this.records.get(input.attemptId);
    if (!current) return null;
    if (current.status !== "started") return current;
    const record: AiUsageAttempt = {
      ...current,
      status: "succeeded",
      model: input.model,
      finishReason: input.finishReason,
      safeErrorCode: null,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs,
      completedAt: input.completedAt
    };
    this.records.set(record.id, record);
    return record;
  }

  async failAttempt(input: Parameters<AiUsageStore["failAttempt"]>[0]) {
    this.failedInputs.push(input);
    const current = this.records.get(input.attemptId);
    if (!current) return null;
    if (current.status !== "started") return current;
    const record: AiUsageAttempt = {
      ...current,
      status: "failed",
      model: null,
      finishReason: null,
      safeErrorCode: input.safeErrorCode,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      durationMs: input.durationMs,
      completedAt: input.completedAt
    };
    this.records.set(record.id, record);
    return record;
  }

  async reconcileStaleAttempts(
    input: Parameters<AiUsageStore["reconcileStaleAttempts"]>[0]
  ): Promise<readonly AiUsageAttempt[]> {
    this.reconciledInputs.push(input);
    const reconciled: AiUsageAttempt[] = [];
    for (const current of [...this.records.values()]
      .filter(
        (record) =>
          record.status === "started" && record.startedAt <= input.startedBefore
      )
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .slice(0, input.limit)) {
      const durationMs = Date.parse(input.reconciledAt) - Date.parse(current.startedAt);
      const record: AiUsageAttempt = {
        ...current,
        status: "indeterminate",
        safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE",
        durationMs,
        completedAt: input.reconciledAt
      };
      this.records.set(record.id, record);
      reconciled.push(record);
    }
    return reconciled;
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
    consentRecordIds: [consentId],
    processingAuthorityVersion: "openai-processing-authority.v1",
    resourceType: "chart_calculation",
    resourceId: "88888888-8888-4888-8888-888888888888",
    sourceChecksum: `sha256:${"b".repeat(64)}`,
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
