/* eslint-disable @typescript-eslint/no-explicit-any -- Partial candidate fixtures exercise scanner routing only. */
import { describe, expect, it, vi } from "vitest";

import { createSavedCardSetupTerminalReconciliationProcessor } from "./saved-card-setup-terminal-reconciliation-processor";

describe("saved-card setup terminal reconciliation processor", () => {
  it("processes each durable candidate and reports terminal deferrals separately", async () => {
    const first = { state: "awaiting_provider_terminal", setupSessionId: "10000000-0000-4000-8000-000000000001" } as any;
    const second = { state: "credential_active", setupSessionId: "20000000-0000-4000-8000-000000000002" } as any;
    const reader = { listSavedCardSetupTerminalCandidates: vi.fn(async () => [first, second]) };
    const reconciler = {
      reconcile: vi.fn()
        .mockResolvedValueOnce({ kind: "not_terminal", setupSessionId: first.setupSessionId })
        .mockResolvedValueOnce({ kind: "invoice_opened_after_replay", setupSessionId: second.setupSessionId, invoiceId: "invoice-1" })
    };
    const processor = createSavedCardSetupTerminalReconciliationProcessor({
      reader: reader as any,
      reconciler: reconciler as any,
      batchSize: 25
    });

    await expect(processor.tick()).resolves.toEqual({ scanned: 2, deferred: 1, activated: 0, invoiceOpened: 1 });
    expect(reader.listSavedCardSetupTerminalCandidates).toHaveBeenCalledWith({ limit: 25 });
    expect(reconciler.reconcile).toHaveBeenCalledWith(first);
    expect(reconciler.reconcile).toHaveBeenCalledWith(second);
  });
});
