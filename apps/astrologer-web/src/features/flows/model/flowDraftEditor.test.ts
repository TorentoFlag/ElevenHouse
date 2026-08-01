import type { FlowGraph } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { moveFlowNode, renameFlowNode, updateFlowNodeConfig } from "./flowDraftEditor";

const graph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "lead_created",
      category: "trigger",
      kind: "lead_created",
      title: "Новый лид",
      config: {},
      position: { x: 80, y: 120 }
    },
    {
      id: "ai_interpretation",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "AI-интерпретация",
      config: { tone: "calm" },
      position: { x: 360, y: 120 }
    }
  ],
  edges: [
    {
      id: "lead-to-ai",
      fromNodeId: "lead_created",
      toNodeId: "ai_interpretation"
    }
  ]
} satisfies FlowGraph;

describe("flowDraftEditor", () => {
  it("renames the requested graph node", () => {
    const renamed = renameFlowNode(graph, "ai_interpretation", "AI-черновик");

    expect(renamed.nodes.find((node) => node.id === "ai_interpretation")?.title).toBe("AI-черновик");
    expect(graph.nodes.find((node) => node.id === "ai_interpretation")?.title).toBe("AI-интерпретация");
  });

  it("rejects edits to a missing graph node", () => {
    expect(() => renameFlowNode(graph, "missing", "x")).toThrow("FLOW_NODE_NOT_FOUND");
  });

  it("replaces a node configuration without changing the source graph", () => {
    const updated = updateFlowNodeConfig(graph, "ai_interpretation", { tone: "warm" });

    expect(updated.nodes.find((node) => node.id === "ai_interpretation")?.config).toEqual({ tone: "warm" });
    expect(graph.nodes.find((node) => node.id === "ai_interpretation")?.config).toEqual({ tone: "calm" });
  });

  it("moves a node using the FlowGraph position contract", () => {
    const moved = moveFlowNode(graph, "ai_interpretation", { x: 480, y: 200 });

    expect(moved.nodes.find((node) => node.id === "ai_interpretation")?.position).toEqual({ x: 480, y: 200 });
  });
});
