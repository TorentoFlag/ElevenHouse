// @vitest-environment jsdom

import type { FlowGraph } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilderCanvas } from "./FlowBuilderCanvas";

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
      config: {},
      position: { x: 360, y: 180 }
    }
  ],
  edges: [{ id: "lead-to-ai", fromNodeId: "lead_created", toNodeId: "ai_interpretation" }]
} satisfies FlowGraph;

describe("FlowBuilderCanvas", () => {
  afterEach(() => cleanup());

  it("renders contract edges and selects a graph node", () => {
    const onSelectNode = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        selectedNodeId="ai_interpretation"
        onSelectNode={onSelectNode}
        onMoveNode={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать узел: AI-интерпретация" }));

    expect(screen.getByLabelText("Связи воронки").textContent).toContain("Новый лид -> AI-интерпретация");
    expect(onSelectNode).toHaveBeenCalledWith("ai_interpretation");
    expect(screen.getByRole("button", { name: "Выбрать узел: AI-интерпретация" }).style.left).toBe("360px");
    expect(screen.getByRole("button", { name: "Выбрать узел: AI-интерпретация" }).style.top).toBe("180px");
  });

  it("moves the selected node with an explicit position action", () => {
    const onMoveNode = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        selectedNodeId="ai_interpretation"
        onSelectNode={vi.fn()}
        onMoveNode={onMoveNode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Сместить вправо: AI-интерпретация" }));

    expect(onMoveNode).toHaveBeenCalledWith("ai_interpretation", { x: 400, y: 180 });
  });
});
