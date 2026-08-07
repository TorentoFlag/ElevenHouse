import {
  reconcileProviderSettlementLedgerBatch,
  type FinancePaymentProvider,
  type ProviderSettlementLedgerBatchResult,
  type ReconciliationStore
} from "@elevenhouse/domain";
import type { ArcPaySettlementLedgerClient } from "../arc-pay/arc-pay-settlement-ledger-client";

export type SettlementLedgerReconciliationTickResult = ProviderSettlementLedgerBatchResult & {
  readonly pages: number;
};

export type SettlementLedgerReconciliationProcessor = {
  readonly tick: () => Promise<SettlementLedgerReconciliationTickResult>;
};

export function createSettlementLedgerReconciliationProcessor(input: {
  readonly client: ArcPaySettlementLedgerClient;
  readonly store: ReconciliationStore;
  readonly provider: FinancePaymentProvider;
  readonly lookbackMs: number;
  readonly pageLimit: number;
  readonly currency?: "RUB";
  readonly now?: () => Date;
}): SettlementLedgerReconciliationProcessor {
  return {
    async tick() {
      const checkedAt = (input.now ?? (() => new Date()))();
      const to = checkedAt.toISOString();
      const from = new Date(checkedAt.getTime() - input.lookbackMs).toISOString();
      const result = {
        pages: 0,
        processed: 0,
        matched: 0,
        exceptions: 0,
        skipped: 0,
        replayed: 0
      };
      let cursor: string | undefined;
      do {
        const page = await input.client.listSettlementLedger({
          from,
          to,
          limit: input.pageLimit,
          ...(cursor ? { cursor } : {}),
          ...(input.currency ? { currency: input.currency } : {})
        });
        result.pages += 1;
        const batchResult = await reconcileProviderSettlementLedgerBatch({
          store: input.store,
          provider: input.provider,
          entries: page.entries,
          checkedAt
        });
        result.processed += batchResult.processed;
        result.matched += batchResult.matched;
        result.exceptions += batchResult.exceptions;
        result.skipped += batchResult.skipped;
        result.replayed += batchResult.replayed;
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return result;
    }
  };
}

export function startSettlementLedgerReconciliationInterval(input: {
  readonly processor: SettlementLedgerReconciliationProcessor;
  readonly intervalMs: number;
  readonly onError: (error: unknown) => void;
  readonly onResult?: (result: SettlementLedgerReconciliationTickResult) => void;
}): () => void {
  if (input.intervalMs <= 0) return () => undefined;

  const run = async () => {
    try {
      const result = await input.processor.tick();
      input.onResult?.(result);
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => {
    void run();
  }, input.intervalMs);
  timer.unref();

  void run();
  return () => clearInterval(timer);
}
