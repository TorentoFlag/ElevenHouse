import type { PlatformTariffInvoiceChargeTerminalReconciliationReaderPort } from "@elevenhouse/domain/finance-core";

import type { PlatformTariffInvoiceChargeTerminalReconciler } from "./platform-tariff-invoice-charge-terminal-reconciler";

export type PlatformTariffInvoiceChargeTerminalReconciliationTickResult = Readonly<{
  scanned: number;
  awaitingProviderTerminal: number;
  requiresCustomerAction: number;
  captured: number;
  declined: number;
  failed: number;
  requiresReversalReconciliation: number;
}>;

export type PlatformTariffInvoiceChargeTerminalReconciliationProcessor = Readonly<{
  tick(): Promise<PlatformTariffInvoiceChargeTerminalReconciliationTickResult>;
}>;

/** Canonical reconciliation never re-dispatches a saved-card charge. */
export function createPlatformTariffInvoiceChargeTerminalReconciliationProcessor(input: Readonly<{
  reader: PlatformTariffInvoiceChargeTerminalReconciliationReaderPort;
  reconciler: PlatformTariffInvoiceChargeTerminalReconciler;
  batchSize: number;
}>): PlatformTariffInvoiceChargeTerminalReconciliationProcessor {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error("Platform tariff invoice canonical reconciliation batch size is invalid");
  }
  return Object.freeze({
    async tick() {
      const candidates = await input.reader.listAwaitingCanonicalOutcome({ limit: input.batchSize });
      const result = {
        scanned: candidates.length,
        awaitingProviderTerminal: 0,
        requiresCustomerAction: 0,
        captured: 0,
        declined: 0,
        failed: 0,
        requiresReversalReconciliation: 0
      };
      for (const candidate of candidates) {
        const outcome = await input.reconciler.reconcile(candidate);
        if (outcome.kind === "awaiting_provider_terminal") result.awaitingProviderTerminal += 1;
        else if (outcome.kind === "requires_customer_action") result.requiresCustomerAction += 1;
        else if (outcome.kind === "captured") result.captured += 1;
        else if (outcome.kind === "declined") result.declined += 1;
        else if (outcome.kind === "failed") result.failed += 1;
        else result.requiresReversalReconciliation += 1;
      }
      return Object.freeze(result);
    }
  });
}

export function startPlatformTariffInvoiceChargeTerminalReconciliationInterval(input: Readonly<{
  processor: PlatformTariffInvoiceChargeTerminalReconciliationProcessor;
  intervalMs: number;
  onError(error: unknown): void;
  onResult?(result: PlatformTariffInvoiceChargeTerminalReconciliationTickResult): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Platform tariff invoice canonical reconciliation interval is invalid");
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
