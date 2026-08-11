import { describe, expect, it } from "vitest";

import { orderFlowGraphNodeKindsForRead } from "./flow-graph-read-order";

describe("orderFlowGraphNodeKindsForRead", () => {
  it("returns the persisted graph in stable execution order rather than node storage order", () => {
    expect(
      orderFlowGraphNodeKindsForRead({
        schemaVersion: "flow-graph.v2",
        nodes: [
          natalChartNode,
          birthDataNode,
          completedNode,
          bookingConfirmedNode
        ],
        edges: [
          {
            id: "10000000-0000-4000-8000-000000000101",
            sourceNodeId: bookingConfirmedNode.id,
            targetNodeId: birthDataNode.id,
            sourceHandle: "next"
          },
          {
            id: "10000000-0000-4000-8000-000000000102",
            sourceNodeId: birthDataNode.id,
            targetNodeId: natalChartNode.id,
            sourceHandle: "next"
          },
          {
            id: "10000000-0000-4000-8000-000000000103",
            sourceNodeId: natalChartNode.id,
            targetNodeId: completedNode.id,
            sourceHandle: "success"
          }
        ]
      })
    ).toEqual(["booking_confirmed", "birth_data_available", "natal_chart_request", "completed"]);
  });

  it("visits each node once when a readiness loop returns to an earlier check", () => {
    expect(
      orderFlowGraphNodeKindsForRead({
        schemaVersion: "flow-graph.v2",
        nodes: [birthDataNode, bookingConfirmedNode, collectBirthDataNode, completedNode],
        edges: [
          {
            id: "10000000-0000-4000-8000-000000000104",
            sourceNodeId: bookingConfirmedNode.id,
            targetNodeId: birthDataNode.id,
            sourceHandle: "next"
          },
          {
            id: "10000000-0000-4000-8000-000000000105",
            sourceNodeId: birthDataNode.id,
            targetNodeId: collectBirthDataNode.id,
            sourceHandle: "false"
          },
          {
            id: "10000000-0000-4000-8000-000000000106",
            sourceNodeId: birthDataNode.id,
            targetNodeId: completedNode.id,
            sourceHandle: "true"
          },
          {
            id: "10000000-0000-4000-8000-000000000107",
            sourceNodeId: collectBirthDataNode.id,
            targetNodeId: birthDataNode.id,
            sourceHandle: "success"
          }
        ]
      })
    ).toEqual(["booking_confirmed", "birth_data_available", "astrologer_work_item", "completed"]);
  });
});

const bookingConfirmedNode = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "booking_confirmed",
  displayTitle: "Запись подтверждена",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  config: { productIds: ["10000000-0000-4000-8000-000000000011"] }
} as const;

const birthDataNode = {
  id: "10000000-0000-4000-8000-000000000002",
  kind: "birth_data_available",
  displayTitle: "Данные рождения",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  config: { purpose: "service_preparation" }
} as const;

const natalChartNode = {
  id: "10000000-0000-4000-8000-000000000003",
  kind: "natal_chart_request",
  displayTitle: "Натальная карта",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  config: {
    interpretationMode: "adult_natal",
    settings: {
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    }
  }
} as const;

const collectBirthDataNode = {
  id: "10000000-0000-4000-8000-000000000005",
  kind: "astrologer_work_item",
  displayTitle: "Собрать данные рождения",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  config: {
    taskKind: "birth_data_collection",
    taskTitle: "Собрать данные рождения",
    priority: "high",
    duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
    completionRequirements: { resultSummary: "optional" }
  }
} as const;

const completedNode = {
  id: "10000000-0000-4000-8000-000000000004",
  kind: "completed",
  displayTitle: "Готово",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  config: { goalKey: "natal_chart_ready" }
} as const;
