import type { AiGenerationResult } from "@elevenhouse/ai";

export type AiUsageRecord = {
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly ownerUserId: string;
  readonly provider: string;
  readonly model: string;
  readonly finishReason: string;
  readonly durationMs: number;
  readonly usage?: AiGenerationResult<unknown>["usage"];
};

export type AiUsageRecorderPort = {
  readonly record: (record: AiUsageRecord) => void;
};

export class NoopAiUsageRecorder implements AiUsageRecorderPort {
  record(): void {
    return undefined;
  }
}
