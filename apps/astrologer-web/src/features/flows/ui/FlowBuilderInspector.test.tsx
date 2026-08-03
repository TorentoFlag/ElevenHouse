// @vitest-environment jsdom

import type { FlowGraphV2 } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilderInspector } from "./FlowBuilderInspector";

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
      id: "preparation",
      kind: "astrologer_work_item",
      displayTitle: "Подготовить консультацию",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        taskKind: "consultation_preparation",
        taskTitle: "Подготовить консультацию",
        instructions: "Проверить данные",
        priority: "normal"
      }
    }
  ],
  edges: [
    {
      id: "manual-next-to-preparation",
      sourceNodeId: "manual-client",
      targetNodeId: "preparation",
      sourceHandle: "next"
    }
  ]
};

describe("FlowBuilderInspector", () => {
  afterEach(() => cleanup());

  it("edits a V2 display title and kind-specific work-item fields without raw JSON", () => {
    const onChangeNode = vi.fn();
    render(
      <FlowBuilderInspector
        graph={graph}
        selectedNode={graph.nodes[1]!}
        locale="ru"
        editable
        onChangeNode={onChangeNode}
      />
    );

    expect(screen.queryByLabelText("Конфигурация")).toBeNull();
    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Собрать материалы" }
    });
    expect(onChangeNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "preparation", displayTitle: "Собрать материалы" })
    );

    fireEvent.change(screen.getByLabelText("Приоритет"), { target: { value: "high" } });
    expect(onChangeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "astrologer_work_item",
        config: expect.objectContaining({ priority: "high" })
      })
    );
  });

  it("shows immutable contract facts and disables fields for a published version", () => {
    render(
      <FlowBuilderInspector
        graph={graph}
        selectedNode={graph.nodes[1]!}
        locale="en"
        editable={false}
        onChangeNode={vi.fn()}
      />
    );

    expect(screen.getByText("Astrologer task")).toBeTruthy();
    expect(screen.getByText("astrologer_work_item")).toBeTruthy();
    expect(
      screen.getByText((_, element) => element?.textContent === "1 input · 0 output")
    ).toBeTruthy();
    expect(screen.getByLabelText("Node title")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Priority")).toHaveProperty("disabled", true);
  });
});
