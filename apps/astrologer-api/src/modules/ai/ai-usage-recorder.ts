import type { AiGenerationResult } from "@elevenhouse/ai";
import type {
  AiUsageAttempt,
  AiUsageResourceEvidence,
  AiUsageSafeErrorCode
} from "@elevenhouse/domain";

export type AiUsageStartRecord = {
  readonly attemptId: string;
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly provider: "openai";
  readonly ownerSafetyId: string;
  readonly resourceEvidence: AiUsageResourceEvidence | null;
  readonly startedAt: Date;
};

export type AiUsageCompletionRecord = {
  readonly attemptId: string;
  readonly model: string;
  readonly finishReason: string;
  readonly durationMs: number;
  readonly usage?: AiGenerationResult<unknown>["usage"];
  readonly completedAt: Date;
};

export type AiUsageFailureRecord = {
  readonly attemptId: string;
  readonly safeErrorCode: AiUsageSafeErrorCode;
  readonly durationMs: number;
  readonly completedAt: Date;
};

export type AiUsageRecorderPort = {
  /** Persisted before the provider can incur cost. */
  readonly start: (record: AiUsageStartRecord) => Promise<string>;
  /** Awaited before successful provider output can leave the service. */
  readonly complete: (record: AiUsageCompletionRecord) => Promise<void>;
  /** Contains only a bounded error code and is awaited before propagating failure. */
  readonly fail: (record: AiUsageFailureRecord) => Promise<void>;
  /** Claims old started attempts whose external provider outcome can no longer be proven. */
  readonly reconcileStale: (record: {
    readonly startedBefore: Date;
    readonly reconciledAt: Date;
    readonly limit: number;
  }) => Promise<readonly AiUsageAttempt[]>;
};
