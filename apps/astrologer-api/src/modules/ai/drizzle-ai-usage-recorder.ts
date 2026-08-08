import { Inject, Injectable } from "@nestjs/common";
import { createDrizzleAiUsageRecorder } from "@elevenhouse/db";
import type { AiUsageStore } from "@elevenhouse/domain";
import { AI_USAGE_STORE } from "./ai.tokens";
import type {
  AiUsageCompletionRecord,
  AiUsageFailureRecord,
  AiUsageRecorderPort,
  AiUsageStartRecord
} from "./ai-usage-recorder";

@Injectable()
export class DrizzleAiUsageRecorder implements AiUsageRecorderPort {
  private readonly recorder: ReturnType<typeof createDrizzleAiUsageRecorder>;

  constructor(@Inject(AI_USAGE_STORE) store: AiUsageStore) {
    this.recorder = createDrizzleAiUsageRecorder(store);
  }

  async start(record: AiUsageStartRecord): Promise<string> {
    return this.recorder.start(record);
  }

  async complete(record: AiUsageCompletionRecord): Promise<void> {
    await this.recorder.complete(record);
  }

  async fail(record: AiUsageFailureRecord): Promise<void> {
    await this.recorder.fail(record);
  }

  async reconcileStale(record: {
    readonly startedBefore: Date;
    readonly reconciledAt: Date;
    readonly limit: number;
  }) {
    return this.recorder.reconcileStale(record);
  }
}
