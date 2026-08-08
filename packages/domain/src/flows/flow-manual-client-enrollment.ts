import {
  flowCapabilityManifestV2Schema,
  flowExecutableNodeKindV2Schema,
  flowGraphV2Schema,
  type FlowExecutableNodeKindV2
} from "@elevenhouse/contracts";

import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { verifyFlowCapabilityManifestForGraph } from "./flow-capability-manifest-integrity";
import { createFlowRuntimeRequirementKeys } from "./flow-runtime-control";

export type FlowManualClientEnrollmentSubject = {
  readonly userId: string;
  readonly relationshipId: string;
};

export type FlowNormalizedManualClientEventV1 = {
  readonly schemaVersion: "flow-normalized-event.v1";
  readonly ownerUserId: string;
  readonly source: "manual";
  readonly sourceEventId: string;
  readonly eventKind: "manual_client";
  readonly subjectType: "client";
  readonly subjectId: string;
  readonly occurrenceKey: `sha256:${string}`;
  readonly occurredAtUtc: string;
  readonly payloadSchemaVersion: 1;
  readonly allowlistedPayload: {
    readonly clientUserId: string;
    readonly relationshipId: string;
  };
  readonly classification: "personal";
  readonly redactionVersion: 1;
  readonly retentionPolicyId: "flows.manual-client.v1";
  readonly dedupeKey: string;
  readonly canonicalPayloadHash: `sha256:${string}`;
};

export type FlowManualClientEnrollmentCandidate = {
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

export type FlowManualClientEnrollmentPlan = {
  readonly status: "matched";
  readonly activationEpochId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly triggerNodeId: string;
  readonly occurrenceKey: `sha256:${string}`;
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

export type FlowManualClientEnrollmentPersistedRun = {
  readonly runId: string;
  readonly tokenId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly activationEpochId: string;
};

export type FlowManualClientEnrollmentResult = {
  readonly status: "enrolled" | "no_match" | "suppressed";
  readonly replayed: boolean;
  readonly eventId: string;
  readonly runs: readonly FlowManualClientEnrollmentPersistedRun[];
};

export type FlowManualClientEnrollmentStore = {
  readonly enrollManualClient: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
    readonly clientUserId: string;
    readonly idempotencyKey: string;
  }) => Promise<FlowManualClientEnrollmentResult>;
};

export class FlowManualClientEnrollmentIntegrityError extends Error {
  override readonly name = "FlowManualClientEnrollmentIntegrityError";
  readonly code = "FLOW_MANUAL_CLIENT_ENROLLMENT_PINNED_DEFINITION_INVALID" as const;

  constructor(message: string) {
    super(`FLOW_MANUAL_CLIENT_ENROLLMENT_PINNED_DEFINITION_INVALID: ${message}`);
  }
}

export class FlowManualClientEnrollmentSubjectUnavailableError extends Error {
  override readonly name = "FlowManualClientEnrollmentSubjectUnavailableError";
  readonly code = "FLOW_MANUAL_CLIENT_ENROLLMENT_SUBJECT_UNAVAILABLE" as const;

  constructor() {
    super("FLOW_MANUAL_CLIENT_ENROLLMENT_SUBJECT_UNAVAILABLE: client relationship is not active");
  }
}

export class FlowManualClientEnrollmentIdempotencyConflictError extends Error {
  override readonly name = "FlowManualClientEnrollmentIdempotencyConflictError";
  readonly code = "FLOW_MANUAL_CLIENT_ENROLLMENT_IDEMPOTENCY_CONFLICT" as const;

  constructor() {
    super("FLOW_MANUAL_CLIENT_ENROLLMENT_IDEMPOTENCY_CONFLICT: idempotency key has another request");
  }
}

export function normalizeManualClientFlowEnrollmentEvent(input: {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly client: FlowManualClientEnrollmentSubject;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}): FlowNormalizedManualClientEventV1 {
  const eventOccurredAtUtc = new Date(input.occurredAt).toISOString();
  if (!Number.isFinite(Date.parse(eventOccurredAtUtc))) {
    throw new TypeError("Manual client Flow enrollment requires a valid occurrence time");
  }
  const occurrenceKey = sha256CanonicalJson({
    schemaVersion: "flow-manual-client-enrollment-occurrence.v1",
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    idempotencyKey: input.idempotencyKey
  });
  const sourceEventId = `manual-client:${occurrenceKey}`;
  const event = {
    schemaVersion: "flow-normalized-event.v1",
    ownerUserId: input.ownerUserId,
    source: "manual",
    sourceEventId,
    eventKind: "manual_client",
    subjectType: "client",
    subjectId: input.client.userId,
    occurrenceKey,
    occurredAtUtc: eventOccurredAtUtc,
    payloadSchemaVersion: 1,
    allowlistedPayload: {
      clientUserId: input.client.userId,
      relationshipId: input.client.relationshipId
    },
    classification: "personal",
    redactionVersion: 1,
    retentionPolicyId: "flows.manual-client.v1",
    dedupeKey: sourceEventId
  } as const;
  const { occurredAtUtc, ...idempotencyIdentity } = event;
  // The client-trigger idempotency key represents the manual occurrence, not request-wall-clock time.
  void occurredAtUtc;
  return {
    ...event,
    canonicalPayloadHash: sha256CanonicalJson(idempotencyIdentity as unknown as CanonicalJson)
  };
}

export function planManualClientFlowEnrollment(input: {
  readonly event: FlowNormalizedManualClientEventV1;
  readonly candidate: FlowManualClientEnrollmentCandidate;
}): FlowManualClientEnrollmentPlan {
  const graphResult = flowGraphV2Schema.safeParse(input.candidate.graph);
  const manifestResult = flowCapabilityManifestV2Schema.safeParse(input.candidate.capabilityManifest);
  if (!graphResult.success || !manifestResult.success) {
    throw invalidPinnedDefinition("the activation epoch does not pin a V2 graph and manifest");
  }
  const graph = graphResult.data;
  const manifest = manifestResult.data;
  const occurredAt = Date.parse(input.event.occurredAtUtc);
  const effectiveFrom = Date.parse(input.candidate.effectiveFrom);
  const effectiveTo = input.candidate.effectiveTo === null ? null : Date.parse(input.candidate.effectiveTo);
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
    !verifyFlowCapabilityManifestForGraph({ graph, capabilityManifest: manifest }).valid ||
    manifest.triggerMatcher.kind !== "manual_client" ||
    manifest.triggerMatcher.configSchemaVersion !== 1 ||
    manifest.triggerMatcher.matcherContractVersion !== 1 ||
    manifest.triggerMatcher.eventSchemaVersion !== input.event.payloadSchemaVersion
  ) {
    throw invalidPinnedDefinition("the activation epoch is inconsistent with the manual client event");
  }

  const trigger = graph.nodes.find((node) => node.kind === "manual_client");
  if (!trigger) throw invalidPinnedDefinition("the pinned graph has no manual client trigger");
  const nextEdges = graph.edges.filter(
    (edge) => edge.sourceNodeId === trigger.id && edge.sourceHandle === "next"
  );
  const nextEdge = nextEdges.length === 1 ? nextEdges[0] : undefined;
  const target = nextEdge ? graph.nodes.find((node) => node.id === nextEdge.targetNodeId) : undefined;
  if (!target || !flowExecutableNodeKindV2Schema.safeParse(target.kind).success) {
    throw invalidPinnedDefinition("the manual client trigger must have one executable next target");
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

function invalidPinnedDefinition(message: string): FlowManualClientEnrollmentIntegrityError {
  return new FlowManualClientEnrollmentIntegrityError(message);
}
