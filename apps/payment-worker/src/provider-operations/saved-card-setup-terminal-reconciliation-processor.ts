import type { SavedCardSetupTerminalReconciliationReaderPort } from "@elevenhouse/domain/finance-core";

import type { SavedCardSetupTerminalReconciler } from "./saved-card-setup-terminal-reconciler";

export type SavedCardSetupTerminalReconciliationTickResult = Readonly<{
  scanned: number;
  deferred: number;
  activated: number;
  invoiceOpened: number;
}>;

export type SavedCardSetupTerminalReconciliationProcessor = Readonly<{
  tick(): Promise<SavedCardSetupTerminalReconciliationTickResult>;
}>;

/**
 * This is a bounded recovery scanner, not a second source of state. Every mutation still goes
 * through the setup/credential/invoice UOWs with their own locks and idempotent replay rules.
 */
export function createSavedCardSetupTerminalReconciliationProcessor(input: Readonly<{
  reader: SavedCardSetupTerminalReconciliationReaderPort;
  reconciler: SavedCardSetupTerminalReconciler;
  batchSize: number;
}>): SavedCardSetupTerminalReconciliationProcessor {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error("Saved-card setup terminal reconciliation batch size is invalid");
  }
  return Object.freeze({
    async tick() {
      const candidates = await input.reader.listSavedCardSetupTerminalCandidates({ limit: input.batchSize });
      let deferred = 0;
      let activated = 0;
      let invoiceOpened = 0;
      for (const candidate of candidates) {
        const result = await input.reconciler.reconcile(candidate);
        if (result.kind === "not_terminal") deferred += 1;
        else if (result.kind === "activated_and_invoice_opened") activated += 1;
        else invoiceOpened += 1;
      }
      return Object.freeze({ scanned: candidates.length, deferred, activated, invoiceOpened });
    }
  });
}

export function startSavedCardSetupTerminalReconciliationInterval(input: Readonly<{
  processor: SavedCardSetupTerminalReconciliationProcessor;
  intervalMs: number;
  onError(error: unknown): void;
  onResult?(result: SavedCardSetupTerminalReconciliationTickResult): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Saved-card setup terminal reconciliation interval is invalid");
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
