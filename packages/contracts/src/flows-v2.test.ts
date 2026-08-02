import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "./flows";
import {
  flowGraphReadSchema,
  flowGraphV2Schema,
  flowPresentationV1Schema,
  type FlowGraphV2
} from "./flows-v2";

const manualClientGraph = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "trigger-manual-client",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        goalKey: "consultation_prepared"
      }
    }
  ],
  edges: [
    {
      id: "trigger-to-completed",
      sourceNodeId: "trigger-manual-client",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
} satisfies FlowGraphV2;

const legacyGraph = flowGraphSchema.parse({
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "trigger-booking",
      category: "trigger",
      kind: "booking_confirmed",
      title: "Запись подтверждена",
      config: {}
    }
  ],
  edges: []
});

describe("flow graph v2 contracts", () => {
  it("parses a minimal strict executable graph", () => {
    expect(flowGraphV2Schema.parse(manualClientGraph)).toEqual(manualClientGraph);
  });

  it("keeps v1 and v2 readable through an explicit read union", () => {
    expect(flowGraphReadSchema.parse(legacyGraph)).toEqual(legacyGraph);
    expect(flowGraphReadSchema.parse(manualClientGraph)).toEqual(manualClientGraph);
  });

  it("rejects presentation state inside the executable graph", () => {
    const result = flowGraphV2Schema.safeParse({
      ...manualClientGraph,
      nodes: [
        {
          ...manualClientGraph.nodes[0],
          position: { x: 80, y: 240 }
        },
        manualClientGraph.nodes[1]
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "nodes.0")).toBe(true);
  });

  it("rejects unknown config fields instead of silently stripping them", () => {
    const result = flowGraphV2Schema.safeParse({
      ...manualClientGraph,
      nodes: [
        {
          ...manualClientGraph.nodes[0],
          config: { guessedClientId: "client-1" }
        },
        manualClientGraph.nodes[1]
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "nodes.0.config")).toBe(
      true
    );
  });

  it("rejects unavailable node kinds and untyped edge outcomes", () => {
    expect(
      flowGraphV2Schema.safeParse({
        ...manualClientGraph,
        nodes: [
          {
            ...manualClientGraph.nodes[0],
            kind: "repeat_until"
          },
          manualClientGraph.nodes[1]
        ]
      }).success
    ).toBe(false);

    expect(
      flowGraphV2Schema.safeParse({
        ...manualClientGraph,
        edges: [{ ...manualClientGraph.edges[0], sourceHandle: "completed" }]
      }).success
    ).toBe(false);
  });

  it("requires explicit versioned configs for every initial node kind", () => {
    const nodes = [
      {
        id: "booking",
        kind: "booking_confirmed",
        displayTitle: "Запись подтверждена",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: ["11111111-1111-4111-8111-111111111111"] }
      },
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Клиент выбран вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "birth-data",
        kind: "birth_data_available",
        displayTitle: "Данные рождения доступны",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { purpose: "service_preparation" }
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
          instructions: "Проверьте исходные данные и ключевые тезисы.",
          priority: "normal"
        }
      },
      {
        id: "approval",
        kind: "astrologer_approval",
        displayTitle: "Проверить материал",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          approvalKind: "ai_output",
          approvalTitle: "Подтвердить материал",
          expiresAfterMinutes: 1_440
        }
      },
      {
        id: "completed",
        kind: "completed",
        displayTitle: "Завершено",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
      },
      {
        id: "suppressed",
        kind: "suppressed",
        displayTitle: "Остановлено политикой",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { reasonCode: "birth_data_access_denied" }
      },
      {
        id: "failed",
        kind: "failed",
        displayTitle: "Ошибка выполнения",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { errorCode: "preparation_failed" }
      }
    ];

    for (const node of nodes) {
      const result = flowGraphV2Schema.safeParse({
        schemaVersion: "flow-graph.v2",
        nodes: [node],
        edges: []
      });
      expect(result.success, node.kind).toBe(true);
    }
  });

  it("rejects duplicate booking product filters", () => {
    const productId = "11111111-1111-4111-8111-111111111111";
    const result = flowGraphV2Schema.safeParse({
      schemaVersion: "flow-graph.v2",
      nodes: [
        {
          id: "booking",
          kind: "booking_confirmed",
          displayTitle: "Запись подтверждена",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: { productIds: [productId, productId] }
        }
      ],
      edges: []
    });

    expect(result.success).toBe(false);
  });
});

describe("flow presentation v1 contracts", () => {
  it("stores canvas state separately from business execution", () => {
    const presentation = {
      schemaVersion: "flow-presentation.v1",
      nodes: [
        {
          nodeId: "trigger-manual-client",
          position: { x: 80, y: 240 },
          collapsed: false
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    };

    expect(flowPresentationV1Schema.parse(presentation)).toEqual(presentation);
    expect(
      flowPresentationV1Schema.safeParse({ ...presentation, selectedNodeId: "completed" }).success
    ).toBe(false);
  });
});
