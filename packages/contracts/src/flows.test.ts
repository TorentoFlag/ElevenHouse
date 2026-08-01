import { describe, expect, it } from "vitest";

import {
  flowApprovalModeSchema,
  flowRuntimeEventSchema,
  flowGraphSchema,
  createFlowRequestSchema,
  decideFlowApprovalRequestSchema,
  getFlowRunResponseSchema,
  flowResponseSchema,
  flowRunResponseSchema,
  flowStepRunResponseSchema,
  manualFlowRunResponseSchema,
  cancelFlowRunResponseSchema,
  listFlowApprovalsResponseSchema,
  listFlowsResponseSchema,
  listFlowRunsResponseSchema,
  publishFlowResponseSchema,
  simulateFlowRunRequestSchema,
  updateFlowDraftRequestSchema,
  listFlowTemplatesResponseSchema,
  flowTemplateSchema,
  type FlowGraph,
  type FlowTemplate
} from "./flows";

const baseGraph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "trigger-booking",
      category: "trigger",
      kind: "booking_confirmed",
      title: "Запись подтверждена",
      config: {
        bookingStatus: "confirmed"
      },
      position: {
        x: 80,
        y: 240
      }
    },
    {
      id: "request-data",
      category: "action",
      kind: "request_birth_data",
      title: "Запросить данные рождения",
      approvalMode: "manual_approve",
      config: {
        channel: "internal_chat"
      },
      position: {
        x: 400,
        y: 240
      }
    }
  ],
  edges: [
    {
      id: "edge-1",
      fromNodeId: "trigger-booking",
      toNodeId: "request-data"
    }
  ]
} satisfies FlowGraph;

describe("flow contracts", () => {
  it("parses a safe graph with one trigger and an internal action", () => {
    expect(flowGraphSchema.parse(baseGraph)).toEqual(baseGraph);
  });

  it("rejects duplicate node ids", () => {
    const result = flowGraphSchema.safeParse({
      ...baseGraph,
      nodes: [baseGraph.nodes[0]!, { ...baseGraph.nodes[1]!, id: baseGraph.nodes[0]!.id }]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Flow graph node ids must be unique"
    );
  });

  it("rejects edges that reference missing nodes", () => {
    const result = flowGraphSchema.safeParse({
      ...baseGraph,
      edges: [
        {
          id: "edge-missing",
          fromNodeId: "trigger-booking",
          toNodeId: "missing-action"
        }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Flow graph edges must reference existing nodes"
    );
  });

  it("keeps auto_send explicit as a future policy value", () => {
    expect(flowApprovalModeSchema.parse("auto_send")).toBe("auto_send");
  });

  it("requires a dedupe key for persisted runtime events", () => {
    const result = flowRuntimeEventSchema.safeParse({
      id: "55555555-5555-4555-8555-555555555555",
      ownerUserId: "66666666-6666-4666-8666-666666666666",
      source: "manual",
      sourceEventId: "manual:client-1:flow-1",
      subjectType: "manual",
      subjectId: "manual-subject-1",
      occurredAt: "2026-07-28T10:00:00.000Z",
      payload: {}
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "dedupeKey")).toBe(true);
  });

  it("parses a manual simulation payload", () => {
    const request = {
      source: "manual",
      subjectType: "manual",
      subjectId: "manual-subject-1",
      occurredAt: "2026-07-28T10:00:00.000Z",
      timeZone: "Europe/Moscow",
      payload: {
        note: "Проверить подготовку к консультации"
      }
    };

    expect(simulateFlowRunRequestSchema.parse(request)).toEqual(request);
  });

  it("accepts only explicit approval decisions", () => {
    for (const decision of ["approved", "rejected", "snoozed"]) {
      expect(decideFlowApprovalRequestSchema.parse({ decision })).toEqual({ decision });
    }

    expect(decideFlowApprovalRequestSchema.safeParse({ decision: "pending" }).success).toBe(false);
    expect(decideFlowApprovalRequestSchema.safeParse({ decision: "expired" }).success).toBe(false);
  });

  it("caps runtime list response arrays at one hundred entries", () => {
    const stepRun = {
      id: "77777777-7777-4777-8777-777777777777",
      flowRunId: "88888888-8888-4888-8888-888888888888",
      nodeId: "request-data",
      status: "pending",
      inputSnapshot: {},
      outputSnapshot: null,
      errorCode: null,
      errorMessage: null,
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      completedAt: null
    };
    const run = {
      id: "88888888-8888-4888-8888-888888888888",
      flowId: "99999999-9999-4999-8999-999999999999",
      flowVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerUserId: "66666666-6666-4666-8666-666666666666",
      sourceEventId: "manual-event-1",
      status: "pending",
      snapshot: {
        schemaVersion: "flow-run-snapshot.v1",
        flowVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sourceEventId: "manual:client-1:flow-1",
        subjectType: "manual",
        subjectId: "manual-subject-1",
        occurredAt: "2026-07-28T10:00:00.000Z",
        timeZone: "Europe/Moscow",
        consent: {},
        channels: {},
        payload: {}
      },
      currentNodeId: "request-data",
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      completedAt: null
    };
    const approval = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      flowRunId: run.id,
      stepRunId: stepRun.id,
      status: "pending",
      kind: "message",
      title: "Проверить сообщение",
      preview: "Черновик сообщения для клиента",
      createdAt: "2026-07-28T10:00:00.000Z",
      decidedAt: null
    };

    expect(flowStepRunResponseSchema.parse(stepRun)).toEqual(stepRun);
    expect(flowRunResponseSchema.parse(run)).toEqual(run);
    expect(listFlowRunsResponseSchema.safeParse({ runs: Array(101).fill(run), total: 101 }).success).toBe(
      false
    );
    expect(
      listFlowApprovalsResponseSchema.safeParse({ approvals: Array(101).fill(approval), total: 101 })
        .success
    ).toBe(false);
  });

  it("parses runtime run command response envelopes", () => {
    const run = {
      id: "88888888-8888-4888-8888-888888888888",
      flowId: "99999999-9999-4999-8999-999999999999",
      flowVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerUserId: "66666666-6666-4666-8666-666666666666",
      sourceEventId: "manual:client-1:flow-1",
      status: "suppressed",
      snapshot: {
        schemaVersion: "flow-run-snapshot.v1",
        flowVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sourceEventId: "manual:client-1:flow-1",
        subjectType: "client",
        subjectId: "manual-subject-1",
        occurredAt: "2026-07-28T10:00:00.000Z",
        timeZone: "Europe/Moscow",
        consent: {},
        channels: {},
        payload: {}
      },
      currentNodeId: null,
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      completedAt: "2026-07-28T10:00:00.000Z"
    };

    expect(getFlowRunResponseSchema.parse({ run })).toEqual({ run });
    expect(cancelFlowRunResponseSchema.parse({ run: { ...run, status: "canceled" } })).toEqual({
      run: { ...run, status: "canceled" }
    });
    expect(
      manualFlowRunResponseSchema.parse({
        status: "suppressed",
        event: {
          id: "55555555-5555-4555-8555-555555555555",
          ownerUserId: "66666666-6666-4666-8666-666666666666",
          source: "manual",
          sourceEventId: "manual:client-1:flow-1",
          dedupeKey: "manual:client-1:flow-1",
          subjectType: "client",
          subjectId: "manual-subject-1",
          occurredAt: "2026-07-28T10:00:00.000Z",
          payload: {}
        },
        reason: "QUIET_HOURS_HOLD"
      })
    ).toMatchObject({ status: "suppressed", reason: "QUIET_HOURS_HOLD" });
  });

  it("parses deterministic built-in template payloads", () => {
    const template = {
      key: "session-prep",
      name: "Подготовка к живой сессии",
      description: "Запись -> данные -> карта -> бриф -> напоминание.",
      category: "service_delivery",
      recommendedApprovalMode: "manual_approve",
      requiredCapabilities: ["booking", "birth_data", "chart_engine"],
      graph: baseGraph
    } satisfies FlowTemplate;

    expect(flowTemplateSchema.parse(template)).toEqual(template);
  });

  it("parses first-slice flow API payloads", () => {
    const createRequest = {
      name: "Подготовка к живой сессии",
      approvalMode: "manual_approve",
      graph: baseGraph
    };
    const flowResponse = {
      id: "33333333-3333-4333-8333-333333333333",
      ownerUserId: "44444444-4444-4444-8444-444444444444",
      name: "Подготовка к живой сессии",
      status: "draft",
      approvalMode: "manual_approve",
      draftGraph: baseGraph,
      publishedVersionId: null,
      publishedVersion: null,
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: "2026-07-26T10:00:00.000Z",
      publishedAt: null
    };

    expect(createFlowRequestSchema.parse(createRequest)).toEqual(createRequest);
    expect(updateFlowDraftRequestSchema.parse({ name: "Новая воронка" })).toEqual({
      name: "Новая воронка"
    });
    expect(flowResponseSchema.parse(flowResponse)).toEqual(flowResponse);
    expect(listFlowsResponseSchema.parse({ flows: [flowResponse], total: 1 })).toEqual({
      flows: [flowResponse],
      total: 1
    });
    expect(publishFlowResponseSchema.parse({ flow: flowResponse, version: null })).toEqual({
      flow: flowResponse,
      version: null
    });
    expect(listFlowTemplatesResponseSchema.parse({ templates: [] })).toEqual({ templates: [] });
  });
});
