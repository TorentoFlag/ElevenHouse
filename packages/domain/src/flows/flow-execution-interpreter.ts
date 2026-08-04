import {
  flowCapabilityManifestSchema,
  flowExecutableNodeKindV2Schema,
  flowGraphV2Schema,
  flowSourceHandleV2Schema,
  type FlowCapabilityManifest,
  type FlowExecutableNodeKindV2,
  type FlowExecutableNodeV2,
  type FlowGraphV2,
  type FlowNodeV2,
  type FlowSourceHandleV2
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";
import { verifyFlowCapabilityManifestForGraph } from "./flow-capability-manifest-integrity";

export type FlowNodeExecutorKey = `${FlowExecutableNodeKindV2}:${number}:${number}`;

export type FlowExecutionClaim = {
  readonly tokenId: string;
  readonly ownerUserId: string;
  readonly runId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly nodeId: string;
  readonly nodeKind: FlowExecutableNodeKindV2;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
  readonly leaseOwner: string;
  readonly nodeActivationSequence: bigint;
  readonly attemptNumber: bigint;
  readonly fencingToken: bigint;
  readonly claimedAt: string;
  readonly leaseExpiresAt: string;
};

export type PinnedFlowExecutionDefinition = Pick<
  FlowExecutionClaim,
  | "flowVersionId"
  | "nodeId"
  | "nodeKind"
  | "configSchemaVersion"
  | "executorContractVersion"
  | "graph"
  | "capabilityManifest"
>;

const flowRuntimeResultCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const flowRuntimeStableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const flowExecutionPermanentFailureReasonCodeValues = [
  "FLOW_PINNED_GRAPH_INVALID",
  "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
  "FLOW_TOKEN_NODE_NOT_FOUND",
  "FLOW_TOKEN_NODE_METADATA_MISMATCH",
  "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
  "FLOW_TOKEN_RUNTIME_STATE_INVALID",
  "FLOW_RUNTIME_TRACE_INVALID",
  "FLOW_NODE_EXECUTOR_UNAVAILABLE",
  "FLOW_NODE_EXECUTION_REJECTED"
] as const;

export const flowExecutionRetryableFailureReasonCodeValues = [
  "FLOW_NODE_EXECUTION_RETRYABLE",
  "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
] as const;

export const flowExecutionFailureReasonCodeValues = [
  ...flowExecutionPermanentFailureReasonCodeValues,
  ...flowExecutionRetryableFailureReasonCodeValues,
  "FLOW_TOKEN_LEASE_EXPIRED"
] as const;

export const flowExecutionQuarantineFailureReasonCodeValues = [
  "FLOW_PINNED_GRAPH_INVALID",
  "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
  "FLOW_TOKEN_NODE_NOT_FOUND",
  "FLOW_TOKEN_NODE_METADATA_MISMATCH",
  "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
  "FLOW_TOKEN_RUNTIME_STATE_INVALID",
  "FLOW_RUNTIME_TRACE_INVALID",
  "FLOW_NODE_EXECUTOR_UNAVAILABLE"
] as const;

export const flowExecutionRetryScheduledFailureReasonCodeValues = [
  ...flowExecutionRetryableFailureReasonCodeValues,
  "FLOW_TOKEN_LEASE_EXPIRED"
] as const;

export const flowExecutionFailedTerminalFailureReasonCodeValues = [
  "FLOW_NODE_EXECUTION_REJECTED",
  ...flowExecutionRetryableFailureReasonCodeValues,
  "FLOW_TOKEN_LEASE_EXPIRED"
] as const;

const flowExecutionPermanentFailureReasonCodeSchema = z.enum(
  flowExecutionPermanentFailureReasonCodeValues
);
const flowExecutionRetryableFailureReasonCodeSchema = z.enum(
  flowExecutionRetryableFailureReasonCodeValues
);
const flowExecutionFailureReasonCodeSchema = z.enum(flowExecutionFailureReasonCodeValues);

export type FlowExecutionFailureReasonCode = z.infer<typeof flowExecutionFailureReasonCodeSchema>;

export type FlowExecutionFailure = {
  readonly classification: "retryable" | "permanent";
  readonly reasonCode: Exclude<FlowExecutionFailureReasonCode, "FLOW_TOKEN_LEASE_EXPIRED">;
};

export const flowTerminalTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("terminal"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_GOAL_REACHED"),
    resultCode: flowRuntimeResultCodeSchema
  })
  .strict();

export const flowAdvancedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("advanced"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_EDGE_SELECTED"),
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    sourceHandle: flowSourceHandleV2Schema,
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema
  })
  .strict();

export const flowLeaseExpiredTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("lease_expired"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_TOKEN_LEASE_EXPIRED"),
    resultCode: z.literal("FLOW_TOKEN_LEASE_EXPIRED")
  })
  .strict();

export const flowCanceledTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("canceled"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: z.literal("FLOW_RUN_CANCELED_BY_OWNER"),
    resultCode: z.literal("FLOW_RUN_CANCELED")
  })
  .strict();

export const flowRetryScheduledTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("retry_scheduled"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: flowExecutionRetryableFailureReasonCodeSchema,
    resultCode: z.literal("FLOW_EXECUTION_RETRY_SCHEDULED")
  })
  .strict();

export const flowFailedTraceSummarySchema = z
  .object({
    schemaVersion: z.literal("flow-runtime-trace.v1"),
    outcome: z.literal("failed"),
    nodeKind: flowExecutableNodeKindV2Schema,
    reasonCode: flowExecutionFailureReasonCodeSchema,
    resultCode: z.enum(["FLOW_EXECUTION_FAILED_TERMINAL", "FLOW_EXECUTION_RETRY_EXHAUSTED"])
  })
  .strict()
  .superRefine((value, context) => {
    const permanent = flowExecutionPermanentFailureReasonCodeSchema.safeParse(value.reasonCode);
    const retryExhausted =
      flowExecutionRetryableFailureReasonCodeSchema.safeParse(value.reasonCode).success ||
      value.reasonCode === "FLOW_TOKEN_LEASE_EXPIRED";
    if (
      (value.resultCode === "FLOW_EXECUTION_FAILED_TERMINAL" && !permanent.success) ||
      (value.resultCode === "FLOW_EXECUTION_RETRY_EXHAUSTED" && !retryExhausted)
    ) {
      context.addIssue({ code: "custom", message: "Failure reason and result do not match" });
    }
  });

export const flowRuntimeTraceSummarySchema = z.union([
  flowAdvancedTraceSummarySchema,
  flowTerminalTraceSummarySchema,
  flowLeaseExpiredTraceSummarySchema,
  flowCanceledTraceSummarySchema,
  flowRetryScheduledTraceSummarySchema,
  flowFailedTraceSummarySchema
]);

export type FlowRuntimeTraceSummary = z.infer<typeof flowRuntimeTraceSummarySchema>;
export type FlowTerminalTraceSummary = z.infer<typeof flowTerminalTraceSummarySchema>;

const flowExecutionTerminalDecisionSchema = z
  .object({
    kind: z.literal("terminal"),
    sourceNodeId: flowRuntimeStableIdSchema,
    terminalStatus: z.literal("completed"),
    resultCode: flowRuntimeResultCodeSchema,
    trace: flowTerminalTraceSummarySchema
  })
  .strict();

const flowExecutionAdvanceSelectionSchema = z
  .object({
    kind: z.literal("advance"),
    sourceNodeId: flowRuntimeStableIdSchema,
    sourceHandle: flowSourceHandleV2Schema
  })
  .strict();

const flowExecutionAdvanceDecisionSchema = z
  .object({
    kind: z.literal("advance"),
    sourceNodeId: flowRuntimeStableIdSchema,
    sourceHandle: flowSourceHandleV2Schema,
    selectedEdgeId: flowRuntimeStableIdSchema,
    targetNodeId: flowRuntimeStableIdSchema,
    targetNodeKind: flowExecutableNodeKindV2Schema,
    resultCode: z.literal("FLOW_TOKEN_ADVANCED"),
    trace: flowAdvancedTraceSummarySchema
  })
  .strict();

const flowExecutionDecisionSchema = z.discriminatedUnion("kind", [
  flowExecutionAdvanceDecisionSchema,
  flowExecutionTerminalDecisionSchema
]);

export type FlowExecutionDecision = z.infer<typeof flowExecutionDecisionSchema>;
export type FlowNodeExecutorDecision =
  | z.infer<typeof flowExecutionAdvanceSelectionSchema>
  | z.infer<typeof flowExecutionTerminalDecisionSchema>;

export type FlowNodeExecutor = {
  readonly kind: FlowExecutableNodeKindV2;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
  readonly evaluate: (node: FlowExecutableNodeV2) => Promise<FlowNodeExecutorDecision>;
};

export type FlowNodeExecutorRegistry = {
  readonly executorKeys: readonly FlowNodeExecutorKey[];
  readonly require: (input: {
    readonly kind: FlowExecutableNodeKindV2;
    readonly configSchemaVersion: number;
    readonly executorContractVersion: number;
  }) => FlowNodeExecutor;
};

export class FlowExecutionIntegrityError extends Error {
  override readonly name = "FlowExecutionIntegrityError";

  constructor(
    readonly code:
      | "FLOW_PINNED_GRAPH_INVALID"
      | "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID"
      | "FLOW_TOKEN_NODE_NOT_FOUND"
      | "FLOW_TOKEN_NODE_METADATA_MISMATCH"
      | "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
    message: string
  ) {
    super(message);
  }
}

export class FlowRuntimeTraceValidationError extends Error {
  override readonly name = "FlowRuntimeTraceValidationError";
  readonly code = "FLOW_RUNTIME_TRACE_INVALID";

  constructor() {
    super("FLOW_RUNTIME_TRACE_INVALID: flow runtime trace must match the redacted schema");
  }
}

export class FlowNodeExecutorUnavailableError extends Error {
  override readonly name = "FlowNodeExecutorUnavailableError";
  readonly code = "FLOW_NODE_EXECUTOR_UNAVAILABLE";

  constructor(readonly executorKey: FlowNodeExecutorKey) {
    super(`Flow node executor ${executorKey} is unavailable`);
  }
}

export class FlowNodeExecutionError extends Error {
  override readonly name = "FlowNodeExecutionError";

  constructor(readonly code: "FLOW_NODE_EXECUTION_RETRYABLE" | "FLOW_NODE_EXECUTION_REJECTED") {
    super(code);
  }
}

export function classifyFlowExecutionFailure(error: unknown): FlowExecutionFailure {
  if (error instanceof FlowExecutionIntegrityError) {
    return { classification: "permanent", reasonCode: error.code };
  }
  if (error instanceof FlowRuntimeTraceValidationError) {
    return { classification: "permanent", reasonCode: error.code };
  }
  if (error instanceof FlowNodeExecutorUnavailableError) {
    return { classification: "permanent", reasonCode: error.code };
  }
  if (error instanceof FlowNodeExecutionError) {
    return {
      classification: error.code === "FLOW_NODE_EXECUTION_RETRYABLE" ? "retryable" : "permanent",
      reasonCode: error.code
    };
  }
  return {
    classification: "retryable",
    reasonCode: "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
  };
}

export function formatFlowNodeExecutorKey(input: {
  readonly kind: FlowExecutableNodeKindV2;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
}): FlowNodeExecutorKey {
  return `${input.kind}:${input.configSchemaVersion}:${input.executorContractVersion}`;
}

export function createFlowNodeExecutorRegistry(
  executors: readonly FlowNodeExecutor[]
): FlowNodeExecutorRegistry {
  const executorsByKey = new Map<FlowNodeExecutorKey, FlowNodeExecutor>();

  for (const executor of executors) {
    const key = formatFlowNodeExecutorKey(executor);
    if (executorsByKey.has(key)) {
      throw new Error(`Duplicate flow node executor ${key}`);
    }
    executorsByKey.set(key, executor);
  }

  const executorKeys = [...executorsByKey.keys()].sort(compareBinary);

  return {
    executorKeys,
    require: (input) => {
      const key = formatFlowNodeExecutorKey(input);
      const executor = executorsByKey.get(key);
      if (!executor) throw new FlowNodeExecutorUnavailableError(key);
      return executor;
    }
  };
}

export function createBuiltInFlowNodeExecutorRegistry(): FlowNodeExecutorRegistry {
  return createFlowNodeExecutorRegistry([completedNodeExecutor]);
}

export async function interpretFlowExecutionClaim(input: {
  readonly claim: FlowExecutionClaim;
  readonly registry: FlowNodeExecutorRegistry;
}): Promise<FlowExecutionDecision> {
  const node = resolvePinnedFlowExecutionNode(input.claim);

  const executor = input.registry.require(node);
  const executorDecision = await executor.evaluate(node);
  if (executorDecision.kind !== "advance") {
    return validateFlowExecutionDecision(node, executorDecision);
  }

  const selection = parseFlowExecutionAdvanceSelection(node, executorDecision);
  const target = resolvePinnedFlowExecutionAdvanceTarget({
    definition: input.claim,
    sourceHandle: selection.sourceHandle
  });
  return validateFlowExecutionDecision(node, {
    ...selection,
    selectedEdgeId: target.edgeId,
    targetNodeId: target.node.id,
    targetNodeKind: target.node.kind,
    resultCode: "FLOW_TOKEN_ADVANCED",
    trace: {
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "advanced",
      nodeKind: node.kind,
      reasonCode: "FLOW_EDGE_SELECTED",
      resultCode: "FLOW_TOKEN_ADVANCED",
      sourceHandle: selection.sourceHandle,
      selectedEdgeId: target.edgeId,
      targetNodeId: target.node.id,
      targetNodeKind: target.node.kind
    }
  });
}

export function resolvePinnedFlowExecutionNode(
  claim: PinnedFlowExecutionDefinition
): FlowExecutableNodeV2 {
  const graph = parsePinnedGraph(claim.graph);
  const manifest = parsePinnedCapabilityManifest(claim.capabilityManifest);
  const snapshotIntegrity = verifyFlowCapabilityManifestForGraph({
    graph,
    capabilityManifest: manifest
  });
  if (!snapshotIntegrity.valid) {
    throw new FlowExecutionIntegrityError(
      snapshotIntegrity.reason === "graph_not_publishable"
        ? "FLOW_PINNED_GRAPH_INVALID"
        : "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
      "Pinned flow graph and capability manifest do not form an executable publication snapshot"
    );
  }
  const node = graph.nodes.find((candidate) => candidate.id === claim.nodeId);

  if (!node) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_NODE_NOT_FOUND",
      `Token node ${claim.nodeId} is missing from pinned flow version ${claim.flowVersionId}`
    );
  }

  if (
    node.kind !== claim.nodeKind ||
    node.configSchemaVersion !== claim.configSchemaVersion ||
    node.executorContractVersion !== claim.executorContractVersion
  ) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_NODE_METADATA_MISMATCH",
      `Token node metadata does not match pinned flow version ${claim.flowVersionId}`
    );
  }

  if (!isFlowExecutableNode(node)) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_NODE_METADATA_MISMATCH",
      `Token references a non-executable node in pinned flow version ${claim.flowVersionId}`
    );
  }

  assertExecutorManifest(claim, manifest);
  return node;
}

export function parseFlowRuntimeTraceSummary(value: unknown): FlowRuntimeTraceSummary {
  const result = flowRuntimeTraceSummarySchema.safeParse(value);
  if (!result.success) throw new FlowRuntimeTraceValidationError();
  return result.data;
}

export function parseFlowExecutionDecision(value: unknown): FlowExecutionDecision {
  const result = flowExecutionDecisionSchema.safeParse(value);
  if (!result.success) throw new FlowRuntimeTraceValidationError();
  const decision = result.data;
  if (
    decision.trace.resultCode !== decision.resultCode ||
    (decision.kind === "advance" &&
      (decision.trace.sourceHandle !== decision.sourceHandle ||
        decision.trace.selectedEdgeId !== decision.selectedEdgeId ||
        decision.trace.targetNodeId !== decision.targetNodeId ||
        decision.trace.targetNodeKind !== decision.targetNodeKind))
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  return decision;
}

export function resolvePinnedFlowExecutionAdvanceTarget(input: {
  readonly definition: PinnedFlowExecutionDefinition;
  readonly sourceHandle: FlowSourceHandleV2;
}): { readonly edgeId: string; readonly node: FlowExecutableNodeV2 } {
  const graph = parsePinnedGraph(input.definition.graph);
  const manifest = parsePinnedCapabilityManifest(input.definition.capabilityManifest);
  resolvePinnedFlowExecutionNode(input.definition);

  const matchingEdges = graph.edges.filter(
    (edge) =>
      edge.sourceNodeId === input.definition.nodeId && edge.sourceHandle === input.sourceHandle
  );
  if (matchingEdges.length !== 1) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow version ${input.definition.flowVersionId} must have exactly one ${input.sourceHandle} edge from ${input.definition.nodeId}`
    );
  }

  const edge = matchingEdges[0];
  if (!edge) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow version ${input.definition.flowVersionId} is missing its selected edge`
    );
  }
  const targetNode = graph.nodes.find((candidate) => candidate.id === edge.targetNodeId);
  if (!targetNode) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow edge ${edge.id} references a missing target node`
    );
  }
  if (!isFlowExecutableNode(targetNode)) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      `Pinned flow edge ${edge.id} targets a non-executable enrollment node`
    );
  }
  assertExecutorManifest(
    {
      flowVersionId: input.definition.flowVersionId,
      nodeKind: targetNode.kind,
      configSchemaVersion: targetNode.configSchemaVersion,
      executorContractVersion: targetNode.executorContractVersion
    },
    manifest
  );
  return { edgeId: edge.id, node: targetNode };
}

function parseFlowExecutionAdvanceSelection(
  node: FlowExecutableNodeV2,
  value: unknown
): z.infer<typeof flowExecutionAdvanceSelectionSchema> {
  const result = flowExecutionAdvanceSelectionSchema.safeParse(value);
  if (!result.success || result.data.sourceNodeId !== node.id) {
    throw new FlowRuntimeTraceValidationError();
  }
  return result.data;
}

function validateFlowExecutionDecision(
  node: FlowExecutableNodeV2,
  value: unknown
): FlowExecutionDecision {
  const decision = parseFlowExecutionDecision(value);
  if (decision.sourceNodeId !== node.id || decision.trace.nodeKind !== node.kind) {
    throw new FlowRuntimeTraceValidationError();
  }
  if (
    decision.kind === "terminal" &&
    (node.kind !== "completed" || decision.resultCode !== node.config.goalKey)
  ) {
    throw new FlowRuntimeTraceValidationError();
  }
  return decision;
}

const completedNodeExecutor: FlowNodeExecutor = {
  kind: "completed",
  configSchemaVersion: 1,
  executorContractVersion: 1,
  evaluate: async (node) => {
    if (node.kind !== "completed") {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Completed executor received a different node kind"
      );
    }

    return {
      kind: "terminal",
      sourceNodeId: node.id,
      terminalStatus: "completed",
      resultCode: node.config.goalKey,
      trace: {
        schemaVersion: "flow-runtime-trace.v1",
        outcome: "terminal",
        nodeKind: node.kind,
        reasonCode: "FLOW_GOAL_REACHED",
        resultCode: node.config.goalKey
      }
    };
  }
};

function parsePinnedGraph(value: unknown): FlowGraphV2 {
  const result = flowGraphV2Schema.safeParse(value);
  if (!result.success) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      "Pinned flow version graph is not a valid flow-graph.v2 document"
    );
  }
  return result.data;
}

function parsePinnedCapabilityManifest(value: unknown): FlowCapabilityManifest {
  const result = flowCapabilityManifestSchema.safeParse(value);
  if (!result.success) {
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_CAPABILITY_MANIFEST_INVALID",
      "Pinned flow version capability manifest is invalid or uses unsupported interpreter semantics"
    );
  }
  return result.data;
}

function assertExecutorManifest(
  claim: Pick<
    PinnedFlowExecutionDefinition,
    "flowVersionId" | "nodeKind" | "configSchemaVersion" | "executorContractVersion"
  >,
  manifest: FlowCapabilityManifest
): void {
  const authorized = manifest.nodeExecutors.some(
    (executor) =>
      executor.kind === claim.nodeKind &&
      executor.configSchemaVersion === claim.configSchemaVersion &&
      executor.executorContractVersion === claim.executorContractVersion
  );
  if (!authorized) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH",
      `Token executor ${formatFlowNodeExecutorKey({
        kind: claim.nodeKind,
        configSchemaVersion: claim.configSchemaVersion,
        executorContractVersion: claim.executorContractVersion
      })} is not pinned by flow version ${claim.flowVersionId}`
    );
  }
}

function isFlowExecutableNode(node: FlowNodeV2): node is FlowExecutableNodeV2 {
  return flowExecutableNodeKindV2Schema.safeParse(node.kind).success;
}

function compareBinary(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
