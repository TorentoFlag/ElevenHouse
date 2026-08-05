import {
  FLOW_GRAPH_V2_MAX_EDGES,
  FLOW_GRAPH_V2_MAX_NODES,
  flowGraphV2Schema,
  type FlowGraphV2,
  type FlowNodeV2
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import { compileFlowGraphV2 } from "./flow-graph-v2-compiler";

const manualNode = node({
  id: "manual",
  kind: "manual_client",
  displayTitle: "Клиент выбран вручную",
  config: {}
});
const bookingNode = node({
  id: "booking",
  kind: "booking_confirmed",
  displayTitle: "Запись подтверждена",
  config: { productIds: ["11111111-1111-4111-8111-111111111111"] }
});
const birthDataNode = node({
  id: "birth-data",
  kind: "birth_data_available",
  displayTitle: "Данные рождения доступны",
  config: { purpose: "service_preparation" }
});
const natalChartNode = node({
  id: "natal-chart",
  kind: "natal_chart_request",
  displayTitle: "Рассчитать натальную карту",
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
});
const workItemNode = node({
  id: "work-item",
  kind: "astrologer_work_item",
  displayTitle: "Подготовить консультацию",
  config: {
    taskKind: "consultation_preparation",
    taskTitle: "Подготовить консультацию",
    priority: "normal"
  }
});
const completedNode = node({
  id: "completed",
  kind: "completed",
  displayTitle: "Подготовка завершена",
  config: { goalKey: "consultation_prepared" }
});
const suppressedNode = node({
  id: "suppressed",
  kind: "suppressed",
  displayTitle: "Остановлено",
  config: { reasonCode: "birth_data_missing" }
});
const failedNode = node({
  id: "failed",
  kind: "failed",
  displayTitle: "Ошибка",
  config: { errorCode: "preparation_failed" }
});

describe("flow graph v2 compiler", () => {
  it("normalizes a valid graph without using array order", () => {
    const graph = graphV2(
      [completedNode, manualNode],
      [edge("manual-to-completed", "manual", "completed", "next")]
    );

    const result = compileFlowGraphV2(graph);

    expect(result).toMatchObject({
      publishable: true,
      issues: [],
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
        },
        requiredCapabilities: [],
        nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }]
      }
    });
  });

  it("canonicalizes semantic sets and produces the same result for graph permutations", () => {
    const productA = "11111111-1111-4111-8111-111111111111";
    const productB = "22222222-2222-4222-8222-222222222222";
    const bookingWithReversedProducts = node({
      id: "booking",
      kind: "booking_confirmed",
      displayTitle: "Запись подтверждена",
      config: { productIds: [productB, productA] }
    });
    const bookingWithSortedProducts = node({
      ...bookingWithReversedProducts,
      config: { productIds: [productA, productB] }
    });
    const graphA = graphV2(
      [suppressedNode, completedNode, birthDataNode, bookingWithReversedProducts],
      [
        edge("data-false", "birth-data", "suppressed", "false"),
        edge("booking-to-data", "booking", "birth-data", "next"),
        edge("data-true", "birth-data", "completed", "true")
      ]
    );
    const graphB = graphV2(
      [bookingWithSortedProducts, birthDataNode, completedNode, suppressedNode],
      [
        edge("booking-to-data", "booking", "birth-data", "next"),
        edge("data-true", "birth-data", "completed", "true"),
        edge("data-false", "birth-data", "suppressed", "false")
      ]
    );

    const compiledA = compileFlowGraphV2(graphA);
    const compiledB = compileFlowGraphV2(graphB);

    expect(compiledA).toEqual(compiledB);
    expect(
      compiledA.normalizedGraph?.nodes.find((candidate) => candidate.kind === "booking_confirmed")
        ?.config.productIds
    ).toEqual([productA, productB]);
    expect(bookingWithReversedProducts.config.productIds).toEqual([productB, productA]);
    expect(graphA.edges.map((candidate) => candidate.id)).toEqual([
      "data-false",
      "booking-to-data",
      "data-true"
    ]);
  });

  it("does not depend on localeCompare for canonical ordering", () => {
    const localeCompare = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
      throw new Error("localeCompare must not define canonical ordering");
    });
    let result: ReturnType<typeof compileFlowGraphV2> | undefined;

    try {
      result = compileFlowGraphV2(
        graphV2(
          [completedNode, manualNode],
          [edge("manual-to-completed", "manual", "completed", "next")]
        )
      );
    } finally {
      localeCompare.mockRestore();
    }

    expect(result?.publishable).toBe(true);
  });

  it("compiles the initial booking preparation spine and its owning-module requirements", () => {
    const graph = graphV2(
      [workItemNode, suppressedNode, bookingNode, completedNode, birthDataNode],
      [
        edge("booking-to-data", "booking", "birth-data", "next"),
        edge("data-available", "birth-data", "work-item", "true"),
        edge("data-missing", "birth-data", "suppressed", "false"),
        edge("work-completed", "work-item", "completed", "success")
      ]
    );

    const result = compileFlowGraphV2(graph);

    expect(result.publishable).toBe(true);
    expect(result.capabilityManifest).toMatchObject({
      schemaVersion: "flow-capability-manifest.v2",
      triggerMatcher: {
        kind: "booking_confirmed",
        configSchemaVersion: 1,
        matcherContractVersion: 1,
        eventSchemaVersion: 1
      }
    });
    expect(result.capabilityManifest?.nodeExecutors).not.toContainEqual(
      expect.objectContaining({ kind: "booking_confirmed" })
    );
    expect(result.capabilityManifest?.requiredCapabilities).toEqual([
      "bookings.events.booking_confirmed",
      "clients.birth_data.read.service_preparation",
      "products.read"
    ]);
    expect(
      result.normalizedGraph?.nodes.find((candidate) => candidate.kind === "astrologer_work_item")
    ).toMatchObject({
      config: {
        duePolicy: { kind: "none" },
        completionRequirements: { resultSummary: "optional" }
      }
    });
  });

  it("allows only a human-gated birth-data recheck loop before a natal calculation", () => {
    const birthDataCollection = node({
      id: "request-birth-data",
      kind: "astrologer_work_item",
      displayTitle: "Запросить данные рождения",
      config: {
        taskKind: "birth_data_collection",
        taskTitle: "Запросить данные рождения",
        priority: "high"
      }
    });
    const graph = graphV2(
      [bookingNode, birthDataNode, birthDataCollection, natalChartNode, completedNode],
      [
        edge("booking-to-data", "booking", "birth-data", "next"),
        edge("data-ready", "birth-data", "natal-chart", "true"),
        edge("data-missing", "birth-data", "request-birth-data", "false"),
        edge("request-recheck", "request-birth-data", "birth-data", "success"),
        edge("chart-completed", "natal-chart", "completed", "next")
      ]
    );

    expect(compileFlowGraphV2(graph)).toMatchObject({
      publishable: true,
      issues: [],
      capabilityManifest: {
        requiredCapabilities: [
          "bookings.events.booking_confirmed",
          "charts.calculate.natal.booking_context",
          "clients.birth_data.read.service_preparation",
          "products.read"
        ],
        nodeExecutors: expect.arrayContaining([
          expect.objectContaining({ kind: "natal_chart_request" })
        ])
      }
    });
  });

  it("rejects a booking-relative work-item deadline behind a manual trigger", () => {
    const bookingRelativeWorkItem = node({
      ...workItemNode,
      config: {
        ...workItemNode.config,
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 }
      }
    });
    const graph = graphV2(
      [manualNode, bookingRelativeWorkItem, completedNode],
      [
        edge("manual-to-work", "manual", "work-item", "next"),
        edge("work-to-completed", "work-item", "completed", "success")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toContain(
      "work_item_due_policy_requires_booking_trigger"
    );
  });

  it("requires approval timeout exactly when bounded expiry is configured", () => {
    const approval = node({
      id: "approval",
      kind: "astrologer_approval",
      displayTitle: "Проверить материал",
      config: {
        approvalKind: "ai_output",
        approvalTitle: "Подтвердить материал",
        expiresAfterMinutes: 1_440
      }
    });
    const graph = graphV2(
      [manualNode, approval, completedNode, suppressedNode, failedNode],
      [
        edge("manual-to-approval", "manual", "approval", "next"),
        edge("approval-approved", "approval", "completed", "approved"),
        edge("approval-rejected", "approval", "suppressed", "rejected")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toContain("missing_required_source_handle");

    const withTimeout = graphV2(graph.nodes, [
      ...graph.edges,
      edge("approval-timeout", "approval", "failed", "timeout")
    ]);
    expect(compileFlowGraphV2(withTimeout).publishable).toBe(true);

    const noExpiryApproval = node({
      id: "approval",
      kind: "astrologer_approval",
      displayTitle: "Проверить материал",
      config: {
        approvalKind: "ai_output",
        approvalTitle: "Подтвердить материал"
      }
    });
    const unexpectedTimeout = graphV2(
      graph.nodes.map((candidate) => (candidate.id === approval.id ? noExpiryApproval : candidate)),
      withTimeout.edges
    );
    expect(issueCodes(compileFlowGraphV2(unexpectedTimeout))).toContain("invalid_source_handle");
  });

  it("rejects a handle that is valid globally but invalid for its source kind", () => {
    const graph = graphV2(
      [manualNode, completedNode],
      [edge("manual-to-completed", "manual", "completed", "success")]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toEqual(
      expect.arrayContaining(["invalid_source_handle", "missing_required_source_handle"])
    );
  });

  it("rejects cycles, including a back-edge into the trigger", () => {
    const graph = graphV2(
      [manualNode, workItemNode, completedNode],
      [
        edge("manual-to-work", "manual", "work-item", "next"),
        edge("work-to-manual", "work-item", "manual", "success")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toEqual(
      expect.arrayContaining(["cycle_detected", "trigger_has_incoming_edge"])
    );
  });

  it("rejects implicit fan-out from a single outcome", () => {
    const graph = graphV2(
      [manualNode, completedNode, failedNode],
      [
        edge("manual-to-completed", "manual", "completed", "next"),
        edge("manual-to-failed", "manual", "failed", "next")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toEqual(
      expect.arrayContaining(["duplicate_source_handle", "implicit_fan_out"])
    );
  });

  it("rejects branch reconvergence as unsupported fan-in", () => {
    const graph = graphV2(
      [manualNode, birthDataNode, completedNode],
      [
        edge("manual-to-data", "manual", "birth-data", "next"),
        edge("data-true", "birth-data", "completed", "true"),
        edge("data-false", "birth-data", "completed", "false")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toContain("implicit_fan_in");
  });

  it("returns order-independent diagnostics for ambiguous duplicate node ids", () => {
    const duplicateTrigger = { ...manualNode, id: "duplicate" };
    const duplicateTerminal = { ...completedNode, id: "duplicate" };
    const duplicateEdge = edge("duplicate-to-failed", "duplicate", "failed", "next");
    const graphA = graphV2([duplicateTrigger, duplicateTerminal, failedNode], [duplicateEdge]);
    const graphB = graphV2([failedNode, duplicateTerminal, duplicateTrigger], [duplicateEdge]);

    const resultA = compileFlowGraphV2(graphA);
    const resultB = compileFlowGraphV2(graphB);

    expect(resultA.publishable).toBe(false);
    expect(resultA.issues).toEqual(resultB.issues);
    expect(issueCodes(resultA)).toContain("duplicate_node_id");
  });

  it("returns order-independent diagnostics for ambiguous duplicate edge ids", () => {
    const edgeToCompleted = edge("duplicate-edge", "manual", "completed", "next");
    const edgeToFailed = edge("duplicate-edge", "manual", "failed", "next");
    const graphA = graphV2(
      [manualNode, completedNode, failedNode],
      [edgeToCompleted, edgeToFailed]
    );
    const graphB = graphV2(
      [failedNode, completedNode, manualNode],
      [edgeToFailed, edgeToCompleted]
    );

    const resultA = compileFlowGraphV2(graphA);
    const resultB = compileFlowGraphV2(graphB);

    expect(resultA.publishable).toBe(false);
    expect(resultA.issues).toEqual(resultB.issues);
    expect(issueCodes(resultA)).toContain("duplicate_edge_id");
  });

  it("rejects multiple triggers and a condition with a missing branch", () => {
    const multipleTriggers = graphV2([manualNode, bookingNode], []);
    expect(issueCodes(compileFlowGraphV2(multipleTriggers))).toContain("invalid_trigger_count");

    const missingFalseBranch = graphV2(
      [manualNode, birthDataNode, completedNode],
      [
        edge("manual-to-data", "manual", "birth-data", "next"),
        edge("data-true", "birth-data", "completed", "true")
      ]
    );
    expect(issueCodes(compileFlowGraphV2(missingFalseBranch))).toContain(
      "missing_required_source_handle"
    );
  });

  it("deduplicates executor requirements across nodes of the same kind", () => {
    const completedSecond = {
      ...completedNode,
      id: "completed-second",
      config: { goalKey: "client_prepared" }
    };
    const birthDataSecond = {
      ...birthDataNode,
      id: "birth-data-second"
    };
    const graph = graphV2(
      [manualNode, birthDataNode, birthDataSecond, completedNode, completedSecond, failedNode],
      [
        edge("manual-to-data", "manual", "birth-data", "next"),
        edge("data-true", "birth-data", "completed", "true"),
        edge("data-false", "birth-data", "birth-data-second", "false"),
        edge("second-data-true", "birth-data-second", "completed-second", "true"),
        edge("second-data-false", "birth-data-second", "failed", "false")
      ]
    );

    const result = compileFlowGraphV2(graph);

    expect(result.publishable).toBe(true);
    expect(
      result.capabilityManifest?.nodeExecutors.filter((executor) => executor.kind === "completed")
    ).toHaveLength(1);
    expect(
      result.capabilityManifest?.nodeExecutors.filter(
        (executor) => executor.kind === "birth_data_available"
      )
    ).toHaveLength(1);
    expect(result.capabilityManifest?.requiredCapabilities).toEqual([
      "clients.birth_data.read.service_preparation"
    ]);
  });

  it("applies caller-supplied publish limits below the structural safety cap", () => {
    const completedSecond = {
      ...completedNode,
      id: "completed-second",
      config: { goalKey: "client_prepared" }
    };
    const graph = graphV2(
      [manualNode, birthDataNode, completedNode, completedSecond],
      [
        edge("manual-to-data", "manual", "birth-data", "next"),
        edge("data-true", "birth-data", "completed", "true"),
        edge("data-false", "birth-data", "completed-second", "false")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph, { maxNodes: 3, maxEdges: 3 }))).toContain(
      "node_limit_exceeded"
    );
    expect(issueCodes(compileFlowGraphV2(graph, { maxNodes: 4, maxEdges: 2 }))).toContain(
      "edge_limit_exceeded"
    );
    expect(compileFlowGraphV2(graph).publishable).toBe(true);

    expect(() =>
      compileFlowGraphV2(graph, {
        maxNodes: FLOW_GRAPH_V2_MAX_NODES + 1,
        maxEdges: FLOW_GRAPH_V2_MAX_EDGES
      })
    ).toThrow(RangeError);
    expect(() =>
      compileFlowGraphV2(graph, {
        maxNodes: FLOW_GRAPH_V2_MAX_NODES,
        maxEdges: FLOW_GRAPH_V2_MAX_EDGES + 1
      })
    ).toThrow(RangeError);
    expect(() => compileFlowGraphV2(graph, { maxNodes: 3.5, maxEdges: 3 })).toThrow(RangeError);
    expect(() => compileFlowGraphV2(graph, { maxNodes: 4, maxEdges: 2.5 })).toThrow(RangeError);
  });

  it("rejects reachable non-terminal dead ends", () => {
    const graph = graphV2(
      [manualNode, workItemNode],
      [edge("manual-to-work", "manual", "work-item", "next")]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toEqual(
      expect.arrayContaining(["missing_required_source_handle", "unterminated_path"])
    );
  });

  it("rejects unreachable nodes and missing edge endpoints", () => {
    const graph = graphV2(
      [manualNode, completedNode, failedNode],
      [
        edge("manual-to-completed", "manual", "completed", "next"),
        edge("missing-source", "missing", "failed", "next")
      ]
    );

    expect(issueCodes(compileFlowGraphV2(graph))).toEqual(
      expect.arrayContaining(["missing_edge_endpoint", "unreachable_node"])
    );
  });

  it("rejects terminal outgoing edges and invalid trigger counts", () => {
    const graph = graphV2(
      [manualNode, completedNode, failedNode],
      [
        edge("manual-to-completed", "manual", "completed", "next"),
        edge("completed-to-failed", "completed", "failed", "next")
      ]
    );
    expect(issueCodes(compileFlowGraphV2(graph))).toEqual(
      expect.arrayContaining(["terminal_has_outgoing_edge", "invalid_source_handle"])
    );

    const withoutTrigger = graphV2([completedNode], []);
    expect(issueCodes(compileFlowGraphV2(withoutTrigger))).toContain("invalid_trigger_count");
  });
});

function graphV2(nodes: FlowNodeV2[], edges: FlowGraphV2["edges"]): FlowGraphV2 {
  return flowGraphV2Schema.parse({ schemaVersion: "flow-graph.v2", nodes, edges });
}

type FlowNodeWithoutExecutorVersions = FlowNodeV2 extends infer Node
  ? Node extends FlowNodeV2
    ? Omit<Node, "configSchemaVersion" | "executorContractVersion">
    : never
  : never;

function node<T extends FlowNodeWithoutExecutorVersions>(
  input: T
): T & { readonly configSchemaVersion: 1; readonly executorContractVersion: 1 } {
  return {
    ...input,
    configSchemaVersion: 1,
    executorContractVersion: 1
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandle: FlowGraphV2["edges"][number]["sourceHandle"]
): FlowGraphV2["edges"][number] {
  return { id, sourceNodeId, targetNodeId, sourceHandle };
}

function issueCodes(result: ReturnType<typeof compileFlowGraphV2>): string[] {
  return result.issues.map((issue) => issue.code);
}
