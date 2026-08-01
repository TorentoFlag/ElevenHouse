import type { FlowGraph, FlowResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createFlowFromTemplateRequest,
  flowApprovalModeLabelRu,
  flowCategoryLabelRu,
  flowStatusLabelRu,
  summarizeFlowGraph,
  summarizeFlows
} from "./flowDisplay";

const graph: FlowGraph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    { id: "trigger", category: "trigger", kind: "lead_created", title: "Новый лид", config: {} },
    {
      id: "ai",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "AI-ответ",
      config: {}
    },
    {
      id: "send",
      category: "action",
      kind: "send_message",
      approvalMode: "manual_approve",
      title: "Отправить",
      config: {}
    }
  ],
  edges: [
    { id: "edge-1", fromNodeId: "trigger", toNodeId: "ai" },
    { id: "edge-2", fromNodeId: "ai", toNodeId: "send" }
  ]
};

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Лид-магнит",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: graph,
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
} satisfies FlowResponse;

describe("flow display model", () => {
  it("summarizes graph composition without frontend-owned business execution", () => {
    expect(summarizeFlowGraph(graph)).toEqual({
      nodes: 3,
      edges: 2,
      aiNodes: 1,
      actionNodes: 1,
      triggerTitle: "Новый лид",
      pathPreview: ["Новый лид", "AI-ответ", "Отправить"]
    });
  });

  it("summarizes flow status buckets for the gallery", () => {
    expect(summarizeFlows([flow, { ...flow, id: "33333333-3333-4333-8333-333333333333", status: "published" }])).toEqual({
      total: 2,
      draft: 1,
      published: 1,
      active: 0,
      paused: 0,
      archived: 0
    });
  });

  it("creates a normalized create request from template graph", () => {
    expect(
      createFlowFromTemplateRequest({
        name: "  Подготовка к сессии  ",
        approvalMode: "manual_approve",
        graph
      })
    ).toMatchObject({
      name: "Подготовка к сессии",
      approvalMode: "manual_approve",
      graph
    });
  });

  it("keeps Russian labels for statuses, approval modes and categories", () => {
    expect(flowStatusLabelRu.published).toBe("Опубликована");
    expect(flowApprovalModeLabelRu.manual_approve).toBe("С подтверждением");
    expect(flowCategoryLabelRu.ai).toBe("AI");
  });
});
