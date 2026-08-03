// @vitest-environment jsdom

import type { FlowGraphV2, FlowPresentationV1 } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilderCanvas } from "./FlowBuilderCanvas";

const graph: FlowGraphV2 = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual-client",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "work-item",
      kind: "astrologer_work_item",
      displayTitle: "Подготовить консультацию",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        taskKind: "consultation_preparation",
        taskTitle: "Подготовить консультацию",
        priority: "normal"
      }
    }
  ],
  edges: [
    {
      id: "manual-next-to-work",
      sourceNodeId: "manual-client",
      targetNodeId: "work-item",
      sourceHandle: "next"
    }
  ]
};

const presentation: FlowPresentationV1 = {
  schemaVersion: "flow-presentation.v1",
  nodes: [
    { nodeId: "manual-client", position: { x: 80, y: 120 } },
    { nodeId: "work-item", position: { x: 400, y: 180 } }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

describe("FlowBuilderCanvas", () => {
  afterEach(() => cleanup());

  it("renders semantic V2 edges from graph and positions from presentation", () => {
    const onSelectNode = vi.fn();
    const { container } = render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="ru"
        editable
        selectedNodeId="work-item"
        connectionSource={null}
        onSelectNode={onSelectNode}
        onSelectSourceHandle={vi.fn()}
        onMoveNode={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать узел: Подготовить консультацию" }));

    expect(screen.getByLabelText("Связи воронки").textContent).toContain(
      "Клиент выбран вручную — Далее → Подготовить консультацию"
    );
    expect(onSelectNode).toHaveBeenCalledWith("work-item");
    const node = screen
      .getByRole("button", { name: "Выбрать узел: Подготовить консультацию" })
      .closest("article");
    expect(node?.style.left).toBe("400px");
    expect(node?.style.top).toBe("180px");
    expect(
      container.querySelector('[data-flow-edge-id="manual-next-to-work"]')?.getAttribute("d")
    ).toContain("M 290 176");
  });

  it("selects only an unoccupied semantic output for adding the next node", () => {
    const onSelectSourceHandle = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="ru"
        editable
        selectedNodeId="work-item"
        connectionSource={null}
        onSelectNode={vi.fn()}
        onSelectSourceHandle={onSelectSourceHandle}
        onMoveNode={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Продолжить из Подготовить консультацию: Выполнено" })
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("button", { name: "Связь занята: Клиент выбран вручную, Далее" })
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить из Подготовить консультацию: Выполнено" })
    );
    expect(onSelectSourceHandle).toHaveBeenCalledWith("work-item", "success");
  });
});
