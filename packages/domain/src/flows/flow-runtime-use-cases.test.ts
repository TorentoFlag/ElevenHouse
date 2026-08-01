import type {
  FlowApproval,
  FlowGraph,
  FlowResponse,
  FlowRuntimeEvent,
  FlowRunResponse,
  FlowStepRunResponse,
  FlowVersion
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import type { FlowStore } from "./flow-store";
import type { FlowRuntimeStore } from "./flow-runtime-store";
import {
  createManualFlowRun,
  decideFlowApproval,
  dispatchFlowRuntimeEvent,
  listFlowApprovals,
  listFlowRuns,
  simulateFlowRun
} from "./flow-runtime-use-cases";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const runId = "55555555-5555-4555-8555-555555555555";
const stepRunId = "66666666-6666-4666-8666-666666666666";
const approvalId = "77777777-7777-4777-8777-777777777777";
const now = "2026-07-30T10:00:00.000Z";

const graph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "manual-trigger",
      category: "trigger",
      kind: "manual",
      title: "Ручной запуск",
      config: {}
    },
    {
      id: "draft-reply",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "Черновик ответа",
      config: {}
    },
    {
      id: "create-task",
      category: "action",
      kind: "create_task",
      approvalMode: "auto_internal",
      title: "Создать задачу",
      config: {}
    }
  ],
  edges: [
    { id: "edge-1", fromNodeId: "manual-trigger", toNodeId: "draft-reply" },
    { id: "edge-2", fromNodeId: "draft-reply", toNodeId: "create-task" }
  ]
} satisfies FlowGraph;

const flow = {
  id: flowId,
  ownerUserId,
  name: "Подготовка к консультации",
  status: "active",
  approvalMode: "manual_approve",
  draftGraph: graph,
  publishedVersionId: versionId,
  publishedVersion: 1,
  createdAt: now,
  updatedAt: now,
  publishedAt: now
} satisfies FlowResponse;

const version = {
  id: versionId,
  flowId,
  version: 1,
  status: "published",
  approvalMode: "manual_approve",
  graph,
  publishedAt: now
} satisfies FlowVersion;

describe("flow runtime use cases", () => {
  it("simulates a published flow without writing runtime records", async () => {
    const runtimeStore = createRuntimeStore();

    await expect(
      simulateFlowRun({
        flowStore: createFlowStore(),
        runtimeStore,
        ownerUserId,
        flowId,
        request: {
          source: "manual",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now,
          timeZone: "Europe/Moscow",
          payload: { message: "hello" }
        },
        gates: {
          hasOwnerRelationship: true,
          hasChannelConsent: true
        }
      })
    ).resolves.toEqual({
      flowId,
      flowVersionId: versionId,
      plannedSteps: [
        { nodeId: "manual-trigger", status: "planned", reason: null },
        { nodeId: "draft-reply", status: "approval_required", reason: "manual_approve" },
        { nodeId: "create-task", status: "planned", reason: null }
      ],
      warnings: []
    });

    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
    expect(runtimeStore.createRun).not.toHaveBeenCalled();
  });

  it("stores a manual runtime event and creates pending approvals for manual review nodes", async () => {
    const runtimeStore = createRuntimeStore();

    await expect(
      createManualFlowRun({
        flowStore: createFlowStore(),
        runtimeStore,
        ownerUserId,
        flowId,
        dedupeKey: "manual:client-1:flow-1",
        request: {
          source: "manual",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now,
          timeZone: "Europe/Moscow",
          payload: {}
        },
        gates: {
          hasOwnerRelationship: true,
          hasChannelConsent: true
        },
        now
      })
    ).resolves.toMatchObject({
      status: "created",
      run: { id: runId, status: "approval_required" },
      approvals: [{ id: approvalId, status: "pending", kind: "ai_output" }]
    });

    expect(runtimeStore.createRunForEventDedupe).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          ownerUserId,
          source: "manual",
          sourceEventId: "manual:client-1:flow-1",
          dedupeKey: "manual:client-1:flow-1",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now,
          payload: {}
        },
        run: expect.objectContaining({
          flowId,
          flowVersionId: versionId,
          status: "approval_required",
          currentNodeId: "draft-reply",
          stepRuns: expect.arrayContaining([
            expect.objectContaining({ nodeId: "draft-reply", status: "approval_required" }),
            expect.objectContaining({ nodeId: "create-task", status: "completed" })
          ]),
          approvals: [
            expect.objectContaining({
              kind: "ai_output",
              title: "Черновик ответа",
              preview: "Черновик ответа"
            })
          ]
        })
      })
    );
  });

  it("returns the existing run for a duplicate manual event dedupe key", async () => {
    const runtimeStore = createRuntimeStore({
      createRunForEventDedupe: vi.fn(async () => ({
        status: "duplicate" as const,
        event: runtimeEvent,
        run,
        stepRuns: [],
        approvals: []
      }))
    });

    await expect(
      createManualFlowRun({
        flowStore: createFlowStore(),
        runtimeStore,
        ownerUserId,
        flowId,
        dedupeKey: "manual:client-1:flow-1",
        request: {
          source: "manual",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now,
          timeZone: "Europe/Moscow",
          payload: {}
        },
        gates: {
          hasOwnerRelationship: true,
          hasChannelConsent: true
        },
        now
      })
    ).resolves.toEqual({
      status: "duplicate",
      event: runtimeEvent,
      run,
      stepRuns: [],
      approvals: []
    });

    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
    expect(runtimeStore.createRun).not.toHaveBeenCalled();
    expect(runtimeStore.findEventByDedupeKey).toHaveBeenCalledWith({
      ownerUserId,
      dedupeKey: "manual:client-1:flow-1"
    });
    expect(runtimeStore.findRunByEventAndFlow).not.toHaveBeenCalled();
  });

  it("replays an existing allowed decision before evaluating mutable gates", async () => {
    const runtimeStore = createRuntimeStore({
      findEventByDedupeKey: vi.fn(async () => runtimeEvent),
      findRunByEventAndFlow: vi.fn(async () => run)
    });

    await expect(
      createManualFlowRun({
        flowStore: createFlowStore(),
        runtimeStore,
        ownerUserId,
        flowId,
        dedupeKey: "manual:client-1:flow-1",
        request: {
          source: "manual",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now,
          timeZone: "Europe/Moscow",
          payload: {}
        },
        gates: {
          hasOwnerRelationship: true,
          hasChannelConsent: true,
          isQuietHours: true
        },
        now
      })
    ).resolves.toEqual({
      status: "duplicate",
      event: runtimeEvent,
      run,
      stepRuns: [],
      approvals: []
    });

    expect(runtimeStore.createSuppression).not.toHaveBeenCalled();
    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
  });

  it("replays an existing suppressed decision before creating an allowed run", async () => {
    const suppressedRun = { ...run, status: "suppressed" as const, currentNodeId: null };
    const runtimeStore = createRuntimeStore({
      findEventByDedupeKey: vi.fn(async () => runtimeEvent),
      findRunByEventAndFlow: vi.fn(async () => suppressedRun),
      findSuppressionByRun: vi.fn(async () => suppression)
    });

    await expect(
      createManualFlowRun({
        flowStore: createFlowStore(),
        runtimeStore,
        ownerUserId,
        flowId,
        dedupeKey: "manual:client-1:flow-1",
        request: {
          source: "manual",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now,
          timeZone: "Europe/Moscow",
          payload: {}
        },
        gates: {
          hasOwnerRelationship: true,
          hasChannelConsent: true
        },
        now
      })
    ).resolves.toEqual({
      status: "suppressed",
      event: runtimeEvent,
      reason: "QUIET_HOURS_HOLD"
    });

    expect(runtimeStore.createSuppression).not.toHaveBeenCalled();
    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
  });

  it("dispatches a CRM event only to active flows with a matching trigger kind", async () => {
    const matchingFlow = flow;
    const listActiveByTriggerKind = vi.fn(async () => [matchingFlow]);
    const runtimeStore = createRuntimeStore();
    const flowStore = createFlowStore({
      listActiveByTriggerKind,
      findByOwnerAndId: vi.fn(async () => matchingFlow)
    });

    await expect(
      dispatchFlowRuntimeEvent({
        flowStore,
        runtimeStore,
        ownerUserId,
        triggerKind: "lead_created",
        source: "crm",
        sourceEventId: "crm:lead:client-1",
        subjectType: "client",
        subjectId: "client-1",
        occurredAt: now,
        timeZone: "Europe/Moscow",
        payload: { source: "crm" },
        gates: {
          hasOwnerRelationship: true
        },
        now
      })
    ).resolves.toMatchObject({
      total: 1,
      results: [
        {
          flowId,
          status: "created",
          run: { id: runId, status: "approval_required" }
        }
      ]
    });

    expect(listActiveByTriggerKind).toHaveBeenCalledWith({
      ownerUserId,
      triggerKind: "lead_created"
    });
    expect(runtimeStore.createRunForEventDedupe).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          source: "crm",
          sourceEventId: `crm:lead:client-1:${flowId}`,
          dedupeKey: `crm:lead:client-1:${flowId}`,
          subjectType: "client",
          subjectId: "client-1"
        })
      })
    );
  });

  it("delegates run, approval list and approval decisions through owner-scoped store methods", async () => {
    const runtimeStore = createRuntimeStore();

    await expect(
      listFlowRuns({
        runtimeStore,
        ownerUserId,
        flowId,
        query: { status: "all", limit: 20, offset: 0 }
      })
    ).resolves.toEqual({ runs: [run], total: 1 });
    await expect(
      listFlowApprovals({
        runtimeStore,
        ownerUserId,
        query: { status: "pending", limit: 20, offset: 0 }
      })
    ).resolves.toEqual({ approvals: [approval], total: 1 });
    await expect(
      decideFlowApproval({
        runtimeStore,
        ownerUserId,
        approvalId,
        decidedByUserId: ownerUserId,
        request: { decision: "approved", note: "ok" },
        now
      })
    ).resolves.toEqual(approval);

    expect(runtimeStore.listRuns).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      status: "all",
      limit: 20,
      offset: 0
    });
    expect(runtimeStore.listApprovals).toHaveBeenCalledWith({
      ownerUserId,
      status: "pending",
      limit: 20,
      offset: 0
    });
    expect(runtimeStore.decideApproval).toHaveBeenCalledWith({
      ownerUserId,
      approvalId,
      decidedByUserId: ownerUserId,
      decision: "approved",
      note: "ok",
      now
    });
  });
});

function createFlowStore(overrides: Partial<FlowStore> = {}): FlowStore {
  return {
    createDraft: vi.fn(),
    listByOwner: vi.fn(),
    findByOwnerAndId: vi.fn(async () => flow),
    findPublishedVersionByFlowId: vi.fn(async () => version),
    listActiveByTriggerKind: vi.fn(async () => [flow]),
    transitionStatus: vi.fn(),
    updateDraft: vi.fn(),
    publishDraft: vi.fn(),
    ...overrides
  };
}

function createRuntimeStore(overrides: Partial<FlowRuntimeStore> = {}): FlowRuntimeStore {
  return {
    createEvent: vi.fn(async () => runtimeEvent),
    findEventByDedupeKey: vi.fn(async () => null),
    findRunByEventAndFlow: vi.fn(async () => null),
    findRunById: vi.fn(async () => run),
    cancelRun: vi.fn(async () => ({ ...run, status: "canceled" as const, currentNodeId: null, completedAt: now })),
    createRun: vi.fn(async () => ({ run, stepRuns: [stepRun], approvals: [approval] })),
    createRunForEventDedupe: vi.fn(async () => ({
      status: "created" as const,
      event: runtimeEvent,
      run,
      stepRuns: [stepRun],
      approvals: [approval]
    })),
    createSuppression: vi.fn(),
    findSuppressionByRun: vi.fn(async () => null),
    createDeliveryAttempt: vi.fn(),
    listRuns: vi.fn(async () => ({ runs: [run], total: 1 })),
    listApprovals: vi.fn(async () => ({ approvals: [approval], total: 1 })),
    decideApproval: vi.fn(async () => approval),
    ...overrides
  };
}

const runtimeEvent = {
  id: eventId,
  ownerUserId,
  source: "manual",
  sourceEventId: "manual:client-1:flow-1",
  dedupeKey: "manual:client-1:flow-1",
  subjectType: "client",
  subjectId: "client-1",
  occurredAt: now,
  payload: {}
} satisfies FlowRuntimeEvent;

const run = {
  id: runId,
  flowId,
  flowVersionId: versionId,
  ownerUserId,
  sourceEventId: "manual:client-1:flow-1",
  status: "approval_required",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v1",
    flowVersionId: versionId,
    sourceEventId: "manual:client-1:flow-1",
    subjectType: "client",
    subjectId: "client-1",
    occurredAt: now,
    timeZone: "Europe/Moscow",
    consent: {},
    channels: {},
    payload: {}
  },
  currentNodeId: "draft-reply",
  createdAt: now,
  updatedAt: now,
  completedAt: null
} satisfies FlowRunResponse;

const stepRun = {
  id: stepRunId,
  flowRunId: runId,
  nodeId: "draft-reply",
  status: "approval_required",
  inputSnapshot: {},
  outputSnapshot: null,
  errorCode: null,
  errorMessage: null,
  createdAt: now,
  updatedAt: now,
  completedAt: null
} satisfies FlowStepRunResponse;

const suppression = {
  id: "88888888-8888-4888-8888-888888888888",
  ownerUserId,
  flowId,
  runtimeEventId: eventId,
  flowRunId: runId,
  reason: "QUIET_HOURS_HOLD",
  details: { flowId },
  createdAt: now
} as const;

const approval = {
  id: approvalId,
  flowRunId: runId,
  stepRunId,
  status: "pending",
  kind: "ai_output",
  title: "Черновик ответа",
  preview: "Черновик ответа",
  createdAt: now,
  decidedAt: null
} satisfies FlowApproval;
