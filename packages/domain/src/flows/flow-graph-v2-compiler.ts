import {
  FLOW_GRAPH_V2_MAX_EDGES,
  FLOW_GRAPH_V2_MAX_NODES,
  flowGraphV2Schema,
  type FlowCapabilityManifestV1,
  type FlowCapabilityManifestV2,
  type FlowCapabilityRequirement,
  type FlowDefinitionValidationIssue,
  type FlowExecutableNodeExecutorRequirement,
  type FlowGraphV2,
  type FlowGraphV2CompileIssueCode,
  type FlowNodeKindV2,
  type FlowNodeExecutorRequirement,
  type FlowNodeV2,
  type FlowSourceHandleV2,
  type FlowTriggerMatcherRequirement
} from "@elevenhouse/contracts";

export type {
  FlowCapabilityManifestV1,
  FlowCapabilityManifestV2,
  FlowCapabilityRequirement,
  FlowExecutableNodeExecutorRequirement,
  FlowGraphV2CompileIssueCode,
  FlowNodeExecutorRequirement,
  FlowTriggerMatcherRequirement
} from "@elevenhouse/contracts";

export type FlowGraphV2CompileIssue = Omit<FlowDefinitionValidationIssue, "code"> & {
  readonly code: FlowGraphV2CompileIssueCode;
};

export type FlowGraphV2CompileResult = {
  readonly publishable: boolean;
  readonly issues: readonly FlowGraphV2CompileIssue[];
  readonly normalizedGraph: FlowGraphV2 | null;
  readonly capabilityManifest: FlowCapabilityManifestV2 | null;
};

export type FlowGraphV2CompileLimits = {
  readonly maxNodes: number;
  readonly maxEdges: number;
};

export const DEFAULT_FLOW_GRAPH_V2_COMPILE_LIMITS: FlowGraphV2CompileLimits = Object.freeze({
  maxNodes: FLOW_GRAPH_V2_MAX_NODES,
  maxEdges: FLOW_GRAPH_V2_MAX_EDGES
});

type NodeRule = {
  readonly allowedHandles: (node: FlowNodeV2) => readonly FlowSourceHandleV2[];
  readonly requiredHandles: (node: FlowNodeV2) => readonly FlowSourceHandleV2[];
  readonly capabilities: readonly FlowCapabilityRequirement[];
  readonly branching: boolean;
  readonly terminal: boolean;
  readonly trigger: boolean;
};

const noHandles = (): readonly FlowSourceHandleV2[] => [];
const nextHandle = (): readonly FlowSourceHandleV2[] => ["next"];
const successHandle = (): readonly FlowSourceHandleV2[] => ["success"];
const conditionHandles = (): readonly FlowSourceHandleV2[] => ["true", "false"];
const approvalHandles = (node: FlowNodeV2): readonly FlowSourceHandleV2[] => {
  if (node.kind !== "astrologer_approval") return [];
  return node.config.expiresAfterMinutes === undefined
    ? ["approved", "rejected"]
    : ["approved", "rejected", "timeout"];
};

const nodeRules = {
  booking_confirmed: {
    allowedHandles: nextHandle,
    requiredHandles: nextHandle,
    capabilities: ["bookings.events.booking_confirmed", "products.read"],
    branching: false,
    terminal: false,
    trigger: true
  },
  manual_client: {
    allowedHandles: nextHandle,
    requiredHandles: nextHandle,
    capabilities: [],
    branching: false,
    terminal: false,
    trigger: true
  },
  birth_data_available: {
    allowedHandles: conditionHandles,
    requiredHandles: conditionHandles,
    capabilities: ["clients.birth_data.read.service_preparation"],
    branching: true,
    terminal: false,
    trigger: false
  },
  astrologer_work_item: {
    allowedHandles: successHandle,
    requiredHandles: successHandle,
    capabilities: [],
    branching: false,
    terminal: false,
    trigger: false
  },
  astrologer_approval: {
    allowedHandles: approvalHandles,
    requiredHandles: approvalHandles,
    capabilities: [],
    branching: true,
    terminal: false,
    trigger: false
  },
  completed: {
    allowedHandles: noHandles,
    requiredHandles: noHandles,
    capabilities: [],
    branching: false,
    terminal: true,
    trigger: false
  },
  suppressed: {
    allowedHandles: noHandles,
    requiredHandles: noHandles,
    capabilities: [],
    branching: false,
    terminal: true,
    trigger: false
  },
  failed: {
    allowedHandles: noHandles,
    requiredHandles: noHandles,
    capabilities: [],
    branching: false,
    terminal: true,
    trigger: false
  }
} satisfies Record<FlowNodeKindV2, NodeRule>;

export function compileFlowGraphV2(
  graph: FlowGraphV2,
  limits: FlowGraphV2CompileLimits = DEFAULT_FLOW_GRAPH_V2_COMPILE_LIMITS
): FlowGraphV2CompileResult {
  assertCompileLimits(limits);
  const issues: FlowGraphV2CompileIssue[] = [];
  const sortedNodes = [...graph.nodes].sort(compareNodes);
  const sortedEdges = [...graph.edges].sort(compareEdges);
  const nodesById = new Map<string, FlowNodeV2>();
  const nodeIdCounts = countBy(sortedNodes, (node) => node.id);
  const edgeIdCounts = countBy(sortedEdges, (edge) => edge.id);

  if (graph.nodes.length > limits.maxNodes) {
    addIssue(issues, {
      code: "node_limit_exceeded",
      path: "nodes",
      message: `Flow graph exceeds the configured ${limits.maxNodes} node limit.`
    });
  }

  if (graph.edges.length > limits.maxEdges) {
    addIssue(issues, {
      code: "edge_limit_exceeded",
      path: "edges",
      message: `Flow graph exceeds the configured ${limits.maxEdges} edge limit.`
    });
  }

  for (const [nodeId, count] of nodeIdCounts) {
    if (count > 1) {
      addIssue(issues, {
        code: "duplicate_node_id",
        path: `nodes.${nodeId}`,
        message: "Flow graph node ids must be unique."
      });
    }
  }

  for (const [edgeId, count] of edgeIdCounts) {
    if (count > 1) {
      addIssue(issues, {
        code: "duplicate_edge_id",
        path: `edges.${edgeId}`,
        message: "Flow graph edge ids must be unique."
      });
    }
  }

  for (const node of sortedNodes) {
    if (nodeIdCounts.get(node.id) === 1) nodesById.set(node.id, node);
  }

  const triggerNodes = [...nodesById.values()].filter((node) => nodeRules[node.kind].trigger);
  if (triggerNodes.length !== 1) {
    addIssue(issues, {
      code: "invalid_trigger_count",
      path: "nodes",
      message: "Flow graph requires exactly one trigger node."
    });
  }

  const structurallyValidEdges = sortedEdges.filter((edge) => {
    if (edgeIdCounts.get(edge.id) !== 1) return false;
    if (!nodesById.has(edge.sourceNodeId) || !nodesById.has(edge.targetNodeId)) {
      addIssue(issues, {
        code: "missing_edge_endpoint",
        path: `edges.${edge.id}`,
        message: "Flow edge must reference existing unique nodes."
      });
      return false;
    }
    return true;
  });

  const outgoingByNode = groupBy(structurallyValidEdges, (edge) => edge.sourceNodeId);
  const incomingByNode = groupBy(structurallyValidEdges, (edge) => edge.targetNodeId);
  const executableEdges = new Set<FlowGraphV2["edges"][number]>();

  for (const node of nodesById.values()) {
    const rule = nodeRules[node.kind];
    const outgoing = outgoingByNode.get(node.id) ?? [];
    const incoming = incomingByNode.get(node.id) ?? [];
    const allowedHandles = new Set(rule.allowedHandles(node));
    const requiredHandles = rule.requiredHandles(node);
    const handleCounts = countBy(outgoing, (edge) => edge.sourceHandle);

    if (rule.trigger && incoming.length > 0) {
      addIssue(issues, {
        code: "trigger_has_incoming_edge",
        path: `nodes.${node.id}`,
        message: "A trigger node cannot have incoming edges."
      });
    }

    if (incoming.length > 1) {
      addIssue(issues, {
        code: "implicit_fan_in",
        path: `nodes.${node.id}`,
        message: "Flow graph v2 does not support fan-in or branch reconvergence."
      });
    }

    if (rule.terminal && outgoing.length > 0) {
      addIssue(issues, {
        code: "terminal_has_outgoing_edge",
        path: `nodes.${node.id}`,
        message: "Terminal nodes cannot have outgoing edges."
      });
    }

    for (const edge of outgoing) {
      if (!allowedHandles.has(edge.sourceHandle)) {
        addIssue(issues, {
          code: "invalid_source_handle",
          path: `edges.${edge.id}.sourceHandle`,
          message: `Handle ${edge.sourceHandle} is not valid for ${node.kind}.`
        });
        continue;
      }
      executableEdges.add(edge);
    }

    for (const [sourceHandle, count] of handleCounts) {
      if (count > 1) {
        addIssue(issues, {
          code: "duplicate_source_handle",
          path: `nodes.${node.id}.${sourceHandle}`,
          message: "Each node outcome must have exactly one edge."
        });
      }
    }

    if ((!rule.branching && outgoing.length > 1) || [...handleCounts.values()].some((n) => n > 1)) {
      addIssue(issues, {
        code: "implicit_fan_out",
        path: `nodes.${node.id}`,
        message: "Flow graph v2 does not support implicit fan-out."
      });
    }

    for (const sourceHandle of requiredHandles) {
      if (handleCounts.get(sourceHandle) !== 1) {
        addIssue(issues, {
          code: "missing_required_source_handle",
          path: `nodes.${node.id}.${sourceHandle}`,
          message: `Node ${node.kind} requires exactly one ${sourceHandle} edge.`
        });
      }
    }
  }

  if (containsCycle(nodesById, structurallyValidEdges)) {
    addIssue(issues, {
      code: "cycle_detected",
      path: "edges",
      message: "Flow graph v2 must be acyclic."
    });
  }

  if (triggerNodes.length === 1 && nodeIdCounts.get(triggerNodes[0]!.id) === 1) {
    const executableOutgoing = groupBy([...executableEdges], (edge) => edge.sourceNodeId);
    const reachable = findReachable(triggerNodes[0]!.id, executableOutgoing);

    for (const node of nodesById.values()) {
      if (!reachable.has(node.id)) {
        addIssue(issues, {
          code: "unreachable_node",
          path: `nodes.${node.id}`,
          message: "Flow node is not reachable from the trigger."
        });
        continue;
      }

      if (!nodeRules[node.kind].terminal && (executableOutgoing.get(node.id)?.length ?? 0) === 0) {
        addIssue(issues, {
          code: "unterminated_path",
          path: `nodes.${node.id}`,
          message: "Every reachable non-terminal path must continue to a terminal node."
        });
      }
    }
  }

  if (issues.length > 0) {
    return {
      publishable: false,
      issues,
      normalizedGraph: null,
      capabilityManifest: null
    };
  }

  const normalizedNodes = sortedNodes.map(normalizeNode);
  const normalizedGraph = flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: normalizedNodes,
    edges: sortedEdges
  });
  const capabilityManifest = createCapabilityManifest(normalizedNodes);

  return {
    publishable: true,
    issues: [],
    normalizedGraph,
    capabilityManifest
  };
}

function normalizeNode(node: FlowNodeV2): FlowNodeV2 {
  if (node.kind !== "booking_confirmed") return node;
  return {
    ...node,
    config: {
      ...node.config,
      productIds: [...node.config.productIds].sort(compareStableText)
    }
  };
}

function createCapabilityManifest(nodes: readonly FlowNodeV2[]): FlowCapabilityManifestV2 {
  const triggerNodes = nodes.filter(isTriggerNode);
  if (triggerNodes.length !== 1) {
    throw new Error("Publishable flow graph requires exactly one trigger node");
  }
  const triggerNode = triggerNodes[0]!;
  const triggerMatcher: FlowTriggerMatcherRequirement = {
    kind: triggerNode.kind,
    configSchemaVersion: triggerNode.configSchemaVersion,
    matcherContractVersion: triggerNode.executorContractVersion,
    eventSchemaVersion: 1
  };
  const executorMap = new Map<string, FlowExecutableNodeExecutorRequirement>();
  const capabilities = new Set<FlowCapabilityRequirement>();

  for (const node of nodes) {
    for (const capability of nodeRules[node.kind].capabilities) capabilities.add(capability);
    if (isTriggerNode(node)) continue;

    const executor: FlowExecutableNodeExecutorRequirement = {
      kind: node.kind,
      configSchemaVersion: node.configSchemaVersion,
      executorContractVersion: node.executorContractVersion
    };
    executorMap.set(
      `${executor.kind}:${executor.configSchemaVersion}:${executor.executorContractVersion}`,
      executor
    );
  }

  return {
    schemaVersion: "flow-capability-manifest.v2",
    executionSemanticsVersion: "flow-interpreter.v1",
    triggerMatcher,
    nodeExecutors: [...executorMap.values()].sort((left, right) =>
      compareStableText(left.kind, right.kind)
    ),
    requiredCapabilities: [...capabilities].sort(compareStableText)
  };
}

export function projectFlowCapabilityManifestV1(
  manifest: FlowCapabilityManifestV2
): FlowCapabilityManifestV1 {
  const triggerExecutor: FlowNodeExecutorRequirement = {
    kind: manifest.triggerMatcher.kind,
    configSchemaVersion: manifest.triggerMatcher.configSchemaVersion,
    executorContractVersion: manifest.triggerMatcher.matcherContractVersion
  };

  return {
    schemaVersion: "flow-capability-manifest.v1",
    executionSemanticsVersion: manifest.executionSemanticsVersion,
    nodeExecutors: [...manifest.nodeExecutors, triggerExecutor].sort((left, right) =>
      compareStableText(left.kind, right.kind)
    ),
    requiredCapabilities: [...manifest.requiredCapabilities]
  };
}

function isTriggerNode(
  node: FlowNodeV2
): node is Extract<FlowNodeV2, { kind: "booking_confirmed" | "manual_client" }> {
  return node.kind === "booking_confirmed" || node.kind === "manual_client";
}

function containsCycle(
  nodesById: ReadonlyMap<string, FlowNodeV2>,
  edges: readonly FlowGraphV2["edges"][number][]
): boolean {
  const indegree = new Map<string, number>([...nodesById.keys()].map((nodeId) => [nodeId, 0]));
  const outgoing = groupBy(edges, (edge) => edge.sourceNodeId);

  for (const edge of edges) {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const pending = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId)
    .sort();
  let visited = 0;

  while (pending.length > 0) {
    const nodeId = pending.shift();
    if (nodeId === undefined) break;
    visited += 1;
    for (const edge of outgoing.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(edge.targetNodeId) ?? 0) - 1;
      indegree.set(edge.targetNodeId, nextIndegree);
      if (nextIndegree === 0) pending.push(edge.targetNodeId);
    }
  }

  return visited !== nodesById.size;
}

function findReachable(
  triggerNodeId: string,
  outgoing: ReadonlyMap<string, readonly FlowGraphV2["edges"][number][]>
): Set<string> {
  const reachable = new Set<string>();
  const pending = [triggerNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (nodeId === undefined || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) pending.push(edge.targetNodeId);
  }
  return reachable;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const itemKey = key(item);
    counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1);
  }
  return counts;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    const group = groups.get(itemKey) ?? [];
    group.push(item);
    groups.set(itemKey, group);
  }
  return groups;
}

function addIssue(
  issues: FlowGraphV2CompileIssue[],
  issue: Omit<FlowGraphV2CompileIssue, "severity" | "blocking">
): void {
  if (issues.some((existing) => existing.code === issue.code && existing.path === issue.path))
    return;
  issues.push({ ...issue, severity: "error", blocking: true });
}

function compareNodes(left: FlowNodeV2, right: FlowNodeV2): number {
  return compareStableText(left.id, right.id) || compareStableText(left.kind, right.kind);
}

function compareEdges(
  left: FlowGraphV2["edges"][number],
  right: FlowGraphV2["edges"][number]
): number {
  return (
    compareStableText(left.id, right.id) ||
    compareStableText(left.sourceNodeId, right.sourceNodeId) ||
    compareStableText(left.targetNodeId, right.targetNodeId) ||
    compareStableText(left.sourceHandle, right.sourceHandle)
  );
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertCompileLimits(limits: FlowGraphV2CompileLimits): void {
  if (
    !Number.isInteger(limits.maxNodes) ||
    limits.maxNodes < 1 ||
    limits.maxNodes > FLOW_GRAPH_V2_MAX_NODES
  ) {
    throw new RangeError(`maxNodes must be an integer between 1 and ${FLOW_GRAPH_V2_MAX_NODES}.`);
  }
  if (
    !Number.isInteger(limits.maxEdges) ||
    limits.maxEdges < 0 ||
    limits.maxEdges > FLOW_GRAPH_V2_MAX_EDGES
  ) {
    throw new RangeError(`maxEdges must be an integer between 0 and ${FLOW_GRAPH_V2_MAX_EDGES}.`);
  }
}
