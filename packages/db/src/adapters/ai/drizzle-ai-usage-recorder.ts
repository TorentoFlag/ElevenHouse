import {
  completeAiUsageAttempt,
  failAiUsageAttempt,
  reconcileStaleAiUsageAttempts,
  startAiUsageAttempt,
  type AiUsageAttempt,
  type AiUsageResourceEvidence,
  type AiUsageSafeErrorCode,
  type AiUsageStore
} from "@elevenhouse/domain";

type AiUsageTokenEvidence = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
};

export type DrizzleAiUsageRecorder = {
  /** Persisted before the provider can incur cost. */
  readonly start: (record: {
    readonly attemptId: string;
    readonly feature: string;
    readonly promptId: string;
    readonly promptVersion: number;
    readonly provider: "openai";
    readonly ownerSafetyId: string;
    readonly resourceEvidence: AiUsageResourceEvidence | null;
    readonly startedAt: Date;
  }) => Promise<string>;
  /** Awaited before successful provider output can leave the runtime. */
  readonly complete: (record: {
    readonly attemptId: string;
    readonly model: string;
    readonly finishReason: string;
    readonly durationMs: number;
    readonly usage?: AiUsageTokenEvidence;
    readonly completedAt: Date;
  }) => Promise<void>;
  /** Contains only a bounded error code and is awaited before propagating failure. */
  readonly fail: (record: {
    readonly attemptId: string;
    readonly safeErrorCode: AiUsageSafeErrorCode;
    readonly durationMs: number;
    readonly completedAt: Date;
  }) => Promise<void>;
  /** Claims old started attempts whose provider outcome can no longer be proven. */
  readonly reconcileStale: (record: {
    readonly startedBefore: Date;
    readonly reconciledAt: Date;
    readonly limit: number;
  }) => Promise<readonly AiUsageAttempt[]>;
};

export function createDrizzleAiUsageRecorder(store: AiUsageStore): DrizzleAiUsageRecorder {
  return {
    start: async (record) => {
      const attempt = await startAiUsageAttempt({
        store,
        idGenerator: () => record.attemptId,
        feature: record.feature,
        promptId: record.promptId,
        promptVersion: record.promptVersion,
        provider: record.provider,
        ownerSafetyId: record.ownerSafetyId,
        resourceEvidence: record.resourceEvidence,
        now: record.startedAt
      });
      return attempt.id;
    },
    complete: async (record) => {
      await completeAiUsageAttempt({
        store,
        attemptId: record.attemptId,
        model: record.model,
        finishReason: record.finishReason,
        durationMs: record.durationMs,
        ...(record.usage ? { usage: record.usage } : {}),
        now: record.completedAt
      });
    },
    fail: async (record) => {
      await failAiUsageAttempt({
        store,
        attemptId: record.attemptId,
        safeErrorCode: record.safeErrorCode,
        durationMs: record.durationMs,
        now: record.completedAt
      });
    },
    reconcileStale: (record) =>
      reconcileStaleAiUsageAttempts({
        store,
        startedBefore: record.startedBefore,
        now: record.reconciledAt,
        limit: record.limit
      })
  };
}
