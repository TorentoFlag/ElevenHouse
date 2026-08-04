import {
  flowGraphSchema,
  flowGraphV2Schema,
  type FlowActivationBlockerCode,
  type FlowGraphV2
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import {
  projectFlowDefinitionValidationV1,
  validateFlowDefinition
} from "./flow-definition-validation";

const runtimeUnavailable = [
  "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
] satisfies FlowActivationBlockerCode[];

const validGraph = flowGraphV2Schema.parse({
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
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
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "manual-to-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
});

const legacyGraph = flowGraphSchema.parse({
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "legacy-trigger",
      category: "trigger",
      kind: "manual",
      title: "Ручной запуск",
      config: {}
    }
  ],
  edges: []
});

describe("flow definition validation", () => {
  it("returns an explicit migration blocker for readable v1 graphs", () => {
    expect(
      validateFlowDefinition({ graph: legacyGraph, activationBlockers: runtimeUnavailable })
    ).toEqual({
      schemaVersion: "flow-definition-validation.v2",
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
    });
  });

  it("separates static v2 publishability from mutable activation readiness", () => {
    const result = validateFlowDefinition({
      graph: validGraph,
      activationBlockers: runtimeUnavailable
    });

    expect(result).toMatchObject({
      schemaVersion: "flow-definition-validation.v2",
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: {
        schemaVersion: "flow-graph.v2",
        nodes: [{ id: "completed" }, { id: "manual" }],
        edges: [{ id: "manual-to-completed" }]
      },
      capabilityManifest: {
        schemaVersion: "flow-capability-manifest.v2",
        executionSemanticsVersion: "flow-interpreter.v1",
        triggerMatcher: {
          kind: "manual_client",
          configSchemaVersion: 1,
          matcherContractVersion: 1,
          eventSchemaVersion: 1
        }
      }
    });
  });

  it("projects the current validation result into the exact legacy transport envelope", () => {
    const current = validateFlowDefinition({
      graph: validGraph,
      activationBlockers: runtimeUnavailable
    });

    expect(projectFlowDefinitionValidationV1(current)).toMatchObject({
      schemaVersion: "flow-definition-validation.v1",
      capabilityManifest: {
        schemaVersion: "flow-capability-manifest.v1",
        nodeExecutors: [
          { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
          { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
        ]
      }
    });
  });

  it("returns compiler issues and no compiled snapshot for invalid v2", () => {
    const invalidGraph: FlowGraphV2 = { ...validGraph, edges: [] };
    const result = validateFlowDefinition({
      graph: invalidGraph,
      activationBlockers: runtimeUnavailable
    });

    expect(result.publishable).toBe(false);
    expect(result.activatable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing_required_source_handle", "unreachable_node"])
    );
    expect(result.activationBlockers).toEqual([
      "FLOW_GRAPH_NOT_PUBLISHABLE",
      "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
    ]);
    expect(result.normalizedGraph).toBeNull();
    expect(result.capabilityManifest).toBeNull();
  });

  it("deduplicates readiness blockers and only reports activatable with no blockers", () => {
    expect(
      validateFlowDefinition({
        graph: validGraph,
        activationBlockers: [...runtimeUnavailable, ...runtimeUnavailable]
      }).activationBlockers
    ).toEqual(runtimeUnavailable);

    expect(validateFlowDefinition({ graph: validGraph, activationBlockers: [] })).toMatchObject({
      publishable: true,
      activatable: true,
      activationBlockers: []
    });
  });

  it("canonicalizes readiness blocker order independently of caller order", () => {
    const result = validateFlowDefinition({
      graph: validGraph,
      activationBlockers: [
        "FLOW_RESOURCE_UNAVAILABLE",
        "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        "FLOW_CAPABILITY_UNAVAILABLE",
        "FLOW_RESOURCE_UNAVAILABLE"
      ]
    });

    expect(result.activationBlockers).toEqual([
      "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
      "FLOW_CAPABILITY_UNAVAILABLE",
      "FLOW_RESOURCE_UNAVAILABLE"
    ]);
  });
});
