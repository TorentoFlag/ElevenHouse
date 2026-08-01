import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  flowRuntimeEventSourceSchema,
  flowRunSubjectTypeSchema,
  flowTriggerKindSchema
} from "@elevenhouse/contracts";
import {
  FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
  type FlowRuntimeDispatchRequestedPayload
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { z } from "@elevenhouse/validation";

export type FlowRuntimeOutboxDispatcher = (
  input: FlowRuntimeDispatchRequestedPayload & { readonly now: string }
) => Promise<unknown>;

const payloadSchema = z
  .object({
    ownerUserId: z.string().uuid(),
    triggerKind: flowTriggerKindSchema,
    source: flowRuntimeEventSourceSchema,
    sourceEventId: z.string().trim().min(1).max(180),
    subjectType: flowRunSubjectTypeSchema,
    subjectId: z.string().trim().min(1).max(180),
    occurredAt: z.string().datetime(),
    timeZone: z.string().trim().min(1).max(120),
    payload: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export async function relayPendingFlowRuntimeDispatchEvents(input: {
  readonly store: OutboxRelayStore;
  readonly dispatch: FlowRuntimeOutboxDispatcher;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly logger?: Logger;
}): Promise<number> {
  const events = await input.store.claimPending({
    eventTypes: [FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT],
    limit: input.batchSize,
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - input.publishingLockTimeoutMs)
  });

  for (const event of events) {
    try {
      if (event.eventType !== FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT) {
        throw new Error("Unsupported flow runtime dispatch outbox event type");
      }

      const payload = payloadSchema.parse(event.payload);
      if (payload.subjectType === "booking" && payload.subjectId !== event.aggregateId) {
        throw new Error("Flow runtime dispatch aggregate does not match booking subject");
      }

      await input.dispatch({ ...payload, now: input.now.toISOString() });
      await input.store.markPublished({ eventId: event.id, publishedAt: input.now });
      input.logger?.info("flow runtime dispatch outbox event published", {
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId
      });
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error);
      await input.store.markPublishFailed({
        eventId: event.id,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + nextBackoffMs(event.attempts)),
        errorMessage
      });
      input.logger?.error("flow runtime dispatch outbox event publish failed", {
        outboxEventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts,
        errorMessage
      });
    }
  }

  return events.length;
}

function nextBackoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return "Flow runtime dispatch outbox payload is invalid";
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  return "Flow runtime dispatch outbox relay failed";
}
