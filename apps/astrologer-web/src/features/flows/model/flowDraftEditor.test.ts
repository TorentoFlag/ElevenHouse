import type { FlowGraphV2, FlowPresentationV1 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  appendFlowNodeFromPalette,
  flowPaletteNodeGroups,
  getAvailableSourceHandles,
  moveFlowNodePresentation,
  renameFlowNode,
  updateFlowNodeConfig
} from "./flowDraftEditor";

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

const presentation: FlowPresentationV1 = {
  schemaVersion: "flow-presentation.v1",
  nodes: [
    { nodeId: "manual-client", position: { x: 80, y: 120 } },
    { nodeId: "preparation", position: { x: 400, y: 120 } }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

describe("flowDraftEditor V2", () => {
  it("renames only the requested node display title", () => {
    const renamed = renameFlowNode(graph, "preparation", "Проверить данные");

    expect(renamed.nodes.find((node) => node.id === "preparation")?.displayTitle).toBe(
      "Проверить данные"
    );
    expect(graph.nodes.find((node) => node.id === "preparation")?.displayTitle).toBe(
      "Подготовить консультацию"
    );
  });

  it("updates a strict config only when the discriminant matches", () => {
    const updated = updateFlowNodeConfig(graph, "preparation", "astrologer_work_item", {
      taskKind: "consultation_preparation",
      taskTitle: "Собрать вопросы",
      instructions: "Проверить время рождения",
      priority: "high"
    });

    expect(updated.nodes.find((node) => node.id === "preparation")?.config).toEqual({
      taskKind: "consultation_preparation",
      taskTitle: "Собрать вопросы",
      instructions: "Проверить время рождения",
      priority: "high"
    });
    expect(() =>
      updateFlowNodeConfig(graph, "preparation", "completed", { goalKey: "done" })
    ).toThrow("FLOW_NODE_KIND_MISMATCH");
  });

  it("moves a node only in presentation state", () => {
    const moved = moveFlowNodePresentation(presentation, "preparation", { x: 520, y: 240 });

    expect(moved.nodes.find((node) => node.nodeId === "preparation")?.position).toEqual({
      x: 520,
      y: 240
    });
    expect(presentation.nodes.find((node) => node.nodeId === "preparation")?.position).toEqual({
      x: 400,
      y: 120
    });
  });

  it("adds a supported node through an unoccupied semantic handle", () => {
    const updated = appendFlowNodeFromPalette(
      {
        ...graph,
        nodes: [graph.nodes[0]!],
        edges: []
      },
      {
        ...presentation,
        nodes: [presentation.nodes[0]!]
      },
      {
        sourceNodeId: "manual-client",
        sourceHandle: "next",
        paletteNodeId: "astrologer_work_item",
        locale: "ru"
      }
    );

    expect(updated.addedNodeId).toBe("astrologer-work-item");
    expect(updated.graph.nodes.at(-1)).toMatchObject({
      id: "astrologer-work-item",
      kind: "astrologer_work_item",
      displayTitle: "Задача астрологу",
      config: {
        taskKind: "consultation_preparation",
        taskTitle: "Подготовить консультацию",
        priority: "normal"
      }
    });
    expect(updated.graph.edges).toEqual([
      {
        id: "manual-client-next-to-astrologer-work-item",
        sourceNodeId: "manual-client",
        targetNodeId: "astrologer-work-item",
        sourceHandle: "next"
      }
    ]);
    expect(updated.presentation.nodes.at(-1)).toEqual({
      nodeId: "astrologer-work-item",
      position: { x: 400, y: 120 }
    });
  });

  it("exposes missing branch handles and refuses an occupied handle", () => {
    const conditionGraph: FlowGraphV2 = {
      schemaVersion: "flow-graph.v2",
      nodes: [
        graph.nodes[0]!,
        {
          id: "birth-data",
          kind: "birth_data_available",
          displayTitle: "Данные рождения заполнены?",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: { purpose: "service_preparation" }
        },
        {
          id: "done",
          kind: "completed",
          displayTitle: "Завершено",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: { goalKey: "completed" }
        }
      ],
      edges: [
        {
          id: "manual-next-to-birth-data",
          sourceNodeId: "manual-client",
          targetNodeId: "birth-data",
          sourceHandle: "next"
        },
        {
          id: "birth-data-true-to-done",
          sourceNodeId: "birth-data",
          targetNodeId: "done",
          sourceHandle: "true"
        }
      ]
    };

    expect(getAvailableSourceHandles(conditionGraph, "birth-data")).toEqual(["false"]);
    expect(() =>
      appendFlowNodeFromPalette(conditionGraph, presentationFor(conditionGraph), {
        sourceNodeId: "birth-data",
        sourceHandle: "true",
        paletteNodeId: "suppressed",
        locale: "ru"
      })
    ).toThrow("FLOW_SOURCE_HANDLE_OCCUPIED");
  });

  it("keeps the palette limited to executable V2 kinds", () => {
    const paletteKinds = flowPaletteNodeGroups.flatMap((group) =>
      group.nodes.map((node) => node.id)
    );

    expect(paletteKinds).toEqual([
      "birth_data_available",
      "astrologer_work_item",
      "astrologer_approval",
      "completed",
      "suppressed",
      "failed"
    ]);
    expect(paletteKinds).not.toContain("send_message");
    expect(paletteKinds).not.toContain("reply_draft");
  });
});

function presentationFor(graphValue: FlowGraphV2): FlowPresentationV1 {
  return {
    schemaVersion: "flow-presentation.v1",
    nodes: graphValue.nodes.map((node, index) => ({
      nodeId: node.id,
      position: { x: 80 + index * 320, y: 120 }
    })),
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
