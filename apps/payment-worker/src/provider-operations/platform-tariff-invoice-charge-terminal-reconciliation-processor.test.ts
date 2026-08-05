import { describe, expect, it, vi } from "vitest";

import { createPlatformTariffInvoiceChargeTerminalReconciliationProcessor } from "./platform-tariff-invoice-charge-terminal-reconciliation-processor";

describe("platform tariff invoice terminal reconciliation processor", () => {
  it("accounts for canonical outcomes without redispatching a charge", async () => {
    const reader = { listAwaitingCanonicalOutcome: vi.fn(async () => [{ invoiceId: "one" }, { invoiceId: "two" }, { invoiceId: "three" }]) };
    const reconciler = { reconcile: vi.fn()
      .mockResolvedValueOnce({ kind: "captured", invoiceId: "one" })
      .mockResolvedValueOnce({ kind: "declined", invoiceId: "two" })
      .mockResolvedValueOnce({ kind: "awaiting_provider_terminal", invoiceId: "three" }) };
    const processor = createPlatformTariffInvoiceChargeTerminalReconciliationProcessor({ reader: reader as never, reconciler: reconciler as never, batchSize: 3 });

    await expect(processor.tick()).resolves.toEqual({ scanned: 3, awaitingProviderTerminal: 1, requiresCustomerAction: 0, captured: 1, declined: 1, failed: 0, requiresReversalReconciliation: 0 });
    expect(reader.listAwaitingCanonicalOutcome).toHaveBeenCalledWith({ limit: 3 });
    expect(reconciler.reconcile).toHaveBeenCalledTimes(3);
  });
});
