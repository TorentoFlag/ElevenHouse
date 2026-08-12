import type {
  FlowDefinitionSummary,
  FlowRunResponse,
  FlowRuntimeAvailability,
  MessagingThread
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { buildInboxFlowContexts } from "./inboxFlowContexts";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";

const runtime = {
  mode: "enabled",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

const thread = {
  id: "33333333-3333-4333-8333-333333333333",
  clientUserId,
  status: "open",
  primaryIdentity: null,
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  createdAt: "2026-08-05T08:00:00.000Z",
  updatedAt: "2026-08-05T08:00:00.000Z"
} satisfies MessagingThread;

const flow = {
  id: flowId,
  ownerUserId: "44444444-4444-4444-8444-444444444444",
  name: "Подготовка консультации",
  state: "versioned",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  latestPublishedVersionId: "55555555-5555-4555-8555-555555555555",
  latestPublishedVersion: 1,
  createdAt: "2026-08-05T08:00:00.000Z",
  updatedAt: "2026-08-05T08:00:00.000Z",
  publishedAt: "2026-08-05T08:00:00.000Z",
  activeRunCount: 1,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  enrollment: {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "active",
      definitionRevision: 1,
      enrollmentRevision: 1,
      activeVersionId: "55555555-5555-4555-8555-555555555555",
      activeActivationEpochId: "66666666-6666-4666-8666-666666666666",
      activeSince: "2026-08-05T08:00:00.000Z",
      lastPausedAt: null
    }
  }
} satisfies FlowDefinitionSummary;

const run = {
  id: "77777777-7777-4777-8777-777777777777",
  flowId,
  flowVersionId: "55555555-5555-4555-8555-555555555555",
  ownerUserId: flow.ownerUserId,
  sourceEventId: "booking:88888888-8888-4888-8888-888888888888:confirmed",
  status: "waiting",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "66666666-6666-4666-8666-666666666666",
      triggerNodeId: "booking-confirmed",
      occurrenceKey: "88888888-8888-4888-8888-888888888888",
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-08-05T08:00:00.000Z",
      enrolledAt: "2026-08-05T08:00:01.000Z"
    },
    subject: {
      type: "booking",
      bookingId: "88888888-8888-4888-8888-888888888888",
      clientUserId,
      productId: "99999999-9999-4999-8999-999999999999",
      startAt: "2026-08-06T08:00:00.000Z",
      endAt: "2026-08-06T09:00:00.000Z"
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }
  },
  currentNodeId: "birth-data-available",
  createdAt: "2026-08-05T08:00:01.000Z",
  updatedAt: "2026-08-05T08:02:00.000Z",
  completedAt: null
} satisfies FlowRunResponse;

describe("buildInboxFlowContexts", () => {
  it("projects an active V2 booking flow into the matching client thread", () => {
    expect(
      buildInboxFlowContexts({
        threads: [thread],
        flows: [flow],
        runtimeAvailabilityByFlowId: { [flowId]: runtime },
        runsByFlowId: { [flowId]: [run] }
      })
    ).toEqual([
      { threadId: thread.id, flowName: flow.name, currentStepTitle: "Ожидает события" }
    ]);
  });

  it("fails closed when runtime execution is unavailable", () => {
    expect(
      buildInboxFlowContexts({
        threads: [thread],
        flows: [flow],
        runtimeAvailabilityByFlowId: {
          [flowId]: {
            ...runtime,
            mode: "definition_only",
            executionAvailable: false,
            reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
          }
        },
        runsByFlowId: { [flowId]: [run] }
      })
    ).toEqual([]);
  });
});
