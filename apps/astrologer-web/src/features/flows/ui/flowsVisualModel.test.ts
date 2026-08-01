import type { FlowGraph, FlowResponse, FlowTemplate } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildFlowGalleryCard, buildFlowTemplateCard } from "./flowsVisualModel";

const graph: FlowGraph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    { id: "lead", category: "trigger", kind: "lead_created", title: "Новый лид", config: {} },
    {
      id: "reply",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "Черновик ответа",
      config: {}
    }
  ],
  edges: [{ id: "lead-reply", fromNodeId: "lead", toNodeId: "reply" }]
};

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: graph,
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
} satisfies FlowResponse;

const template = {
  key: "consultation",
  name: "Подготовка к консультации",
  description: "Собирает данные до встречи.",
  category: "service_delivery",
  recommendedApprovalMode: "manual_approve",
  requiredCapabilities: ["booking_confirmed"],
  graph
} satisfies FlowTemplate;

describe("flows visual model", () => {
  it("maps a flow without inventing runtime metrics", () => {
    const card = buildFlowGalleryCard(flow);

    expect(card.statusLabel).toBe("Черновик");
    expect(card.metrics).toEqual({
      activeRuns: null,
      waitingApprovals: null,
      completedRuns: null,
      conversionRate: null
    });
    expect(card.automationStateLabel).toBe("Автоматизация не запущена");
    expect(card.pathPreview).toEqual(["Новый лид", "Черновик ответа"]);
  });

  it("maps a template with its graph preview and approval mode", () => {
    expect(buildFlowTemplateCard(template)).toMatchObject({
      key: "consultation",
      title: "Подготовка к консультации",
      approvalModeLabel: "С подтверждением",
      triggerTitle: "Новый лид",
      pathPreview: ["Новый лид", "Черновик ответа"]
    });
  });
});
