// @vitest-environment jsdom

import type { FlowGraph } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilderInspector } from "./FlowBuilderInspector";

const graph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "ai_interpretation",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "AI-интерпретация",
      config: { tone: "calm" }
    }
  ],
  edges: []
} satisfies FlowGraph;

describe("FlowBuilderInspector", () => {
  afterEach(() => cleanup());

  it("keeps node title typing local and commits it on blur", () => {
    const onTitleChange = vi.fn();
    const onCommitTitle = vi.fn();
    render(
      <FlowBuilderInspector
        selectedNode={graph.nodes[0]!}
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
});
