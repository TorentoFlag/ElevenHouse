import type {
  OnlineWalletHoldReleaseUnitOfWork,
  ReleaseDueOnlineWalletHoldsResult
} from "@elevenhouse/domain/finance-core";

export type OnlineWalletHoldReleaseProcessor = Readonly<{
  tick(): Promise<ReleaseDueOnlineWalletHoldsResult>;
}>;

/**
 * The worker owns scheduling only. Candidate selection, booking-completion evidence and
 * optimistic wallet mutation all remain in the v2 transactional unit of work.
 */
export function createOnlineWalletHoldReleaseProcessor(input: {
  readonly releases: OnlineWalletHoldReleaseUnitOfWork;
  readonly now?: () => Date;
  readonly limit: number;
}): OnlineWalletHoldReleaseProcessor {
  return Object.freeze({
    tick: () =>
      input.releases.releaseDueOnlineWalletHolds({
        now: (input.now ?? (() => new Date()))().toISOString(),
        limit: input.limit
      })
  });
}

export function startOnlineWalletHoldReleaseInterval(input: {
  readonly processor: OnlineWalletHoldReleaseProcessor;
  readonly intervalMs: number;
  readonly onError: (error: unknown) => void;
  readonly onResult?: (result: ReleaseDueOnlineWalletHoldsResult) => void;
}): () => void {
  if (input.intervalMs <= 0) return () => undefined;

  let inFlight = false;
  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await input.processor.tick();
      input.onResult?.(result);
    } catch (error) {
      input.onError(error);
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
