import {
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
  FlowBookingEnrollmentDeferredError,
  FlowBookingEnrollmentIntegrityError,
  FlowBookingLifecycleDeferredError,
  FlowBookingLifecycleIntegrityError,
  FlowBookingLifecycleRuntimeDeferredError,
  bookingLifecycleDispatchRequestedPayloadSchema,
  flowBookingConfirmedEnrollmentRequestedPayloadV1Schema,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type FlowBookingConfirmedEnrollmentRequestedPayloadV1,
  type FlowBookingEnrollmentResult,
  type FlowBookingLifecycleProcessingResult,
  type FlowRuntimeDispatchOutboxReason,
  type FlowRuntimeDispatchOutboxStore
} from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

export type FlowBookingEnrollmentDispatcher = (
  input: FlowBookingConfirmedEnrollmentRequestedPayloadV1
) => Promise<FlowBookingEnrollmentResult>;

export type FlowBookingLifecycleDispatcher = (
  lifecycleEventId: string
) => Promise<FlowBookingLifecycleProcessingResult>;

type FlowRuntimeOutboxRelayInput = {
  readonly store: FlowRuntimeDispatchOutboxStore;
  readonly enrollBookingConfirmed: FlowBookingEnrollmentDispatcher;
  readonly processBookingLifecycleEvent: FlowBookingLifecycleDispatcher;
  readonly now: Date;
  readonly batchSize: number;
  readonly publishingLockTimeoutMs: number;
  readonly maxAttempts: number;
  readonly enrollmentDeferDelayMs: number;
  readonly logger?: Logger;
};

export async function relayPendingFlowRuntimeDispatchEvents(
  input: FlowRuntimeOutboxRelayInput
): Promise<number> {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
    throw new Error("Flow runtime dispatch outbox maxAttempts must be a positive integer");
  }
  if (
    !Number.isInteger(input.enrollmentDeferDelayMs) ||
    input.enrollmentDeferDelayMs < 1 ||
    input.enrollmentDeferDelayMs > 86_400_000
  ) {
    throw new Error("Flow booking enrollment defer delay must be a positive bounded integer");
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
    if (event.eventType === BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED) {
      await relayBookingLifecycleEvent(input, event);
      continue;
    }
    if (event.eventType === FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT) {
      await relayBookingEnrollment(input, event);
      continue;
    }
    await quarantine(input, event, "FLOW_RUNTIME_DISPATCH_EVENT_TYPE_UNSUPPORTED");
  }

  return batch.claimed.length + batch.quarantined.length;
}

async function relayBookingLifecycleEvent(
  input: FlowRuntimeOutboxRelayInput,
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): Promise<void> {
  const parsedPayload = bookingLifecycleDispatchRequestedPayloadSchema.safeParse(event.payload);
  if (!parsedPayload.success) {
    await quarantine(input, event, "FLOW_BOOKING_LIFECYCLE_PAYLOAD_INVALID");
    return;
  }
  if (parsedPayload.data.lifecycleEventId !== event.aggregateId) {
    await quarantine(input, event, "FLOW_BOOKING_LIFECYCLE_AGGREGATE_MISMATCH");
    return;
  }

  let result: FlowBookingLifecycleProcessingResult;
  try {
    result = await input.processBookingLifecycleEvent(parsedPayload.data.lifecycleEventId);
  } catch (error) {
    if (
      error instanceof FlowBookingLifecycleDeferredError ||
      error instanceof FlowBookingLifecycleRuntimeDeferredError
    ) {
      await deferLifecycle(input, event);
      return;
    }
    if (error instanceof FlowBookingLifecycleIntegrityError) {
      await quarantine(input, event, error.code);
      return;
    }
    if (error instanceof FlowBookingEnrollmentDeferredError) {
      await deferLifecycle(input, event);
      return;
    }
    if (error instanceof FlowBookingEnrollmentIntegrityError) {
      await quarantine(input, event, toEnrollmentQuarantineReason(error.code));
      return;
    }
    await handleTransientFailure(input, event);
    return;
  }

  if (!(await markPublished(input, event))) return;
  input.logger?.info("flow booking lifecycle outbox event published", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    bookingId: result.bookingId,
    lifecycleRevision: result.appliedRevision,
    lifecycleEventKind: result.eventKind,
    outcome: result.outcome,
    replayed: result.replayed,
    affectedRunCount: result.affectedRunCount,
    affectedWorkItemCount: result.affectedWorkItemCount
  });
}

async function relayBookingEnrollment(
  input: FlowRuntimeOutboxRelayInput,
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): Promise<void> {
  const parsedPayload = flowBookingConfirmedEnrollmentRequestedPayloadV1Schema.safeParse(
    event.payload
  );
  if (!parsedPayload.success) {
    await quarantine(input, event, "FLOW_BOOKING_ENROLLMENT_PAYLOAD_INVALID");
    return;
  }
  if (parsedPayload.data.subjectId !== event.aggregateId) {
    await quarantine(input, event, "FLOW_BOOKING_ENROLLMENT_AGGREGATE_MISMATCH");
    return;
  }

  let result: FlowBookingEnrollmentResult;
  try {
    result = await input.enrollBookingConfirmed(parsedPayload.data);
  } catch (error) {
    if (error instanceof FlowBookingEnrollmentDeferredError) {
      await deferEnrollment(input, event);
      return;
    }
    if (error instanceof FlowBookingEnrollmentIntegrityError) {
      await quarantine(input, event, toEnrollmentQuarantineReason(error.code));
      return;
    }
    await handleTransientFailure(input, event);
    return;
  }

  if (!(await markPublished(input, event))) return;
  input.logger?.info("flow booking enrollment outbox event published", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    outcome: result.status,
    replayed: result.replayed,
    runCount: result.runs.length
  });
}

function toEnrollmentQuarantineReason(
  code: FlowBookingEnrollmentIntegrityError["code"]
): FlowRuntimeDispatchOutboxReason {
  if (code === "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_INVALID") {
    return "FLOW_BOOKING_ENROLLMENT_PROVENANCE_INVALID";
  }
  if (code === "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_CONFLICT") {
    return "FLOW_BOOKING_ENROLLMENT_PROVENANCE_CONFLICT";
  }
  return code;
}

async function markPublished(
  input: FlowRuntimeOutboxRelayInput,
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): Promise<boolean> {
  const disposition = await input.store.markPublished({
    eventId: event.id,
    claimFence: event.claimFence
  });
  if (disposition.status === "stale") {
    logStaleDisposition(input.logger, event, "published");
    return false;
  }
  return true;
}

async function deferEnrollment(
  input: FlowRuntimeOutboxRelayInput,
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): Promise<void> {
  const disposition = await input.store.markDeferred({
    eventId: event.id,
    claimFence: event.claimFence,
    retryDelayMs: input.enrollmentDeferDelayMs,
    reasonCode: "FLOW_BOOKING_ENROLLMENT_DEFERRED"
  });
  if (disposition.status === "stale") {
    logStaleDisposition(input.logger, event, "deferred");
    return;
  }
  input.logger?.info("flow booking enrollment outbox event deferred", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    retryDelayMs: input.enrollmentDeferDelayMs,
    reasonCode: "FLOW_BOOKING_ENROLLMENT_DEFERRED"
  });
}

async function deferLifecycle(
  input: FlowRuntimeOutboxRelayInput,
  event: ClaimedFlowRuntimeDispatchOutboxEvent
): Promise<void> {
  const disposition = await input.store.markDeferred({
    eventId: event.id,
    claimFence: event.claimFence,
    retryDelayMs: input.enrollmentDeferDelayMs,
    reasonCode: "FLOW_BOOKING_LIFECYCLE_DEFERRED"
  });
  if (disposition.status === "stale") {
    logStaleDisposition(input.logger, event, "deferred");
    return;
  }
  input.logger?.info("flow booking lifecycle outbox event deferred", {
    outboxEventId: event.id,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    retryDelayMs: input.enrollmentDeferDelayMs,
    reasonCode: "FLOW_BOOKING_LIFECYCLE_DEFERRED"
  });
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
  attemptedDisposition: "published" | "retry" | "deferred" | "quarantined"
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
