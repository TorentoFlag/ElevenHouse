import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AI_USAGE_RECORDER } from "./ai.tokens";
import type { AiUsageRecorderPort } from "./ai-usage-recorder";

const RECONCILIATION_INTERVAL_MS = 60_000;
const MINIMUM_STALE_AGE_MS = 300_000;
const RECONCILIATION_BATCH_LIMIT = 100;

type AiRuntimeConfig = { readonly timeoutMs: number };

@Injectable()
export class AiUsageReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiUsageReconciliationService.name);
  private timer: NodeJS.Timeout | undefined;
  private activeRun: Promise<number> | undefined;

  constructor(
    @Inject(AI_USAGE_RECORDER)
    private readonly recorder: Pick<AiUsageRecorderPort, "reconcileStale">,
    private readonly configService: ConfigService
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runOnce(new Date()).catch(() => undefined);
    }, RECONCILIATION_INTERVAL_MS);
    this.timer.unref();
    void this.runOnce(new Date()).catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  runOnce(now: Date): Promise<number> {
    if (this.activeRun) return this.activeRun;
    const run = this.reconcile(now);
    this.activeRun = run;
    void run.finally(() => {
      if (this.activeRun === run) this.activeRun = undefined;
    }).catch(() => undefined);
    return run;
  }

  private async reconcile(now: Date): Promise<number> {
    const config = this.configService.getOrThrow<AiRuntimeConfig>("astrologerApi.ai");
    const staleAgeMs = Math.max(MINIMUM_STALE_AGE_MS, config.timeoutMs * 2);
    try {
      const records = await this.recorder.reconcileStale({
        startedBefore: new Date(now.getTime() - staleAgeMs),
        reconciledAt: now,
        limit: RECONCILIATION_BATCH_LIMIT
      });
      if (records.length > 0) {
        const oldestStartedAtMs = Math.min(
          ...records.map(({ startedAt }) => Date.parse(startedAt))
        );
        this.logger.log("AI usage stale reconciliation completed", {
          eventCode: "ai_usage_stale_reconciled",
          reconciledCount: records.length,
          oldestAgeMs: Math.max(0, now.getTime() - oldestStartedAtMs),
          backlogPossible: records.length === RECONCILIATION_BATCH_LIMIT
        });
      }
      return records.length;
    } catch (error) {
      this.logger.error("AI usage stale reconciliation failed", {
        eventCode: "ai_usage_reconciliation_failed"
      });
      throw error;
    }
  }
}
