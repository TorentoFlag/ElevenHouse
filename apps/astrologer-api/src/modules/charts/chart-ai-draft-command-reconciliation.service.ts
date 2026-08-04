import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit
} from "@nestjs/common";
import { chartAiDraftCommandTtlMs, type ChartAiDraftCommandStore } from "@elevenhouse/domain";
import { CHART_AI_DRAFT_COMMAND_STORE } from "./charts.tokens";

const RECONCILIATION_INTERVAL_MS = 60_000;
const RECONCILIATION_BATCH_LIMIT = 100;

/**
 * Clears only durably-expired provider commands.  A claimed command becomes an
 * observable unknown outcome instead of replaying billable provider work.
 */
@Injectable()
export class ChartAiDraftCommandReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChartAiDraftCommandReconciliationService.name);
  private timer: NodeJS.Timeout | undefined;
  private activeRun: Promise<number> | undefined;

  constructor(
    @Inject(CHART_AI_DRAFT_COMMAND_STORE)
    private readonly commandStore: Pick<ChartAiDraftCommandStore, "reconcileExpiredProcessing">
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => undefined);
    }, RECONCILIATION_INTERVAL_MS);
    this.timer.unref();
    void this.runOnce().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  runOnce(): Promise<number> {
    if (this.activeRun) return this.activeRun;
    const run = this.reconcile();
    this.activeRun = run;
    void run
      .finally(() => {
        if (this.activeRun === run) this.activeRun = undefined;
      })
      .catch(() => undefined);
    return run;
  }

  private async reconcile(): Promise<number> {
    try {
      const reconciledCount = await this.commandStore.reconcileExpiredProcessing({
        retentionMs: chartAiDraftCommandTtlMs,
        limit: RECONCILIATION_BATCH_LIMIT
      });
      if (reconciledCount > 0) {
        this.logger.warn("Chart AI draft reconciliation completed", {
          eventCode: "chart_ai_draft_reconciliation_backlog",
          reconciledCount,
          backlogPossible: reconciledCount === RECONCILIATION_BATCH_LIMIT
        });
      }
      return reconciledCount;
    } catch (error) {
      this.logger.error("Chart AI draft reconciliation failed", {
        eventCode: "chart_ai_draft_reconciliation_failed"
      });
      throw error;
    }
  }
}
