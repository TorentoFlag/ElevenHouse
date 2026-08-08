import { describe, expect, it } from "vitest";

import type { FlowCapabilityManifestV2 } from "@elevenhouse/contracts";
import { sha256CanonicalJson } from "../calculations/canonical-json";
import {
  normalizeManualClientFlowEnrollmentEvent,
  planManualClientFlowEnrollment,
  type FlowManualClientEnrollmentCandidate
} from "./flow-manual-client-enrollment";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const clientUserId = "10000000-0000-4000-8000-000000000002";
const relationshipId = "10000000-0000-4000-8000-000000000003";
const flowId = "10000000-0000-4000-8000-000000000004";
const flowVersionId = "10000000-0000-4000-8000-000000000005";
const activationEpochId = "10000000-0000-4000-8000-000000000006";

describe("manual-client Flow enrollment", () => {
  it("normalizes a server-authorized manual client command into immutable, flow-scoped provenance", () => {
    const event = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: { userId: clientUserId, relationshipId },
      idempotencyKey: "manual-flow-run-001",
      occurredAt: "2026-08-06T12:00:00.000Z"
    });

    expect(event).toMatchObject({
      schemaVersion: "flow-normalized-event.v1",
      ownerUserId,
      source: "manual",
      eventKind: "manual_client",
      subjectType: "client",
      subjectId: clientUserId,
      occurrenceKey: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      allowlistedPayload: { clientUserId, relationshipId },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.manual-client.v1"
    });
    expect(event.sourceEventId).toMatch(/^manual-client:sha256:[a-f0-9]{64}$/);
    expect(event.dedupeKey).toMatch(/^manual-client:sha256:[a-f0-9]{64}$/);
    expect(event.sourceEventId).toBe(event.dedupeKey);
  });

  it("keeps the event identity stable for an idempotent retry while binding the payload to its chosen client", () => {
    const first = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: { userId: clientUserId, relationshipId },
      idempotencyKey: "manual-flow-run-identity",
      occurredAt: "2026-08-06T12:00:00.000Z"
    });
    const changedClient = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: {
        userId: "10000000-0000-4000-8000-000000000099",
        relationshipId: "10000000-0000-4000-8000-000000000098"
      },
      idempotencyKey: "manual-flow-run-identity",
      occurredAt: "2026-08-06T12:00:00.000Z"
    });

    expect(changedClient.sourceEventId).toBe(first.sourceEventId);
    expect(changedClient.canonicalPayloadHash).not.toBe(first.canonicalPayloadHash);
  });

  it("does not include the server acceptance instant in a manual command's idempotency identity", () => {
    const first = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: { userId: clientUserId, relationshipId },
      idempotencyKey: "manual-flow-run-retry",
      occurredAt: "2026-08-06T12:00:00.000Z"
    });
    const retry = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: { userId: clientUserId, relationshipId },
      idempotencyKey: "manual-flow-run-retry",
      occurredAt: "2026-08-06T12:00:01.000Z"
    });

    expect(retry.sourceEventId).toBe(first.sourceEventId);
    expect(retry.canonicalPayloadHash).toBe(first.canonicalPayloadHash);
    expect(retry.occurredAtUtc).not.toBe(first.occurredAtUtc);
  });

  it("creates the first executable token plan only for the pinned manual-client trigger", () => {
    const event = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: { userId: clientUserId, relationshipId },
      idempotencyKey: "manual-flow-run-002",
      occurredAt: "2026-08-06T12:00:00.000Z"
    });

    expect(planManualClientFlowEnrollment({ event, candidate: candidate() })).toEqual({
      status: "matched",
      activationEpochId,
      flowId,
      flowVersionId,
      triggerNodeId: "manual-client",
      occurrenceKey: event.occurrenceKey,
      enrollmentPolicyKey: "once_per_occurrence",
      enrollmentPolicyRevision: 1,
      rolloutPolicyRevision: 4,
      requirementKeys: [
        "executor:astrologer_work_item:1:1",
        "executor:completed:1:1",
        "runtime:flow-interpreter.v1",
        "trigger:manual_client:1:1:1"
      ],
      initialToken: {
        nodeId: "prepare",
        nodeKind: "astrologer_work_item",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        executorKey: "astrologer_work_item:1:1"
      }
    });
  });

  it("rejects a booking trigger or a malformed pinned manual graph instead of guessing a trigger", () => {
    const event = normalizeManualClientFlowEnrollmentEvent({
      ownerUserId,
      flowId,
      client: { userId: clientUserId, relationshipId },
      idempotencyKey: "manual-flow-run-003",
      occurredAt: "2026-08-06T12:00:00.000Z"
    });
    const invalid = candidate({
      capabilityManifest: {
        ...(candidate().capabilityManifest as FlowCapabilityManifestV2),
        triggerMatcher: {
          kind: "booking_confirmed",
          configSchemaVersion: 1,
          matcherContractVersion: 1,
          eventSchemaVersion: 1
        }
      }
    });

    expect(() => planManualClientFlowEnrollment({ event, candidate: invalid })).toThrow(
      "FLOW_MANUAL_CLIENT_ENROLLMENT_PINNED_DEFINITION_INVALID"
    );
  });
});

function candidate(
  overrides: Partial<FlowManualClientEnrollmentCandidate> = {}
): FlowManualClientEnrollmentCandidate {
  const graph = {
    schemaVersion: "flow-graph.v2" as const,
    nodes: [
      {
        id: "manual-client",
        kind: "manual_client" as const,
        displayTitle: "Client selected manually",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "prepare",
        kind: "astrologer_work_item" as const,
        displayTitle: "Prepare",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { taskKind: "consultation_preparation" as const, taskTitle: "Prepare", priority: "normal" as const }
      },
      {
        id: "completed",
        kind: "completed" as const,
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "manual_preparation_completed" }
      }
    ],
    edges: [
      {
        id: "manual-to-prepare",
        sourceNodeId: "manual-client",
        sourceHandle: "next" as const,
        targetNodeId: "prepare"
      },
      {
        id: "prepare-to-completed",
        sourceNodeId: "prepare",
        sourceHandle: "success" as const,
        targetNodeId: "completed"
      }
    ]
  };
  const capabilityManifest = {
    schemaVersion: "flow-capability-manifest.v2" as const,
    executionSemanticsVersion: "flow-interpreter.v1" as const,
    triggerMatcher: {
      kind: "manual_client" as const,
      configSchemaVersion: 1,
      matcherContractVersion: 1,
      eventSchemaVersion: 1
    },
    nodeExecutors: [
      { kind: "astrologer_work_item" as const, configSchemaVersion: 1, executorContractVersion: 1 },
      { kind: "completed" as const, configSchemaVersion: 1, executorContractVersion: 1 }
    ],
    requiredCapabilities: []
  };
  return {
    activationEpochId,
    flowId,
    flowVersionId,
    ownerUserId,
    effectiveFrom: "2026-08-06T11:00:00.000Z",
    effectiveTo: null,
    rolloutPolicyRevision: 4,
    manifestDigest: sha256CanonicalJson(capabilityManifest),
    graph,
    capabilityManifest,
    ...overrides
  };
}
