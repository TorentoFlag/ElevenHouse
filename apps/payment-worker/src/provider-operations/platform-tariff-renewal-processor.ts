import type { PlatformTariffRenewalInvoiceIssuer } from "@elevenhouse/domain";

export type PlatformTariffRenewalProcessor = Readonly<{
  tick(): Promise<Readonly<{ issued: number; skipped: number }>>;
}>;

/** Creates no provider request itself; durable outbox processing performs the later MIT charge. */
export function createPlatformTariffRenewalProcessor(input: Readonly<{
  issuer: PlatformTariffRenewalInvoiceIssuer;
  batchSize: number;
  now?: () => Date;
}>): PlatformTariffRenewalProcessor {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 500) {
    throw new Error("Platform tariff renewal batch size is invalid");
  }
  return Object.freeze({
    tick: () => input.issuer.issueDueRenewalInvoices({
      now: (input.now ?? (() => new Date()))().toISOString(),
      limit: input.batchSize
    })
  });
}

export function startPlatformTariffRenewalInterval(input: Readonly<{
  processor: PlatformTariffRenewalProcessor;
  intervalMs: number;
  onError(error: unknown): void;
  onResult?(result: Readonly<{ issued: number; skipped: number }>): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Platform tariff renewal interval is invalid");
  }
  const run = async () => {
    try { input.onResult?.(await input.processor.tick()); }
    catch (error) { input.onError(error); }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
