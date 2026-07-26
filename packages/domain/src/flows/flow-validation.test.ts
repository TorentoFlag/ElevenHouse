import type { FlowGraph } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { assertFlowGraphPublishable, validateFlowGraph } from "./flow-validation";

const triggerNode = {
  id: "trigger-booking",
  category: "trigger",
  kind: "booking_confirmed",
  title: "Запись подтверждена",
  config: {}
} as const;

const actionNode = {
  id: "create-task",
  category: "action",
  kind: "create_task",
  title: "Создать задачу",
  approvalMode: "auto_internal",
  config: {}
} as const;

const publishableGraph = {
  schemaVersion: "flow-graph.v1",
  nodes: [triggerNode, actionNode],
  edges: [{ id: "edge-1", fromNodeId: "trigger-booking", toNodeId: "create-task" }]
} satisfies FlowGraph;

describe("flow graph validation", () => {
  it("marks a graph with exactly one trigger and reachable nodes as publishable", () => {
    expect(validateFlowGraph(publishableGraph)).toEqual({
      publishable: true,
      issues: []
    });
    expect(assertFlowGraphPublishable(publishableGraph)).toEqual(publishableGraph);
  });

  it("returns a deterministic blocking issue for duplicate node ids", () => {
    const result = validateFlowGraph({
      ...publishableGraph,
      nodes: [triggerNode, { ...actionNode, id: triggerNode.id }]
    } as FlowGraph);

    expect(result.publishable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "duplicate_node_id",
      severity: "error",
      blocking: true,
      path: "nodes",
      message: "Flow graph node ids must be unique."
    });
  });

  it("returns a deterministic blocking issue for missing edge endpoints", () => {
    const result = validateFlowGraph({
      ...publishableGraph,
      edges: [{ id: "edge-1", fromNodeId: "trigger-booking", toNodeId: "missing-node" }]
    });

    expect(result.publishable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing_edge_endpoint",
      severity: "error",
      blocking: true,
      path: "edges.edge-1",
      message: "Flow edge references a node that does not exist."
    });
  });

  it("blocks publication when a nonterminal node is unreachable from the trigger", () => {
    const result = validateFlowGraph({
      ...publishableGraph,
      nodes: [
        triggerNode,
        actionNode,
        {
          ...actionNode,
          id: "unreachable-task",
          title: "Недостижимая задача"
        }
      ]
    });

    expect(result.publishable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "unreachable_node",
      severity: "error",
      blocking: true,
      path: "nodes.unreachable-task",
      message: "Flow node is not reachable from the trigger."
    });
  });

  it("blocks auto_send message actions in the first foundation slice", () => {
    const result = validateFlowGraph({
      ...publishableGraph,
      nodes: [
        triggerNode,
        {
          id: "send-message",
          category: "action",
          kind: "send_message",
          title: "Отправить сообщение",
          approvalMode: "auto_send",
          config: {}
        }
      ],
      edges: [{ id: "edge-1", fromNodeId: "trigger-booking", toNodeId: "send-message" }]
    });

    expect(result.publishable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "auto_send_disabled",
      severity: "error",
      blocking: true,
      path: "nodes.send-message",
      message: "Auto-send message actions are disabled until delivery gates exist."
    });
  });
});
