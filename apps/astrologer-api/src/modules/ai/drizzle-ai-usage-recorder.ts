import { Inject, Injectable } from "@nestjs/common";
import {
  completeAiUsageAttempt,
  failAiUsageAttempt,
  reconcileStaleAiUsageAttempts,
  startAiUsageAttempt,
  type AiUsageStore
} from "@elevenhouse/domain";
import { AI_USAGE_STORE } from "./ai.tokens";
import type {
  AiUsageCompletionRecord,
  AiUsageFailureRecord,
  AiUsageRecorderPort,
  AiUsageStartRecord
} from "./ai-usage-recorder";

@Injectable()
export class DrizzleAiUsageRecorder implements AiUsageRecorderPort {
  constructor(@Inject(AI_USAGE_STORE) private readonly store: AiUsageStore) {}

  async start(record: AiUsageStartRecord): Promise<string> {
    const attempt = await startAiUsageAttempt({
      store: this.store,
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
  }

  async complete(record: AiUsageCompletionRecord): Promise<void> {
    await completeAiUsageAttempt({
      store: this.store,
      attemptId: record.attemptId,
      model: record.model,
      finishReason: record.finishReason,
      durationMs: record.durationMs,
      ...(record.usage ? { usage: record.usage } : {}),
      now: record.completedAt
    });
  }

  async fail(record: AiUsageFailureRecord): Promise<void> {
    await failAiUsageAttempt({
      store: this.store,
      attemptId: record.attemptId,
      safeErrorCode: record.safeErrorCode,
      durationMs: record.durationMs,
      now: record.completedAt
    });
  }

  async reconcileStale(record: {
    readonly startedBefore: Date;
    readonly reconciledAt: Date;
    readonly limit: number;
  }) {
    return reconcileStaleAiUsageAttempts({
      store: this.store,
      startedBefore: record.startedBefore,
      now: record.reconciledAt,
      limit: record.limit
    });
  }
}
