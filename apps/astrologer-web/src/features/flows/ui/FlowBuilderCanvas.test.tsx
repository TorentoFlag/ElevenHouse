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

  it("zooms and fits the transformed graph viewport", () => {
    render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="en"
        editable
        selectedNodeId={null}
        connectionSource={null}
        onSelectNode={vi.fn()}
        onSelectSourceHandle={vi.fn()}
        onMoveNode={vi.fn()}
      />
    );

    mockCanvasRect();
    const viewport = screen.getByTestId("flow-canvas-viewport");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(viewport.style.transform).toContain("scale(");
    expect(viewport.style.transform).not.toBe("translate(0px, 0px) scale(1)");
    expect(screen.getByRole("region", { name: "Flow graph" }).style.backgroundSize).toBe(
      "15.84px 15.84px"
    );

    fireEvent.click(screen.getByRole("button", { name: "Fit graph" }));
    expect(viewport.style.transform).toBe(
      "translate(-46.79245283018872px, 23.509433962264154px) scale(1.5849056603773586)"
    );
  });

  it("moves a draft node only after its pointer interaction completes", () => {
    const onMoveNode = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="en"
        editable
        selectedNodeId="manual-client"
        connectionSource={null}
        onSelectNode={vi.fn()}
        onSelectSourceHandle={vi.fn()}
        onMoveNode={onMoveNode}
      />
    );

    const node = screen.getByRole("button", { name: "Select node: Клиент выбран вручную" }).closest("article");
    expect(node).not.toBeNull();

    fireEvent.pointerDown(node!, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(node!, { pointerId: 1, clientX: 140, clientY: 120 });
    expect(onMoveNode).not.toHaveBeenCalled();
    fireEvent.pointerUp(node!, { pointerId: 1, clientX: 140, clientY: 120 });

    expect(onMoveNode).toHaveBeenCalledWith("manual-client", { x: 120, y: 140 });
  });

  it("does not persist a canceled draft node drag", () => {
    const onMoveNode = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="en"
        editable
        selectedNodeId="manual-client"
        connectionSource={null}
        onSelectNode={vi.fn()}
        onSelectSourceHandle={vi.fn()}
        onMoveNode={onMoveNode}
      />
    );

    const node = screen.getByRole("button", { name: "Select node: Клиент выбран вручную" }).closest("article");
    expect(node).not.toBeNull();

    fireEvent.pointerDown(node!, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(node!, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerCancel(node!, { pointerId: 1, clientX: 140, clientY: 120 });

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("persists an editable pan only when the pointer interaction completes", () => {
    const onChangeViewport = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="en"
        editable
        selectedNodeId={null}
        connectionSource={null}
        onSelectNode={vi.fn()}
        onSelectSourceHandle={vi.fn()}
        onMoveNode={vi.fn()}
        onChangeViewport={onChangeViewport}
      />
    );

    mockCanvasRect();
    const canvas = screen.getByRole("region", { name: "Flow graph" });
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 120 });
    expect(onChangeViewport).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 120 });

    expect(onChangeViewport).toHaveBeenCalledWith({ x: 40, y: 20, zoom: 1 });
  });

  it("keeps published viewport interactions local and never moves published nodes", () => {
    const onChangeViewport = vi.fn();
    const onMoveNode = vi.fn();
    render(
      <FlowBuilderCanvas
        graph={graph}
        presentation={presentation}
        locale="en"
        editable={false}
        selectedNodeId={null}
        connectionSource={null}
        onSelectNode={vi.fn()}
        onSelectSourceHandle={vi.fn()}
        onMoveNode={onMoveNode}
        onChangeViewport={onChangeViewport}
      />
    );

    mockCanvasRect();
    const canvas = screen.getByRole("region", { name: "Flow graph" });
    const node = screen.getByRole("button", { name: "Select node: Клиент выбран вручную" }).closest("article");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerDown(node!, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(node!, { pointerId: 2, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(node!, { pointerId: 2, clientX: 140, clientY: 120 });

    expect(onChangeViewport).not.toHaveBeenCalled();
    expect(onMoveNode).not.toHaveBeenCalled();
  });

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
    expect(
      screen.getByTestId("flow-canvas-viewport").contains(screen.getByLabelText("Связи воронки"))
    ).toBe(false);
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

function mockCanvasRect(): void {
  Object.defineProperty(screen.getByRole("region", { name: "Flow graph" }), "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 700,
      right: 1000,
      width: 1000,
      height: 700,
      toJSON: () => ({})
    })
  });
}
