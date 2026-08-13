import {
  FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT as domainEventType,
  createClientOrderCapturePurposeDispatchPayload,
  type FinanceClientOrderCapturePurposeDispatchExecution
} from "@elevenhouse/domain/finance-core";
import {
  OutboxRelayStaleClaimError,
  type ClaimedOutboxEvent,
  type OutboxRelayStore
} from "@elevenhouse/db/outbox";

export const FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT = domainEventType;

export type ClientOrderCapturePurposeDispatcher = Readonly<{
  dispatch(
    input: Readonly<{ captureApplicationReceiptId: string }>
  ): Promise<FinanceClientOrderCapturePurposeDispatchExecution>;
}>;

export async function relayFinanceClientOrderCaptureDispatches(
  input: Readonly<{
    store: OutboxRelayStore;
    dispatcher: ClientOrderCapturePurposeDispatcher;
    now: Date;
    batchSize: number;
    publishingLockTimeoutMs: number;
    /** Composition must set exactly three total attempts: two requeues, then quarantine. */
    maximumAttempts: number;
  }>
): Promise<
  Readonly<{
    claimed: number;
    dispatched: number;
    replayed: number;
    skipped: number;
    requeued: number;
    quarantined: number;
  }>
> {
  assertPositive(input.batchSize);
  assertPositive(input.publishingLockTimeoutMs);
  assertPositive(input.maximumAttempts);
  const events = await input.store.claimPending({
    eventTypes: [FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });
  let dispatched = 0;
  let replayed = 0;
  let skipped = 0;
  let requeued = 0;
  let quarantined = 0;
  for (const event of events) {
    let payload: Readonly<{ captureApplicationReceiptId: string }>;
    try {
      payload = createClientOrderCapturePurposeDispatchPayload(event.payload);
      if (
        event.eventType !== FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT ||
        event.aggregateId !== payload.captureApplicationReceiptId
      ) {
        if (
          await quarantine(
            input,
            event,
            "CLIENT_SUBSCRIPTION_CAPTURE_OUTBOX_INTEGRITY",
            "Client subscription capture outbox payload is inconsistent"
          )
        ) {
          quarantined += 1;
        }
        continue;
      }
    } catch {
      if (
        await quarantine(
          input,
          event,
          "CLIENT_SUBSCRIPTION_CAPTURE_OUTBOX_INTEGRITY",
          "Client subscription capture outbox payload is inconsistent"
        )
      ) {
        quarantined += 1;
      }
      continue;
    }

    let result: FinanceClientOrderCapturePurposeDispatchExecution;
    try {
      result = await input.dispatcher.dispatch(payload);
    } catch {
      if (event.attempts + 1 >= input.maximumAttempts) {
        if (
          await quarantine(
            input,
            event,
            "CLIENT_SUBSCRIPTION_CAPTURE_RETRY_EXHAUSTED",
            "Client subscription capture dispatch retry budget exhausted"
          )
        ) {
          quarantined += 1;
        }
      } else if (
        await applyClaim(input.store, () =>
          input.store.markPublishFailed({
            eventId: event.id,
            claimFence: event.claimFence,
            failedAt: input.now,
            nextAvailableAt: new Date(input.now.getTime() + retryDelayMs(event.attempts)),
            errorMessage: "Client subscription capture dispatch requires retry or operator review"
          })
        )
      ) {
        requeued += 1;
      }
      continue;
    }

    if (
      result.outcome !== "dispatched" &&
      result.outcome !== "replayed" &&
      result.outcome !== "not_client_subscription"
    ) {
      if (await quarantine(input, event, reasonFor(result.outcome), messageFor(result.outcome))) {
        quarantined += 1;
      }
      continue;
    }

    if (
      !(await applyClaim(input.store, () =>
        input.store.markPublished({
          eventId: event.id,
          claimFence: event.claimFence,
          publishedAt: input.now
        })
      ))
    )
      continue;
    if (result.outcome === "dispatched") dispatched += 1;
    else if (result.outcome === "replayed") replayed += 1;
    else skipped += 1;
  }
  return Object.freeze({
    claimed: events.length,
    dispatched,
    replayed,
    skipped,
    requeued,
    quarantined
  });
}

function reasonFor(
  outcome: Exclude<
    FinanceClientOrderCapturePurposeDispatchExecution["outcome"],
    "dispatched" | "replayed" | "not_client_subscription"
  >
): string {
  return `CLIENT_SUBSCRIPTION_CAPTURE_${outcome.toUpperCase()}`;
}

function messageFor(outcome: string): string {
  return `Client subscription capture dispatch ${outcome.replaceAll("_", " ")}`;
}

async function quarantine(
  input: Readonly<{ store: OutboxRelayStore; now: Date }>,
  event: ClaimedOutboxEvent,
  reasonCode: string,
  errorMessage: string
): Promise<boolean> {
  return await applyClaim(input.store, () =>
    input.store.markQuarantined({
      eventId: event.id,
      claimFence: event.claimFence,
      quarantinedAt: input.now,
      reasonCode,
      errorMessage
    })
  );
}

async function applyClaim(
  store: OutboxRelayStore,
  mutation: () => Promise<void>
): Promise<boolean> {
  try {
    await mutation();
    return true;
  } catch (error) {
    if (error instanceof OutboxRelayStaleClaimError) return false;
    throw error;
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(1_000 * 2 ** Math.min(attempts, 17), 24 * 60 * 60 * 1_000);
}

function assertPositive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Client subscription capture relay configuration is invalid");
}
