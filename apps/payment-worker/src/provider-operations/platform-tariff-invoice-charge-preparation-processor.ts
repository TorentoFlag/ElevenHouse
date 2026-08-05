import type { OutboxRelayStore } from "@elevenhouse/db/outbox";

import {
  relayPlatformTariffInvoiceChargePreparations,
  type PlatformTariffInvoiceChargePreparer,
  type PlatformTariffInvoiceChargePreparationRelayResult
} from "./platform-tariff-invoice-charge-preparation-relay";

export type PlatformTariffInvoiceChargePreparationProcessor = Readonly<{
  tick(): Promise<PlatformTariffInvoiceChargePreparationRelayResult>;
}>;

export function createPlatformTariffInvoiceChargePreparationProcessor(input: Readonly<{
  store: OutboxRelayStore;
  preparer: PlatformTariffInvoiceChargePreparer;
  batchSize: number;
  publishingLockTimeoutMs: number;
  now?: () => Date;
}>): PlatformTariffInvoiceChargePreparationProcessor {
  return Object.freeze({
    tick: () => relayPlatformTariffInvoiceChargePreparations({
      store: input.store,
      preparer: input.preparer,
      now: (input.now ?? (() => new Date()))(),
      batchSize: input.batchSize,
      publishingLockTimeoutMs: input.publishingLockTimeoutMs
    })
  });
}

export function startPlatformTariffInvoiceChargePreparationInterval(input: Readonly<{
  processor: PlatformTariffInvoiceChargePreparationProcessor;
  intervalMs: number;
  onError(error: unknown): void;
  onResult?(result: PlatformTariffInvoiceChargePreparationRelayResult): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Platform tariff invoice charge preparation interval is invalid");
  }
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
