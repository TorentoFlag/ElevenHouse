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
    expect(screen.getByLabelText("Название задачи").getAttribute("name")).toBe("flowTaskTitle");
    expect(screen.getByLabelText("Инструкции").getAttribute("name")).toBe("flowTaskInstructions");
    expect(screen.getByLabelText("Приоритет").getAttribute("name")).toBe("flowTaskPriority");
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

  it("configures event-based start nodes without requiring a manually selected client", () => {
    const startNode: FlowGraphV2["nodes"][number] = {
      id: "first-inbound-message",
      kind: "first_inbound_message",
      displayTitle: "Первое сообщение клиента",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { enrollmentPolicy: "once_per_client" }
    };
    const onChangeNode = vi.fn();
    render(
      <FlowBuilderInspector
        graph={{ ...graph, nodes: [startNode] }}
        selectedNode={startNode}
        locale="ru"
        editable
        onChangeNode={onChangeNode}
      />
    );

    expect(screen.getByLabelText("Событие запуска")).toHaveProperty(
      "value",
      "first_inbound_message"
    );
    expect(
      Array.from((screen.getByLabelText("Событие запуска") as HTMLSelectElement).options).map(
        (option) => option.value
      )
    ).toEqual([
      "booking_confirmed",
      "manual_client",
      "new_lead",
      "free_product_received",
      "product_purchased",
      "first_inbound_message",
      "astro_event",
      "client_lifecycle_changed",
      "schedule_time",
      "review_received",
      "subscription_event"
    ]);
    expect(screen.getByLabelText("Сколько раз запускать")).toHaveProperty(
      "value",
      "once_per_client"
    );
    expect(screen.queryByText("Ручной запуск получает выбранного астрологом клиента.")).toBeNull();

    fireEvent.change(screen.getByLabelText("Сколько раз запускать"), {
      target: { value: "after_previous_terminal" }
    });
    expect(onChangeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "first_inbound_message",
        config: { enrollmentPolicy: "after_previous_terminal" }
      })
    );
  });

  it("switches the start event kind while keeping the same node identity", () => {
    const startNode: FlowGraphV2["nodes"][number] = {
      id: "flow-start",
      kind: "first_inbound_message",
      displayTitle: "Первое сообщение клиента",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { enrollmentPolicy: "once_per_client" }
    };
    const onChangeNode = vi.fn();
    render(
      <FlowBuilderInspector
        graph={{ ...graph, nodes: [startNode] }}
        selectedNode={startNode}
        locale="ru"
        editable
        onChangeNode={onChangeNode}
      />
    );

    fireEvent.change(screen.getByLabelText("Событие запуска"), {
      target: { value: "schedule_time" }
    });
    expect(onChangeNode).toHaveBeenCalledWith({
      id: "flow-start",
      kind: "schedule_time",
      displayTitle: "Дата / расписание",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { scheduleKey: "", enrollmentPolicy: "once_per_client" }
    });
  });

  it("configures fixed client-status change starts with explicit from and to statuses", () => {
    const statusNode: FlowGraphV2["nodes"][number] = {
      id: "client-status",
      kind: "client_lifecycle_changed",
      displayTitle: "Изменение статуса клиента",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        fromStatus: "new",
        toStatus: "active",
        enrollmentPolicy: "once_per_client"
      }
    };
    const onChangeNode = vi.fn();
    render(
      <FlowBuilderInspector
        graph={{ ...graph, nodes: [statusNode] }}
        selectedNode={statusNode}
        locale="ru"
        editable
        onChangeNode={onChangeNode}
      />
    );

    fireEvent.change(screen.getByLabelText("Статус был"), {
      target: { value: "waiting_for_client" }
    });
    expect(onChangeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "client_lifecycle_changed",
        config: expect.objectContaining({ fromStatus: "waiting_for_client", toStatus: "active" })
      })
    );

    fireEvent.change(screen.getByLabelText("Статус стал"), { target: { value: "" } });
    expect(onChangeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "client_lifecycle_changed",
        config: expect.objectContaining({ fromStatus: "new", toStatus: null })
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

  it("uses a Chrome v-flag compatible pattern for terminal result codes", () => {
    const terminalNode: FlowGraphV2["nodes"][number] = {
      id: "completed",
      kind: "completed",
      displayTitle: "Готово",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_ready" }
    };
    render(
      <FlowBuilderInspector
        graph={{ ...graph, nodes: [...graph.nodes, terminalNode] }}
        selectedNode={terminalNode}
        locale="ru"
        editable
        onChangeNode={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Ключ результата").getAttribute("pattern")).toBe(
      "[a-z0-9][a-z0-9_\\-]*"
    );
  });

  it("edits the explicit source and approval fields of a natal AI draft", () => {
    const onChangeNode = vi.fn();
    const chartNode: FlowGraphV2["nodes"][number] = {
      id: "natal-chart",
      kind: "natal_chart_request",
      displayTitle: "Натальная карта",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        interpretationMode: "adult_natal",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      }
    };
    const aiNode: FlowGraphV2["nodes"][number] = {
      id: "natal-ai-draft",
      kind: "natal_chart_ai_draft",
      displayTitle: "Проверить AI-черновик",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        chartRequestNodeId: "natal-chart",
        locale: "ru",
        approvalTitle: "Проверить AI-черновик"
      }
    };
    const graphWithAi: FlowGraphV2 = {
      ...graph,
      nodes: [graph.nodes[0]!, chartNode, aiNode],
      edges: [
        {
          id: "manual-next-to-chart",
          sourceNodeId: "manual-client",
          targetNodeId: "natal-chart",
          sourceHandle: "next"
        },
        {
          id: "chart-next-to-ai",
          sourceNodeId: "natal-chart",
          targetNodeId: "natal-ai-draft",
          sourceHandle: "next"
        }
      ]
    };
    render(
      <FlowBuilderInspector
        graph={graphWithAi}
        selectedNode={aiNode}
        locale="ru"
        editable
        onChangeNode={onChangeNode}
      />
    );

    expect(screen.getByLabelText("Источник натальной карты")).toHaveProperty(
      "value",
      "natal-chart"
    );
    fireEvent.change(screen.getByLabelText("Название решения"), {
      target: { value: "Проверить трактовку" }
    });
    expect(onChangeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "natal_chart_ai_draft",
        config: expect.objectContaining({ approvalTitle: "Проверить трактовку" })
      })
    );
  });
});
