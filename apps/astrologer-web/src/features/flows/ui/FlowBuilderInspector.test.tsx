// @vitest-environment jsdom

import type { FlowGraph } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilderInspector } from "./FlowBuilderInspector";

const graph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "lead_created",
      category: "trigger",
      kind: "lead_created",
      title: "Новый лид",
      config: {}
    },
    {
      id: "ai_interpretation",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "AI-интерпретация",
      config: { tone: "calm" }
    },
    {
      id: "send_summary",
      category: "action",
      kind: "send_message",
      approvalMode: "manual_approve",
      title: "Отправить резюме",
      config: {}
    },
    {
      id: "approval",
      category: "handoff",
      kind: "approval",
      approvalMode: "manual_approve",
      title: "Проверка астролога",
      config: {}
    }
  ],
  edges: [
    { id: "lead-to-ai", fromNodeId: "lead_created", toNodeId: "ai_interpretation" },
    { id: "ai-to-summary", fromNodeId: "ai_interpretation", toNodeId: "send_summary" },
    { id: "ai-to-approval", fromNodeId: "ai_interpretation", toNodeId: "approval" }
  ]
} satisfies FlowGraph;

describe("FlowBuilderInspector", () => {
  afterEach(() => cleanup());

  it("keeps node title typing local and commits it on blur", () => {
    const onTitleChange = vi.fn();
    const onCommitTitle = vi.fn();
    render(
      <FlowBuilderInspector
        graph={graph}
        selectedNode={graph.nodes[1]!}
        onTitleChange={onTitleChange}
        onCommitTitle={onCommitTitle}
        onUpdateConfig={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Название узла").getAttribute("name")).toBe("flowNodeTitle");
    expect(screen.getByLabelText("Конфигурация").getAttribute("name")).toBe("flowNodeConfig");
    fireEvent.change(screen.getByLabelText("Название узла"), { target: { value: "AI-черновик" } });

    expect(onTitleChange).toHaveBeenCalledWith("ai_interpretation", "AI-черновик");
    expect(onCommitTitle).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText("Название узла"));

    expect(onCommitTitle).toHaveBeenCalledWith("ai_interpretation", "AI-черновик");
  });

  it("shows production graph facts for the selected node", () => {
    render(
      <FlowBuilderInspector
        graph={graph}
        selectedNode={graph.nodes[1]!}
        onTitleChange={vi.fn()}
        onCommitTitle={vi.fn()}
        onUpdateConfig={vi.fn()}
      />
    );

    expect(screen.getByText("AI-узел")).toBeTruthy();
    expect(screen.getByText("reply_draft")).toBeTruthy();
    expect(screen.getByText("Требует подтверждения")).toBeTruthy();
    expect(
      screen.getByText((_, element) => element?.textContent === "1 вход · 2 выхода")
    ).toBeTruthy();
  });
});
