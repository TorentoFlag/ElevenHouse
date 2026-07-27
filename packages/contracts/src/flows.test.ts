import { describe, expect, it } from "vitest";

import {
  flowApprovalModeSchema,
  flowGraphSchema,
  createFlowRequestSchema,
  flowResponseSchema,
  listFlowsResponseSchema,
  publishFlowResponseSchema,
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
