import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import type { ProviderOperationDispatchReaderPort } from "@elevenhouse/domain/finance-core";

import {
  relayPendingFinanceProviderOperationDispatches,
  type FinanceProviderDispatchRelayResult,
  type ProviderOperationDispatcher
} from "./provider-operation-dispatch-relay";

export type ProviderOperationDispatchProcessor = Readonly<{
  tick(): Promise<FinanceProviderDispatchRelayResult>;
}>;

/** A tiny orchestration shell: the relay owns fencing, durable reload and retry disposition. */
export function createProviderOperationDispatchProcessor(
  input: Readonly<{
    store: OutboxRelayStore;
    reader: ProviderOperationDispatchReaderPort;
    dispatcher: ProviderOperationDispatcher;
    now?: () => Date;
    batchSize: number;
    publishingLockTimeoutMs: number;
  }>
): ProviderOperationDispatchProcessor {
  return Object.freeze({
    tick: () =>
      relayPendingFinanceProviderOperationDispatches({
        store: input.store,
        reader: input.reader,
        dispatcher: input.dispatcher,
        now: (input.now ?? (() => new Date()))(),
        batchSize: input.batchSize,
        publishingLockTimeoutMs: input.publishingLockTimeoutMs
      })
  });
}

export function startProviderOperationDispatchInterval(
  input: Readonly<{
    processor: ProviderOperationDispatchProcessor;
    intervalMs: number;
    onError(error: unknown): void;
    onResult?(result: FinanceProviderDispatchRelayResult): void;
  }>
): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Provider operation dispatch interval is invalid");
  }
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
