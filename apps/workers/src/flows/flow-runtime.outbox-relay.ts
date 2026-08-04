import {
  flowRuntimeEventSourceSchema,
  flowRunSubjectTypeSchema,
  flowTriggerKindSchema
} from "@elevenhouse/contracts";
import {
  FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type DispatchFlowRuntimeEventResult,
  type FlowRuntimeDispatchOutboxReason,
  type FlowRuntimeDispatchOutboxStore,
  type FlowRuntimeDispatchRequestedPayload
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import { z } from "@elevenhouse/validation";

export type FlowRuntimeOutboxDispatcher = (
  input: FlowRuntimeDispatchRequestedPayload & { readonly now: string }
) => Promise<DispatchFlowRuntimeEventResult>;

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
  readonly store: FlowRuntimeDispatchOutboxStore;
  readonly dispatch: FlowRuntimeOutboxDispatcher;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly maxAttempts: number;
  readonly logger?: Logger;
}): Promise<number> {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
    throw new Error("Flow runtime dispatch outbox maxAttempts must be a positive integer");
  }

  const batch = await input.store.claimBatch({
    limit: input.batchSize,
    publishingLockTimeoutMs: input.publishingLockTimeoutMs,
    maxAttempts: input.maxAttempts
  });
  for (const event of batch.quarantined) {
    logQuarantined(input.logger, event);
  }

  for (const event of batch.claimed) {
    if (event.eventType !== FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT) {
      await quarantine(input, event, "FLOW_RUNTIME_DISPATCH_EVENT_TYPE_UNSUPPORTED");
      continue;
    }

    const parsedPayload = payloadSchema.safeParse(event.payload);
    if (!parsedPayload.success) {
      await quarantine(input, event, "FLOW_RUNTIME_DISPATCH_PAYLOAD_INVALID");
      continue;
    }

    const payload = parsedPayload.data;
    if (payload.subjectType === "booking" && payload.subjectId !== event.aggregateId) {
      await quarantine(input, event, "FLOW_RUNTIME_DISPATCH_AGGREGATE_MISMATCH");
      continue;
    }

    let dispatchResult: DispatchFlowRuntimeEventResult;
    try {
      dispatchResult = await input.dispatch({ ...payload, now: input.now.toISOString() });
    } catch {
      await handleTransientFailure(input, event);
      continue;
    }

    const disposition = await input.store.markPublished({
      eventId: event.id,
      claimFence: event.claimFence
    });
    if (disposition.status === "stale") {
      logStaleDisposition(input.logger, event, "published");
      continue;
    }

    if (dispatchResult.status === "execution_unavailable") {
      input.logger?.info("flow runtime dispatch outbox event ignored", {
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        matchedFlows: dispatchResult.matchedFlows,
        reasonCode: dispatchResult.reasonCode
      });
    } else {
      input.logger?.info("flow runtime dispatch outbox event published", {
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId
      });
    }
  }

  return batch.claimed.length + batch.quarantined.length;
}

async function handleTransientFailure(
  input: Parameters<typeof relayPendingFlowRuntimeDispatchEvents>[0],
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): Promise<void> {
  if (event.attempts >= input.maxAttempts) {
    await quarantine(input, event, "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED");
    return;
  }

  const retryDelayMs = nextBackoffMs(event.attempts);
  const disposition = await input.store.markRetry({
    eventId: event.id,
    claimFence: event.claimFence,
    retryDelayMs,
    reasonCode: "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE"
  });
  if (disposition.status === "stale") {
    logStaleDisposition(input.logger, event, "retry");
    return;
  }

  input.logger?.warn("flow runtime dispatch outbox retry scheduled", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    attempts: event.attempts,
    retryDelayMs,
    reasonCode: "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE"
  });
}

async function quarantine(
  input: Parameters<typeof relayPendingFlowRuntimeDispatchEvents>[0],
  event: ClaimedFlowRuntimeDispatchOutboxEvent,
  reasonCode: FlowRuntimeDispatchOutboxReason
): Promise<void> {
  const disposition = await input.store.markQuarantined({
    eventId: event.id,
    claimFence: event.claimFence,
    reasonCode
  });
  if (disposition.status === "stale") {
    logStaleDisposition(input.logger, event, "quarantined");
    return;
  }

  input.logger?.error("flow runtime dispatch outbox event quarantined", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    attempts: event.attempts,
    reasonCode
  });
}

function logQuarantined(
  logger: Logger | undefined,
  event: {
    readonly id: string;
    readonly eventType: string;
    readonly aggregateId: string;
    readonly attempts: number;
    readonly reasonCode: FlowRuntimeDispatchOutboxReason;
  }
): void {
  logger?.error("flow runtime dispatch outbox event quarantined", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    attempts: event.attempts,
    reasonCode: event.reasonCode
  });
}

function logStaleDisposition(
  logger: Logger | undefined,
  event: ClaimedFlowRuntimeDispatchOutboxEvent,
  attemptedDisposition: "published" | "retry" | "quarantined"
): void {
  logger?.warn("flow runtime dispatch outbox disposition is stale", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    attemptedDisposition
  });
}

function nextBackoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}
