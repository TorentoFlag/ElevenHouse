import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import type { FinanceClientOrderCapturePurposeDispatchUnitOfWork } from "@elevenhouse/domain/finance-core";

import {
  relayFinanceClientOrderCaptureDispatches,
  type ClientOrderCapturePurposeDispatcher
} from "./finance-client-order-capture-dispatch-relay";

export type ClientOrderCaptureDispatchProcessor = Readonly<{
  tick(): ReturnType<typeof relayFinanceClientOrderCaptureDispatches>;
}>;

export function createClientOrderCaptureDispatchProcessor(input: Readonly<{
  store: OutboxRelayStore;
  unitOfWork: FinanceClientOrderCapturePurposeDispatchUnitOfWork;
  batchSize: number;
  publishingLockTimeoutMs: number;
  now?: () => Date;
}>): ClientOrderCaptureDispatchProcessor {
  const dispatcher: ClientOrderCapturePurposeDispatcher = {
    dispatch: (payload) => input.unitOfWork.rehydrateAndDispatchClientOrderCapture(payload)
  };
  return Object.freeze({
    tick: () =>
      relayFinanceClientOrderCaptureDispatches({
        store: input.store,
        dispatcher,
        now: (input.now ?? (() => new Date()))(),
        batchSize: input.batchSize,
        publishingLockTimeoutMs: input.publishingLockTimeoutMs,
        maximumAttempts: 3
      })
  });
}

export function startClientOrderCaptureDispatchInterval(input: Readonly<{
  processor: ClientOrderCaptureDispatchProcessor;
  intervalMs: number;
  onError(error: unknown): void;
  onResult?(result: Awaited<ReturnType<ClientOrderCaptureDispatchProcessor["tick"]>>): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Client subscription capture dispatch interval is invalid");
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
