import { describe, expect, it } from "vitest";

import { getFlowRunResponseSchema } from "./flows";

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  flowId: "22222222-2222-4222-8222-222222222222",
  flowVersionId: "33333333-3333-4333-8333-333333333333",
  ownerUserId: "44444444-4444-4444-8444-444444444444",
  sourceEventId: "manual:55555555-5555-4555-8555-555555555555",
  status: "completed",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "66666666-6666-4666-8666-666666666666",
      triggerNodeId: "manual-client",
      occurrenceKey: "77777777-7777-4777-8777-777777777777",
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-08-07T10:00:00.000Z",
      enrolledAt: "2026-08-07T10:00:00.000Z"
    },
    subject: {
      type: "client",
      clientUserId: "88888888-8888-4888-8888-888888888888",
      relationshipId: "99999999-9999-4999-8999-999999999999"
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }
  },
  currentNodeId: null,
  createdAt: "2026-08-07T10:00:00.000Z",
  updatedAt: "2026-08-07T10:00:03.000Z",
  completedAt: "2026-08-07T10:00:03.000Z"
} as const;

const runtime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "durable_execution"
} as const;

describe("flow run history contract", () => {
  it("exposes the ordered, redacted durable trace without execution internals", () => {
    expect(
      getFlowRunResponseSchema.parse({
        run,
        trace: [
          {
            sequence: "1",
            eventType: "run_enrolled",
            nodeId: "manual-client",
            summary: { source: "manual" },
            occurredAt: "2026-08-07T10:00:00.000Z"
          },
          {
            sequence: "2",
            eventType: "run_completed",
            nodeId: "completed",
            summary: { terminal: true },
            occurredAt: "2026-08-07T10:00:03.000Z"
          }
        ],
        runtime
      })
    ).toMatchObject({ run, runtime, trace: [{ sequence: "1" }, { sequence: "2" }] });
  });

  it("rejects an untyped trace event and a nonpositive sequence", () => {
    expect(
      getFlowRunResponseSchema.safeParse({
        run,
        trace: [
          {
            sequence: "0",
            eventType: "",
            nodeId: null,
            summary: {},
            occurredAt: "2026-08-07T10:00:00.000Z"
          }
        ],
        runtime
      }).success
    ).toBe(false);
  });
});
