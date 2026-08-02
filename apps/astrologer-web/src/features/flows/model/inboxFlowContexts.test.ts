import type {
  FlowResponse,
  FlowRunResponse,
  FlowRuntimeAvailability,
  MessagingThread
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildInboxFlowContexts } from "./inboxFlowContexts";

describe("buildInboxFlowContexts", () => {
  it("builds selected-thread flow context from real client-subject runs and flow data", () => {
    expect(
      buildInboxFlowContexts({
        threads: [thread],
        flows: [flow],
        runtimeAvailability: durableRuntime,
        runsByFlowId: {
          [flow.id]: [
            {
              ...run,
              status: "approval_required",
              currentNodeId: "care-message",
              snapshot: {
                ...run.snapshot,
                subjectType: "client",
                subjectId: thread.clientUserId
              }
            }
          ]
        }
      })
    ).toEqual([
      {
        threadId: thread.id,
        flowName: flow.name,
        currentStepTitle: "Черновик заботливого сообщения"
      }
    ]);
  });

  it("does not invent context for unrelated, manual or terminal runs", () => {
    expect(
      buildInboxFlowContexts({
        threads: [thread],
        flows: [flow],
        runtimeAvailability: durableRuntime,
        runsByFlowId: {
          [flow.id]: [
            {
              ...run,
              status: "completed",
              currentNodeId: "care-message",
              snapshot: {
                ...run.snapshot,
                subjectType: "client",
                subjectId: thread.clientUserId
              }
            },
            {
              ...run,
              id: "55555555-5555-4555-8555-555555555555",
              status: "running",
              snapshot: {
                ...run.snapshot,
                subjectType: "manual",
                subjectId: thread.clientUserId
              }
            }
          ]
        }
      })
    ).toEqual([]);
  });

  it("does not project legacy preview runs as live inbox context", () => {
    expect(
      buildInboxFlowContexts({
        threads: [thread],
        flows: [flow],
        runtimeAvailability: definitionOnlyRuntime,
        runsByFlowId: {
          [flow.id]: [
            {
              ...run,
              snapshot: {
                ...run.snapshot,
                subjectType: "client",
                subjectId: thread.clientUserId
              }
            }
          ]
        }
      })
    ).toEqual([]);
  });
});

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

const durableRuntime = {
  mode: "enabled",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

const thread = {
  id: "11111111-1111-4111-8111-111111111111",
  clientUserId: "22222222-2222-4222-8222-222222222222",
  status: "open",
  primaryIdentity: null,
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z"
} satisfies MessagingThread;

const flow = {
  id: "33333333-3333-4333-8333-333333333333",
  ownerUserId: "44444444-4444-4444-8444-444444444444",
  name: "Реактивация спящих",
  status: "active",
  approvalMode: "manual_approve",
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "trigger-astro-event",
        category: "trigger",
        kind: "astro_event",
        title: "Транзит у спящего клиента",
        config: {}
      },
      {
        id: "care-message",
        category: "action",
        kind: "send_message",
        title: "Черновик заботливого сообщения",
        approvalMode: "manual_approve",
        config: {}
      }
    ],
    edges: []
  },
  publishedVersionId: "66666666-6666-4666-8666-666666666666",
  publishedVersion: 1,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: "2026-07-28T08:00:00.000Z"
} satisfies FlowResponse;

const run = {
  id: "77777777-7777-4777-8777-777777777777",
  flowId: flow.id,
  flowVersionId: "66666666-6666-4666-8666-666666666666",
  ownerUserId: flow.ownerUserId,
  sourceEventId: "astro-calendar:event-1",
  status: "running",
  currentNodeId: "trigger-astro-event",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v1",
    flowVersionId: "66666666-6666-4666-8666-666666666666",
    sourceEventId: "astro-calendar:event-1",
    subjectType: "client",
    subjectId: thread.clientUserId,
    occurredAt: "2026-07-28T08:00:00.000Z",
    timeZone: "Europe/Moscow",
    consent: {},
    channels: {},
    payload: {}
  },
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:05:00.000Z",
  completedAt: null
} satisfies FlowRunResponse;
