import { authCodeDeliveryRequestedEventType } from "@elevenhouse/domain";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  authCodeDeliveryJobName,
  toAuthCodeDeliveryJobOptions,
  type AuthCodeDeliveryQueue,
  type AuthCodeDeliveryQueueOptions
} from "./auth-code-delivery.queue";

export async function relayPendingOutboxEvents(input: {
  readonly store: OutboxRelayStore;
  readonly queue: AuthCodeDeliveryQueue;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly queueOptions: AuthCodeDeliveryQueueOptions;
}): Promise<number> {
  const events = await input.store.claimPending({
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });

  for (const event of events) {
    try {
      if (event.eventType !== authCodeDeliveryRequestedEventType) {
        throw new Error(`Unsupported outbox event type: ${event.eventType}`);
      }

      await input.queue.add(
        authCodeDeliveryJobName,
        { outboxEventId: event.id },
        toAuthCodeDeliveryJobOptions({
          ...input.queueOptions,
          outboxEventId: event.id
        })
      );
      await input.store.markPublished({
        eventId: event.id,
        publishedAt: input.now
      });
    } catch (error) {
      await input.store.markPublishFailed({
        eventId: event.id,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage: normalizeErrorMessage(error)
      });
    }
  }

  return events.length;
}

function nextBackoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim().slice(0, 500);
  }

  return "Outbox relay failed with an unknown error";
}
