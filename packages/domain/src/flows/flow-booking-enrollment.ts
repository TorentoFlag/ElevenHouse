import {
  flowCapabilityManifestV2Schema,
  flowExecutableNodeKindV2Schema,
  flowGraphV2Schema,
  type FlowExecutableNodeKindV2
} from "@elevenhouse/contracts";
import type {
  BookingLifecycleEvent,
  BookingSource,
  BookingState
} from "../bookings";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { verifyFlowCapabilityManifestForGraph } from "./flow-capability-manifest-integrity";
import {
  createFlowRuntimeRequirementKeys,
  type FlowRuntimeEnrollmentAdmission
} from "./flow-runtime-control";
import type { FlowBookingConfirmedEnrollmentRequestedPayloadV1 } from "./flow-runtime-outbox";

export type FlowBookingEnrollmentSubject = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly state: BookingState;
  readonly source: BookingSource;
  readonly startAt: string;
  readonly endAt: string;
  readonly timeZone: string;
};

export type FlowNormalizedBookingConfirmedEventV1 = {
  readonly schemaVersion: "flow-normalized-event.v1";
  readonly ownerUserId: string;
  readonly source: "booking";
  readonly sourceEventId: string;
  readonly eventKind: "booking_confirmed";
  readonly subjectType: "booking";
  readonly subjectId: string;
  readonly occurrenceKey: string;
  readonly occurredAtUtc: string;
  readonly payloadSchemaVersion: 1;
  readonly allowlistedPayload: {
    readonly bookingId: string;
    readonly clientUserId: string;
      readonly productId: string;
      readonly startAt: string;
      readonly endAt: string;
      readonly lifecycleEventId: string | null;
      readonly lifecycleRevision: number | null;
  };
  readonly classification: "personal";
  readonly redactionVersion: 1;
  readonly retentionPolicyId: "flows.booking-confirmed.v1";
  readonly dedupeKey: string;
  readonly canonicalPayloadHash: `sha256:${string}`;
};

export type FlowBookingEnrollmentCandidate = {
  readonly activationEpochId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly ownerUserId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly rolloutPolicyRevision: number;
  readonly manifestDigest: `sha256:${string}`;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

export type FlowBookingEnrollmentPlan =
  | {
      readonly status: "not_matched";
      readonly reason: "product_filter" | "trigger_kind";
    }
  | {
      readonly status: "matched";
      readonly activationEpochId: string;
      readonly flowId: string;
      readonly flowVersionId: string;
      readonly triggerNodeId: string;
      readonly occurrenceKey: string;
      readonly enrollmentPolicyKey: "once_per_occurrence";
      readonly enrollmentPolicyRevision: 1;
      readonly rolloutPolicyRevision: number;
      readonly requirementKeys: readonly string[];
      readonly initialToken: {
        readonly nodeId: string;
        readonly nodeKind: FlowExecutableNodeKindV2;
        readonly configSchemaVersion: number;
        readonly executorContractVersion: number;
        readonly executorKey: `${FlowExecutableNodeKindV2}:${number}:${number}`;
      };
    };

export type FlowBookingEnrollmentPersistedRun = {
  readonly runId: string;
  readonly tokenId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly activationEpochId: string;
};

export type FlowBookingEnrollmentResult = {
  readonly status:
    | "enrolled"
    | "no_match"
    | "late_unmatched"
    | "subject_ineligible"
    | "suppressed";
  readonly replayed: boolean;
  readonly eventId: string;
  readonly runs: readonly FlowBookingEnrollmentPersistedRun[];
};

export type FlowBookingEnrollmentStore = {
  readonly enrollBookingConfirmed: (input: {
    readonly request: FlowBookingConfirmedEnrollmentRequestedPayloadV1;
    readonly latenessHorizonMs: number;
    readonly futureSkewToleranceMs: number;
  }) => Promise<FlowBookingEnrollmentResult>;
};

export class FlowBookingEnrollmentDeferredError extends Error {
  override readonly name = "FlowBookingEnrollmentDeferredError";
  readonly code = "FLOW_BOOKING_ENROLLMENT_DEFERRED";

  constructor(
    readonly runtimeReasonCode: Extract<
      FlowRuntimeEnrollmentAdmission,
      { readonly kind: "deferred" }
    >["reasonCode"] = "FLOW_RUNTIME_ENROLLMENT_WORKER_NOT_READY"
  ) {
    super(`Flow booking enrollment is temporarily disabled: ${runtimeReasonCode}`);
  }
}

export class FlowBookingEnrollmentIntegrityError extends Error {
  override readonly name = "FlowBookingEnrollmentIntegrityError";

  constructor(
    readonly code:
      | "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_INVALID"
      | "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_CONFLICT"
      | "FLOW_BOOKING_ENROLLMENT_EVENT_TIME_INVALID"
      | "FLOW_BOOKING_ENROLLMENT_SUBJECT_UNAVAILABLE"
      | "FLOW_BOOKING_ENROLLMENT_AUTHORITY_INVALID"
      | "FLOW_BOOKING_ENROLLMENT_PINNED_DEFINITION_INVALID",
    message: string
  ) {
    super(`${code}: ${message}`);
  }
}

export function normalizeBookingConfirmedFlowEnrollmentEvent(input: {
  readonly request: FlowBookingConfirmedEnrollmentRequestedPayloadV1;
  readonly subject: FlowBookingEnrollmentSubject;
}): FlowNormalizedBookingConfirmedEventV1 {
  assertBookingEnrollmentRequestIdentity(input.request, input.subject.id);
  const event = {
    schemaVersion: "flow-normalized-event.v1",
    ownerUserId: input.subject.ownerUserId,
    source: "booking",
    sourceEventId: input.request.sourceEventId,
    eventKind: "booking_confirmed",
    subjectType: "booking",
    subjectId: input.subject.id,
    occurrenceKey: input.subject.id,
    occurredAtUtc: new Date(input.request.occurredAt).toISOString(),
    payloadSchemaVersion: 1,
    allowlistedPayload: {
      bookingId: input.subject.id,
      clientUserId: input.subject.clientUserId,
      productId: input.subject.productId,
      startAt: input.subject.startAt,
      endAt: input.subject.endAt,
      lifecycleEventId: null,
      lifecycleRevision: null
    },
    classification: "personal",
    redactionVersion: 1,
    retentionPolicyId: "flows.booking-confirmed.v1",
    dedupeKey: `booking-confirmed:${input.subject.id}`
  } as const;

  return {
    ...event,
    canonicalPayloadHash: sha256CanonicalJson(event as unknown as CanonicalJson)
  };
}

export function normalizeBookingConfirmedFlowLifecycleEvent(input: {
  readonly lifecycleEvent: BookingLifecycleEvent;
  readonly subject: FlowBookingEnrollmentSubject;
}): FlowNormalizedBookingConfirmedEventV1 {
  if (
    input.lifecycleEvent.kind !== "confirmed" ||
    input.lifecycleEvent.revision !== 1 ||
    input.lifecycleEvent.after === null ||
    input.lifecycleEvent.before !== null ||
    input.lifecycleEvent.bookingId !== input.subject.id ||
    input.lifecycleEvent.ownerUserId !== input.subject.ownerUserId
  ) {
    throw new FlowBookingEnrollmentIntegrityError(
      "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_INVALID",
      "the Booking lifecycle event does not identify a canonical confirmation for the resolved subject"
    );
  }

  const event = {
    schemaVersion: "flow-normalized-event.v1",
    ownerUserId: input.subject.ownerUserId,
    source: "booking",
    sourceEventId: input.lifecycleEvent.id,
    eventKind: "booking_confirmed",
    subjectType: "booking",
    subjectId: input.subject.id,
    occurrenceKey: input.subject.id,
    occurredAtUtc: new Date(input.lifecycleEvent.occurredAt).toISOString(),
    payloadSchemaVersion: 1,
    allowlistedPayload: {
      bookingId: input.subject.id,
      clientUserId: input.subject.clientUserId,
      productId: input.subject.productId,
      startAt: input.lifecycleEvent.after.startAt,
      endAt: input.lifecycleEvent.after.endAt,
      lifecycleEventId: input.lifecycleEvent.id,
      lifecycleRevision: input.lifecycleEvent.revision
    },
    classification: "personal",
    redactionVersion: 1,
    retentionPolicyId: "flows.booking-confirmed.v1",
    dedupeKey: `booking-confirmed:${input.subject.id}`
  } as const;

  return {
    ...event,
    canonicalPayloadHash: sha256CanonicalJson(event as unknown as CanonicalJson)
  };
}

export function evaluateBookingConfirmedFlowEventTiming(input: {
  readonly occurredAtUtc: string;
  readonly receivedAtUtc: string;
  readonly latenessHorizonMs: number;
  readonly futureSkewToleranceMs: number;
}): "eligible" | "late_unmatched" {
  const occurredAt = Date.parse(input.occurredAtUtc);
  const receivedAt = Date.parse(input.receivedAtUtc);
  if (
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(receivedAt) ||
    !Number.isSafeInteger(input.latenessHorizonMs) ||
    input.latenessHorizonMs < 0 ||
    !Number.isSafeInteger(input.futureSkewToleranceMs) ||
    input.futureSkewToleranceMs < 0 ||
    occurredAt > receivedAt + input.futureSkewToleranceMs
  ) {
    throw new FlowBookingEnrollmentIntegrityError(
      "FLOW_BOOKING_ENROLLMENT_EVENT_TIME_INVALID",
      "event timing or configured bounds are invalid"
    );
  }

  return receivedAt - occurredAt > input.latenessHorizonMs ? "late_unmatched" : "eligible";
}

export function planBookingConfirmedFlowEnrollment(input: {
  readonly event: FlowNormalizedBookingConfirmedEventV1;
  readonly candidate: FlowBookingEnrollmentCandidate;
}): FlowBookingEnrollmentPlan {
  const graphResult = flowGraphV2Schema.safeParse(input.candidate.graph);
  const manifestResult = flowCapabilityManifestV2Schema.safeParse(
    input.candidate.capabilityManifest
  );
  if (!graphResult.success || !manifestResult.success) {
    throw pinnedDefinitionError("the activation epoch does not pin a V2 graph and manifest");
  }
  const graph = graphResult.data;
  const manifest = manifestResult.data;
  const occurredAt = Date.parse(input.event.occurredAtUtc);
  const effectiveFrom = Date.parse(input.candidate.effectiveFrom);
  const effectiveTo =
    input.candidate.effectiveTo === null ? null : Date.parse(input.candidate.effectiveTo);
  const manifestDigest = sha256CanonicalJson(manifest as unknown as CanonicalJson);
  if (
    input.candidate.ownerUserId !== input.event.ownerUserId ||
    !Number.isSafeInteger(input.candidate.rolloutPolicyRevision) ||
    input.candidate.rolloutPolicyRevision < 1 ||
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(effectiveFrom) ||
    (effectiveTo !== null && (!Number.isFinite(effectiveTo) || effectiveTo <= effectiveFrom)) ||
    occurredAt < effectiveFrom ||
    (effectiveTo !== null && occurredAt >= effectiveTo) ||
    manifestDigest !== input.candidate.manifestDigest ||
    !verifyFlowCapabilityManifestForGraph({ graph, capabilityManifest: manifest }).valid
  ) {
    throw pinnedDefinitionError("the activation epoch is inconsistent with the enrollment event");
  }
  if (manifest.triggerMatcher.kind !== "booking_confirmed") {
    return { status: "not_matched", reason: "trigger_kind" };
  }
  if (
    manifest.triggerMatcher.configSchemaVersion !== 1 ||
    manifest.triggerMatcher.matcherContractVersion !== 1 ||
    manifest.triggerMatcher.eventSchemaVersion !== input.event.payloadSchemaVersion
  ) {
    throw pinnedDefinitionError("the activation epoch is inconsistent with the enrollment event");
  }

  const trigger = graph.nodes.find((node) => node.kind === "booking_confirmed");
  if (!trigger) throw pinnedDefinitionError("the pinned graph has no booking trigger");
  if (!trigger.config.productIds.includes(input.event.allowlistedPayload.productId)) {
    return { status: "not_matched", reason: "product_filter" };
  }

  const nextEdges = graph.edges.filter(
    (edge) => edge.sourceNodeId === trigger.id && edge.sourceHandle === "next"
  );
  const nextEdge = nextEdges.length === 1 ? nextEdges[0] : undefined;
  const target = nextEdge
    ? graph.nodes.find((node) => node.id === nextEdge.targetNodeId)
    : undefined;
  if (!target || !flowExecutableNodeKindV2Schema.safeParse(target.kind).success) {
    throw pinnedDefinitionError("the booking trigger must have one executable next target");
  }
  const nodeKind = target.kind as FlowExecutableNodeKindV2;

  return {
    status: "matched",
    activationEpochId: input.candidate.activationEpochId,
    flowId: input.candidate.flowId,
    flowVersionId: input.candidate.flowVersionId,
    triggerNodeId: trigger.id,
    occurrenceKey: input.event.occurrenceKey,
    enrollmentPolicyKey: "once_per_occurrence",
    enrollmentPolicyRevision: 1,
    rolloutPolicyRevision: input.candidate.rolloutPolicyRevision,
    requirementKeys: createFlowRuntimeRequirementKeys(manifest),
    initialToken: {
      nodeId: target.id,
      nodeKind,
      configSchemaVersion: target.configSchemaVersion,
      executorContractVersion: target.executorContractVersion,
      executorKey: `${nodeKind}:${target.configSchemaVersion}:${target.executorContractVersion}`
    }
  };
}

function assertBookingEnrollmentRequestIdentity(
  request: FlowBookingConfirmedEnrollmentRequestedPayloadV1,
  bookingId: string
): void {
  if (
    request.schemaVersion !== "flow-booking-confirmed-enrollment-request.v1" ||
    request.eventKind !== "booking_confirmed" ||
    request.source !== "booking" ||
    request.sourceEventId !== `booking:${bookingId}:confirmed` ||
    request.subjectType !== "booking" ||
    request.subjectId !== bookingId ||
    request.occurrenceKey !== bookingId ||
    request.payloadSchemaVersion !== 1 ||
    request.payload.bookingId !== bookingId ||
    !Number.isFinite(Date.parse(request.occurredAt))
  ) {
    throw new FlowBookingEnrollmentIntegrityError(
      "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_INVALID",
      "the transport event does not match the authoritative Booking aggregate"
    );
  }
}

function pinnedDefinitionError(message: string): FlowBookingEnrollmentIntegrityError {
  return new FlowBookingEnrollmentIntegrityError(
    "FLOW_BOOKING_ENROLLMENT_PINNED_DEFINITION_INVALID",
    message
  );
}
