import { messagingMessageDeliveryRequestedEventType } from "@elevenhouse/domain";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import type { Logger } from "@elevenhouse/observability";
import {
  messagingDeliveryJobName,
  toMessagingDeliveryJobOptions,
  type MessagingDeliveryQueue,
  type MessagingDeliveryQueueOptions
} from "./messaging-delivery.queue";

export async function relayPendingMessagingOutboxEvents(input: {
  readonly store: OutboxRelayStore;
  readonly queue: MessagingDeliveryQueue;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly queueOptions: MessagingDeliveryQueueOptions;
  readonly logger?: Logger;
}): Promise<number> {
  const events = await input.store.claimPending({
    eventTypes: [messagingMessageDeliveryRequestedEventType],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });
  input.logger?.info("messaging delivery outbox events claimed", {
    count: events.length,
    batchSize: input.batchSize
  });

  for (const event of events) {
    try {
      input.logger?.info("messaging delivery outbox event publishing", {
        outboxEventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts
      });

      if (event.eventType !== messagingMessageDeliveryRequestedEventType) {
        throw new Error(`Unsupported messaging outbox event type: ${event.eventType}`);
      }

      await input.queue.add(
        messagingDeliveryJobName,
        { outboxEventId: event.id },
        toMessagingDeliveryJobOptions({
          ...input.queueOptions,
          outboxEventId: event.id
        })
      );
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error);
      await input.store.markPublishFailed({
        eventId: event.id,
        claimFence: event.claimFence,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage
      });
      input.logger?.error("messaging delivery outbox event publish failed", {
        outboxEventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts,
        errorMessage
      });
      continue;
    }

    await input.store.markPublished({
      eventId: event.id,
      claimFence: event.claimFence,
      publishedAt: input.now
    });
    input.logger?.info("messaging delivery outbox event published", {
      outboxEventId: event.id,
      eventType: event.eventType
    });
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

  return "Messaging outbox relay failed with an unknown error";
}
