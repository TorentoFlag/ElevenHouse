import {
  flowCapabilityManifestV2Schema,
  flowExecutableNodeKindV2Schema,
  flowGraphV2Schema,
  type FlowEnrollmentPolicyKey,
  type FlowExecutableNodeKindV2
} from "@elevenhouse/contracts";

import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { verifyFlowCapabilityManifestForGraph } from "./flow-capability-manifest-integrity";
import { matchFlowClientTriggerEvent, type FlowClientTriggerEvent } from "./flow-event-enrollment";
import type { FlowClientEventEnrollmentRequestedPayloadV1 } from "./flow-runtime-outbox";
import { createFlowRuntimeRequirementKeys } from "./flow-runtime-control";

export type FlowNormalizedClientEventV1 = {
  readonly schemaVersion: "flow-normalized-event.v1";
  readonly ownerUserId: string;
  readonly relationshipId: string;
  readonly source: "finance" | "messaging" | "clients";
  readonly sourceEventId: string;
  readonly event: FlowClientTriggerEvent;
  readonly occurrenceKey: string;
  readonly occurredAtUtc: string;
  readonly payloadSchemaVersion: 1;
  readonly allowlistedPayload: Record<string, string | null>;
  readonly classification: "personal";
  readonly redactionVersion: 1;
  readonly retentionPolicyId: string;
  readonly dedupeKey: string;
  readonly canonicalPayloadHash: `sha256:${string}`;
};

export type FlowClientEventEnrollmentCandidate = {
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

export type FlowClientEventEnrollmentPlan =
  | { readonly status: "not_matched"; readonly reason: "trigger_kind" | "product_filter" | "status_filter" }
  | {
      readonly status: "matched";
      readonly activationEpochId: string;
      readonly flowId: string;
      readonly flowVersionId: string;
      readonly triggerNodeId: string;
      readonly occurrenceKey: string;
      readonly enrollmentPolicyKey: FlowEnrollmentPolicyKey;
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

export type FlowClientEventEnrollmentPersistedRun = {
  readonly runId: string;
  readonly tokenId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly activationEpochId: string;
};

export type FlowClientEventEnrollmentResult = {
  readonly status: "enrolled" | "no_match" | "suppressed";
  readonly replayed: boolean;
  readonly eventId: string;
  readonly runs: readonly FlowClientEventEnrollmentPersistedRun[];
};

export type FlowClientEventEnrollmentStore = {
  readonly enrollClientEvent: (input: {
    readonly request: FlowClientEventEnrollmentRequestedPayloadV1;
  }) => Promise<FlowClientEventEnrollmentResult>;
};

export class FlowClientEventEnrollmentDeferredError extends Error {
  override readonly name = "FlowClientEventEnrollmentDeferredError";
}

export class FlowClientEventEnrollmentIntegrityError extends Error {
  override readonly name = "FlowClientEventEnrollmentIntegrityError";

  constructor(
    readonly code:
      | "FLOW_CLIENT_EVENT_ENROLLMENT_PAYLOAD_INVALID"
      | "FLOW_CLIENT_EVENT_ENROLLMENT_AGGREGATE_MISMATCH"
      | "FLOW_CLIENT_EVENT_ENROLLMENT_PROVENANCE_INVALID"
      | "FLOW_CLIENT_EVENT_ENROLLMENT_PROVENANCE_CONFLICT"
      | "FLOW_CLIENT_EVENT_ENROLLMENT_AUTHORITY_INVALID"
      | "FLOW_CLIENT_EVENT_ENROLLMENT_PINNED_DEFINITION_INVALID",
    message: string
  ) {
    super(message);
  }
}

export class FlowClientEventEnrollmentPlanIntegrityError extends Error {
  override readonly name = "FlowClientEventEnrollmentPlanIntegrityError";
}

export function normalizeFlowClientEvent(input: Omit<FlowNormalizedClientEventV1, "schemaVersion" | "canonicalPayloadHash">): FlowNormalizedClientEventV1 {
  const normalized = { schemaVersion: "flow-normalized-event.v1", ...input } as const;
  if (!Number.isFinite(Date.parse(normalized.occurredAtUtc))) {
    throw new FlowClientEventEnrollmentPlanIntegrityError("client trigger event time is invalid");
  }
  return {
    ...normalized,
    canonicalPayloadHash: sha256CanonicalJson(normalized as unknown as CanonicalJson)
  };
}

export function planFlowClientEventEnrollment(input: {
  readonly event: FlowNormalizedClientEventV1;
  readonly candidate: FlowClientEventEnrollmentCandidate;
}): FlowClientEventEnrollmentPlan {
  const graphResult = flowGraphV2Schema.safeParse(input.candidate.graph);
  const manifestResult = flowCapabilityManifestV2Schema.safeParse(input.candidate.capabilityManifest);
  if (!graphResult.success || !manifestResult.success) return invalid("candidate has no valid V2 graph/manifest");
  const graph = graphResult.data;
  const manifest = manifestResult.data;
  const occurredAt = Date.parse(input.event.occurredAtUtc);
  const effectiveFrom = Date.parse(input.candidate.effectiveFrom);
  const effectiveTo = input.candidate.effectiveTo === null ? null : Date.parse(input.candidate.effectiveTo);
  if (
    input.candidate.ownerUserId !== input.event.ownerUserId ||
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(effectiveFrom) ||
    (effectiveTo !== null && (!Number.isFinite(effectiveTo) || effectiveTo <= effectiveFrom)) ||
    occurredAt < effectiveFrom ||
    (effectiveTo !== null && occurredAt >= effectiveTo) ||
    sha256CanonicalJson(manifest as unknown as CanonicalJson) !== input.candidate.manifestDigest ||
    !verifyFlowCapabilityManifestForGraph({ graph, capabilityManifest: manifest })
      .valid ||
    manifest.triggerMatcher.kind !== input.event.event.eventKind
  ) {
    return invalid("candidate is inconsistent with the client event");
  }
  const match = matchFlowClientTriggerEvent({ graph, event: input.event.event });
  if (match.status === "not_matched") return match;
  const next = graph.edges.filter(
    (edge) => edge.sourceNodeId === match.triggerNodeId && edge.sourceHandle === "next"
  );
  const target = next.length === 1 ? graph.nodes.find((node) => node.id === next[0]?.targetNodeId) : undefined;
  if (!target || !flowExecutableNodeKindV2Schema.safeParse(target.kind).success) {
    return invalid("client trigger must have one executable next target");
  }
  const nodeKind = target.kind as FlowExecutableNodeKindV2;
  return {
    status: "matched",
    activationEpochId: input.candidate.activationEpochId,
    flowId: input.candidate.flowId,
    flowVersionId: input.candidate.flowVersionId,
    triggerNodeId: match.triggerNodeId,
    occurrenceKey: enrollmentOccurrenceKey(match.enrollmentPolicy, input.event),
    enrollmentPolicyKey: match.enrollmentPolicy,
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

function enrollmentOccurrenceKey(policy: FlowEnrollmentPolicyKey, event: FlowNormalizedClientEventV1): string {
  return policy === "once_per_client" ? event.event.clientUserId : event.occurrenceKey;
}

function invalid(message: string): never {
  throw new FlowClientEventEnrollmentPlanIntegrityError(message);
}
