import type { ArcPaySettlementBalanceClient } from "../arc-pay/arc-pay-settlement-balance-client";

export type SettlementBalanceObservationProcessor = Readonly<{
  tick(): Promise<SettlementBalanceObservation>;
}>;

export type SettlementBalanceObservation = Readonly<{
  observedAt: string;
  balances: Awaited<ReturnType<ArcPaySettlementBalanceClient["readSettlementBalance"]>>["balances"];
  rawDigest: `sha256:${string}`;
  rawByteLength: number;
}>;

/**
 * Reads ArcPay's current merchant position for operations logs. It deliberately
 * makes no journal, wallet, or reconciliation mutation: that requires the
 * separate immutable settlement-page ingestion path.
 */
export function createSettlementBalanceObservationProcessor(input: Readonly<{
  client: ArcPaySettlementBalanceClient;
  now?: () => Date;
}>): SettlementBalanceObservationProcessor {
  return Object.freeze({
    async tick() {
      const response = await input.client.readSettlementBalance();
      return Object.freeze({
        observedAt: (input.now ?? (() => new Date()))().toISOString(),
        balances: response.balances,
        rawDigest: response.rawDigest,
        rawByteLength: response.rawByteLength
      });
    }
  });
}

export function startSettlementBalanceObservationInterval(input: Readonly<{
  processor: SettlementBalanceObservationProcessor;
  intervalMs: number;
  onResult?(result: SettlementBalanceObservation): void;
  onError(error: unknown): void;
}>): () => void {
  if (input.intervalMs <= 0) return () => undefined;
  const run = async () => {
    try {
      input.onResult?.(await input.processor.tick());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
