import { describe, expect, it } from "vitest";

import { flowRunSnapshotV2Schema } from "./flows";

describe("Flow run snapshot contract", () => {
  it("accepts a manual-client enrollment snapshot without invented booking fields", () => {
    const snapshot = {
      schemaVersion: "flow-run-snapshot.v2",
      enrollment: {
        activationEpochId: "10000000-0000-4000-8000-000000000001",
        triggerNodeId: "manual-client",
        occurrenceKey: "sha256:1234567890123456789012345678901234567890123456789012345678901234",
        policyKey: "once_per_occurrence",
        policyRevision: 1,
        rolloutPolicyRevision: 4,
        eventOccurredAt: "2026-08-06T12:00:00.000Z",
        enrolledAt: "2026-08-06T12:00:01.000Z"
      },
      subject: {
        type: "client",
        clientUserId: "10000000-0000-4000-8000-000000000002",
        relationshipId: "10000000-0000-4000-8000-000000000003"
      },
      executionAuthority: {
        basis: "current_entitlement",
        referenceId: "10000000-0000-4000-8000-000000000004"
      }
    } as const;

    expect(flowRunSnapshotV2Schema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts client-event enrollment policy keys in V2 run snapshots", () => {
    const snapshot = {
      schemaVersion: "flow-run-snapshot.v2",
      enrollment: {
        activationEpochId: "10000000-0000-4000-8000-000000000001",
        triggerNodeId: "first-message",
        occurrenceKey: "10000000-0000-4000-8000-000000000002",
        policyKey: "once_per_client",
        policyRevision: 1,
        rolloutPolicyRevision: 4,
        eventOccurredAt: "2026-08-06T12:00:00.000Z",
        enrolledAt: "2026-08-06T12:00:01.000Z"
      },
      subject: {
        type: "client",
        clientUserId: "10000000-0000-4000-8000-000000000002",
        relationshipId: "10000000-0000-4000-8000-000000000003"
      },
      executionAuthority: {
        basis: "current_entitlement",
        referenceId: "10000000-0000-4000-8000-000000000004"
      }
    } as const;

    expect(flowRunSnapshotV2Schema.parse(snapshot)).toEqual(snapshot);
  });
});
