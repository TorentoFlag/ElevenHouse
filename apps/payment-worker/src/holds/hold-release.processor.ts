import {
  releaseDueCapturedSaleHolds,
  type HoldReleaseStore,
  type ReleaseDueCapturedSaleHoldsResult
} from "@elevenhouse/domain";

export type HoldReleaseProcessor = {
  readonly tick: () => Promise<ReleaseDueCapturedSaleHoldsResult>;
};

export function createHoldReleaseProcessor(input: {
  readonly store: HoldReleaseStore;
  readonly now?: () => Date;
  readonly limit: number;
  readonly commandTtlMs: number;
}): HoldReleaseProcessor {
  return {
    tick: () =>
      releaseDueCapturedSaleHolds({
        store: input.store,
        now: (input.now ?? (() => new Date()))(),
        limit: input.limit,
        commandTtlMs: input.commandTtlMs
      })
  };
}

export function startHoldReleaseInterval(input: {
  readonly processor: HoldReleaseProcessor;
  readonly intervalMs: number;
  readonly onError: (error: unknown) => void;
  readonly onResult?: (result: ReleaseDueCapturedSaleHoldsResult) => void;
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
