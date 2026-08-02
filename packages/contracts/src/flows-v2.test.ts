import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "./flows";
import {
  flowCapabilityManifestV1Schema,
  flowGraphReadSchema,
  flowGraphV2Schema,
  flowPresentationV1Schema,
  validateFlowDefinitionRequestSchema,
  validateFlowDefinitionResponseSchema,
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

describe("flow definition validation contracts", () => {
  const capabilityManifest = {
    schemaVersion: "flow-capability-manifest.v1",
    executionSemanticsVersion: "flow-interpreter.v1",
    nodeExecutors: [
      { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
      { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
    ],
    requiredCapabilities: []
  } as const;

  it("accepts either readable graph version as validation input", () => {
    expect(validateFlowDefinitionRequestSchema.parse({ graph: legacyGraph })).toEqual({
      graph: legacyGraph
    });
    expect(validateFlowDefinitionRequestSchema.parse({ graph: manualClientGraph })).toEqual({
      graph: manualClientGraph
    });
  });

  it("parses a publishable v2 result that remains activation-blocked", () => {
    const response = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: manualClientGraph,
      capabilityManifest
    } as const;

    expect(flowCapabilityManifestV1Schema.parse(capabilityManifest)).toEqual(capabilityManifest);
    expect(validateFlowDefinitionResponseSchema.parse(response)).toEqual(response);
  });

  it("parses an explicit v1 migration blocker", () => {
    const response = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v1",
      publishable: false,
      activatable: false,
      issues: [
        {
          code: "migration_required",
          severity: "error",
          blocking: true,
          path: "schemaVersion",
          message: "Flow graph v1 requires explicit migration before publishing."
        }
      ],
      activationBlockers: ["FLOW_GRAPH_MIGRATION_REQUIRED", "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: null,
      capabilityManifest: null
    } as const;

    expect(validateFlowDefinitionResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects contradictory publish and activation claims", () => {
    const missingCompiledSnapshot = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: null,
      capabilityManifest: null
    };
    expect(validateFlowDefinitionResponseSchema.safeParse(missingCompiledSnapshot).success).toBe(
      false
    );

    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...missingCompiledSnapshot,
        normalizedGraph: manualClientGraph,
        capabilityManifest,
        activatable: true
      }).success
    ).toBe(false);
  });

  it("rejects partial compile artifacts and version-specific blocker contradictions", () => {
    const compilerIssue = {
      code: "missing_required_source_handle",
      severity: "error",
      blocking: true,
      path: "nodes.manual",
      message: "Manual trigger requires a next edge."
    } as const;
    const migrationIssue = {
      code: "migration_required",
      severity: "error",
      blocking: true,
      path: "schemaVersion",
      message: "Migration required."
    } as const;
    const invalidV2 = {
      schemaVersion: "flow-definition-validation.v1",
      graphSchemaVersion: "flow-graph.v2",
      publishable: false,
      activatable: false,
      issues: [compilerIssue],
      activationBlockers: ["FLOW_GRAPH_NOT_PUBLISHABLE"],
      normalizedGraph: null,
      capabilityManifest: null
    } as const;

    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...invalidV2,
        normalizedGraph: manualClientGraph
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...invalidV2,
        activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"]
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...invalidV2,
        issues: [migrationIssue],
        activationBlockers: ["FLOW_GRAPH_MIGRATION_REQUIRED"]
      }).success
    ).toBe(false);

    const validV1 = {
      ...invalidV2,
      graphSchemaVersion: "flow-graph.v1",
      issues: [migrationIssue],
      activationBlockers: ["FLOW_GRAPH_MIGRATION_REQUIRED"]
    } as const;
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...validV1,
        activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"]
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...validV1,
        issues: [compilerIssue]
      }).success
    ).toBe(false);
    expect(
      validateFlowDefinitionResponseSchema.safeParse({
        ...validV1,
        capabilityManifest
      }).success
    ).toBe(false);
  });
});
