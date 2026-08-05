import {
  FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT,
  createFinanceProviderOperationDispatchRequestedPayload,
  type ProviderOperationDispatchReaderPort,
  type ProviderOperationDispatchWorkItem
} from "@elevenhouse/domain/finance-core";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";

const maximumRetryDelayMs = 24 * 60 * 60 * 1_000;
const initialRetryDelayMs = 1_000;

export type ProviderOperationDispatcher = Readonly<{
  dispatch(workItem: ProviderOperationDispatchWorkItem): Promise<void>;
}>;

export type FinanceProviderDispatchRelayResult = Readonly<{
  claimed: number;
  dispatched: number;
  requeued: number;
}>;

/**
 * Fenced relay for the ID-only provider-dispatch outbox. It deliberately reloads all request
 * evidence from the database and private storage; an outbox row is never itself a payment command.
 */
export async function relayPendingFinanceProviderOperationDispatches(
  input: Readonly<{
    store: OutboxRelayStore;
    reader: ProviderOperationDispatchReaderPort;
    dispatcher: ProviderOperationDispatcher;
    now: Date;
    batchSize: number;
    publishingLockTimeoutMs: number;
  }>
): Promise<FinanceProviderDispatchRelayResult> {
  const events = await input.store.claimPending({
    eventTypes: [FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT],
    limit: positiveSafeInteger(input.batchSize),
    now: input.now,
    stalePublishingBefore: new Date(
      input.now.getTime() - positiveSafeInteger(input.publishingLockTimeoutMs)
    )
  });

  let dispatched = 0;
  let requeued = 0;
  for (const event of events) {
    try {
      const payload = createFinanceProviderOperationDispatchRequestedPayload(event.payload);
      if (
        event.eventType !== FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT ||
        event.aggregateId !== payload.providerOperationIntentId
      ) {
        throw new FinanceProviderDispatchRelayError("outbox_integrity_conflict");
      }
      const workItem = await input.reader.readDispatchWorkItem({
        providerOperationIntentId: payload.providerOperationIntentId,
        requestId: event.id
      });
      await input.dispatcher.dispatch(workItem);
      await input.store.markPublished({
        eventId: event.id,
        claimFence: event.claimFence,
        publishedAt: input.now
      });
      dispatched += 1;
    } catch {
      await input.store.markPublishFailed({
        eventId: event.id,
        claimFence: event.claimFence,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + retryDelayMs(event.attempts)),
        errorMessage: "Finance provider operation dispatch requires retry or operator review"
      });
      requeued += 1;
    }
  }
  return Object.freeze({ claimed: events.length, dispatched, requeued });
}

export class FinanceProviderDispatchRelayError extends Error {
  readonly code = "FINANCE_PROVIDER_DISPATCH_RELAY_ERROR" as const;

  constructor(readonly reason: "outbox_integrity_conflict") {
    super("Finance provider dispatch relay rejected an inconsistent outbox event");
    this.name = "FinanceProviderDispatchRelayError";
  }
}

export function retryDelayMs(previousAttempts: number): number {
  if (!Number.isSafeInteger(previousAttempts) || previousAttempts < 0) {
    throw new FinanceProviderDispatchRelayError("outbox_integrity_conflict");
  }
  return Math.min(initialRetryDelayMs * 2 ** Math.min(previousAttempts, 17), maximumRetryDelayMs);
}

function positiveSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new FinanceProviderDispatchRelayError("outbox_integrity_conflict");
  }
  return value;
}
