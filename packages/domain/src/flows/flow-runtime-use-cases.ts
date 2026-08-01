import type {
  DecideFlowApprovalRequest,
  FlowActionKind,
  FlowApprovalKind,
  FlowGraph,
  FlowNode,
  FlowRuntimeEventSource,
  FlowRunStatus,
  FlowRunSubjectType,
  FlowSimulationStep,
  FlowTriggerKind,
  ListFlowApprovalsQuery,
  ListFlowRunsQuery,
  SimulateFlowRunRequest,
  SimulateFlowRunResponse
} from "@elevenhouse/contracts";

import { checkFlowRunEligibility } from "./flow-eligibility";
import { createFlowRunSnapshot } from "./flow-run-state";
import type { FlowStore } from "./flow-store";
import type {
  CreateFlowRunApprovalInput,
  CreateFlowRunStepInput,
  FlowApprovalRecord,
  FlowRuntimeEventRecord,
  FlowRuntimeStore,
  FlowRunRecord,
  FlowStepRunRecord,
  FlowSuppressionRecord
} from "./flow-runtime-store";

export type FlowRuntimeGateInput = {
  readonly hasOwnerRelationship?: boolean;
  readonly hasChannelConsent?: boolean;
  readonly isQuietHours?: boolean;
  readonly isFrequencyCapped?: boolean;
  readonly isPlanLimitReached?: boolean;
};

export type SimulateFlowRunInput = {
  readonly flowStore: FlowStore;
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly request: SimulateFlowRunRequest;
  readonly gates?: FlowRuntimeGateInput;
};

export type CreateManualFlowRunInput = SimulateFlowRunInput & {
  readonly dedupeKey: string;
  readonly now: string;
};

export type DispatchFlowRuntimeEventInput = {
  readonly flowStore: FlowStore;
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly triggerKind: FlowTriggerKind;
  readonly source: FlowRuntimeEventSource;
  readonly sourceEventId: string;
  readonly subjectType: FlowRunSubjectType;
  readonly subjectId: string;
  readonly occurredAt: string;
  readonly timeZone: string;
  readonly payload: Record<string, unknown>;
  readonly gates?: FlowRuntimeGateInput;
  readonly now: string;
};

export type CreateManualFlowRunResult =
  | {
      readonly status: "created" | "duplicate";
      readonly event: FlowRuntimeEventRecord;
      readonly run: FlowRunRecord;
      readonly stepRuns: readonly FlowStepRunRecord[];
      readonly approvals: readonly FlowApprovalRecord[];
    }
  | {
      readonly status: "suppressed";
      readonly event: FlowRuntimeEventRecord;
      readonly reason: string;
    };

export type DispatchFlowRuntimeEventResult = {
  readonly total: number;
  readonly results: readonly (CreateManualFlowRunResult & { readonly flowId: string })[];
};

export type ListFlowRunsInput = {
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly flowId?: string;
  readonly query: ListFlowRunsQuery;
};

export type ListFlowApprovalsInput = {
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly query: ListFlowApprovalsQuery;
};

export type DecideFlowApprovalInput = {
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly approvalId: string;
  readonly decidedByUserId: string;
  readonly request: DecideFlowApprovalRequest;
  readonly now: string;
};

const internalSafeActionKinds = new Set<FlowActionKind>(["update_tag", "create_task"]);

export async function simulateFlowRun(
  input: SimulateFlowRunInput
): Promise<SimulateFlowRunResponse | null> {
  const loaded = await loadRunnableFlow(input);
  if (!loaded) return null;

  const eligibility = checkFlowRunEligibility({
    status: loaded.flow.status,
    publishedVersionId: loaded.flow.publishedVersionId,
    subjectType: input.request.subjectType,
    containsAutoSendNode: containsAutoSendNode(loaded.version.graph),
    ...input.gates
  });

  const plannedSteps = planFlowSteps(loaded.version.graph);
  return {
    flowId: input.flowId,
    flowVersionId: loaded.version.id,
    plannedSteps: eligibility.allowed
      ? plannedSteps
      : plannedSteps.map((step) => ({ ...step, status: "blocked", reason: eligibility.reason })),
    warnings: eligibility.allowed ? [] : [eligibility.reason]
  };
}

export async function createManualFlowRun(
  input: CreateManualFlowRunInput
): Promise<CreateManualFlowRunResult | null> {
  const loaded = await loadRunnableFlow(input);
  if (!loaded) return null;

  const eventInput = {
    ownerUserId: input.ownerUserId,
    source: input.request.source,
    sourceEventId: input.dedupeKey,
    dedupeKey: input.dedupeKey,
    subjectType: input.request.subjectType,
    subjectId: input.request.subjectId,
    occurredAt: input.request.occurredAt,
    payload: input.request.payload
  };
  const existingDecision = await replayExistingRuntimeDecision({
    runtimeStore: input.runtimeStore,
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    dedupeKey: input.dedupeKey
  });
  if (existingDecision) return existingDecision;

  const snapshot = createFlowRunSnapshot({
    flowVersionId: loaded.version.id,
    sourceEventId: input.dedupeKey,
    subjectType: input.request.subjectType,
    subjectId: input.request.subjectId,
    occurredAt: input.request.occurredAt,
    timeZone: input.request.timeZone,
    consent: {},
    channels: {},
    payload: input.request.payload
  });
  const eligibility = checkFlowRunEligibility({
    status: loaded.flow.status,
    publishedVersionId: loaded.flow.publishedVersionId,
    subjectType: input.request.subjectType,
    containsAutoSendNode: containsAutoSendNode(loaded.version.graph),
    ...input.gates
  });
  if (!eligibility.allowed) {
    const created = await input.runtimeStore.createRunForEventDedupe({
      event: eventInput,
      run: {
        flowId: input.flowId,
        flowVersionId: loaded.version.id,
        status: "suppressed",
        snapshot,
        currentNodeId: null,
        now: input.now,
        stepRuns: [],
        approvals: []
      },
      suppression: {
        reason: eligibility.reason,
        details: { flowId: input.flowId }
      }
    });
    return replayCreatedRuntimeDecision(created, eligibility.reason);
  }

  const plan = buildExecutionPlan(loaded.version.graph);
  const created = await input.runtimeStore.createRunForEventDedupe({
    event: eventInput,
    run: {
      flowId: input.flowId,
      flowVersionId: loaded.version.id,
      status: plan.runStatus,
      snapshot,
      currentNodeId: plan.currentNodeId,
      now: input.now,
      stepRuns: plan.stepRuns,
      approvals: plan.approvals
    }
  });

  if (created.run.status === "suppressed") {
    return replayCreatedRuntimeDecision(created, "DUPLICATE_SUPPRESSED_RUN");
  }

  return {
    status: created.status,
    event: created.event,
    run: created.run,
    stepRuns: created.stepRuns,
    approvals: created.approvals
  };
}

export async function dispatchFlowRuntimeEvent(
  input: DispatchFlowRuntimeEventInput
): Promise<DispatchFlowRuntimeEventResult> {
  const flows = await input.flowStore.listActiveByTriggerKind({
    ownerUserId: input.ownerUserId,
    triggerKind: input.triggerKind
  });
  const results: Array<CreateManualFlowRunResult & { readonly flowId: string }> = [];

  for (const flow of flows) {
    const result = await createManualFlowRun({
      flowStore: input.flowStore,
      runtimeStore: input.runtimeStore,
      ownerUserId: input.ownerUserId,
      flowId: flow.id,
      dedupeKey: `${input.sourceEventId}:${flow.id}`,
      request: {
        source: input.source,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
        timeZone: input.timeZone,
        payload: input.payload
      },
      gates: input.gates,
      now: input.now
    });
    if (result) {
      results.push({ flowId: flow.id, ...result });
    }
  }

  return {
    total: results.length,
    results
  };
}

async function replayExistingRuntimeDecision(input: {
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly dedupeKey: string;
}): Promise<CreateManualFlowRunResult | null> {
  const event = await input.runtimeStore.findEventByDedupeKey({
    ownerUserId: input.ownerUserId,
    dedupeKey: input.dedupeKey
  });
  if (!event) return null;

  const run = await input.runtimeStore.findRunByEventAndFlow({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    runtimeEventId: event.id
  });
  if (!run) return null;

  if (run.status === "suppressed") {
    const suppression = await input.runtimeStore.findSuppressionByRun({
      ownerUserId: input.ownerUserId,
      flowId: input.flowId,
      runtimeEventId: event.id,
      flowRunId: run.id
    });
    return { status: "suppressed", event, reason: suppression?.reason ?? "DUPLICATE_SUPPRESSED_RUN" };
  }

  return {
    status: "duplicate",
    event,
    run,
    stepRuns: [],
    approvals: []
  };
}

function replayCreatedRuntimeDecision(
  created: {
    readonly event: FlowRuntimeEventRecord;
    readonly run: FlowRunRecord;
    readonly suppression?: FlowSuppressionRecord | null;
  },
  fallbackReason: string
): CreateManualFlowRunResult {
  if (created.run.status === "suppressed") {
    return {
      status: "suppressed",
      event: created.event,
      reason: created.suppression?.reason ?? fallbackReason
    };
  }

  return {
    status: "duplicate",
    event: created.event,
    run: created.run,
    stepRuns: [],
    approvals: []
  };
}

export function listFlowRuns(input: ListFlowRunsInput) {
  return input.runtimeStore.listRuns({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    status: input.query.status,
    limit: input.query.limit,
    offset: input.query.offset
  });
}

export function listFlowApprovals(input: ListFlowApprovalsInput) {
  return input.runtimeStore.listApprovals({
    ownerUserId: input.ownerUserId,
    status: input.query.status,
    limit: input.query.limit,
    offset: input.query.offset
  });
}

export function decideFlowApproval(input: DecideFlowApprovalInput) {
  return input.runtimeStore.decideApproval({
    ownerUserId: input.ownerUserId,
    approvalId: input.approvalId,
    decidedByUserId: input.decidedByUserId,
    decision: input.request.decision,
    note: input.request.note,
    now: input.now
  });
}

async function loadRunnableFlow(input: Pick<SimulateFlowRunInput, "flowStore" | "ownerUserId" | "flowId">) {
  const flow = await input.flowStore.findByOwnerAndId({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (!flow) return null;

  const version = await input.flowStore.findPublishedVersionByFlowId({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (!version) return null;

  return { flow, version };
}

function planFlowSteps(graph: FlowGraph): FlowSimulationStep[] {
  return orderedNodes(graph).map((node) => {
    const outcome = classifyNode(node);
    return {
      nodeId: node.id,
      status: outcome.requiresApproval ? "approval_required" : outcome.blocked ? "blocked" : "planned",
      reason: outcome.reason
    };
  });
}

function buildExecutionPlan(graph: FlowGraph): {
  readonly runStatus: FlowRunStatus;
  readonly currentNodeId: string | null;
  readonly stepRuns: readonly CreateFlowRunStepInput[];
  readonly approvals: readonly CreateFlowRunApprovalInput[];
} {
  const approvals: CreateFlowRunApprovalInput[] = [];
  const stepRuns: CreateFlowRunStepInput[] = [];
  let currentNodeId: string | null = null;
  let blocked = false;

  for (const node of orderedNodes(graph)) {
    const outcome = classifyNode(node);
    const status = outcome.requiresApproval
      ? "approval_required"
      : outcome.blocked
        ? "failed_terminal"
        : "completed";

    if (currentNodeId === null && (status === "approval_required" || status === "failed_terminal")) {
      currentNodeId = node.id;
    }
    if (status === "failed_terminal") blocked = true;

    stepRuns.push({
      nodeId: node.id,
      status,
      inputSnapshot: { node },
      outputSnapshot: null,
      errorCode: outcome.blocked ? "FLOW_NODE_BLOCKED" : null,
      errorMessage: outcome.blocked ? outcome.reason : null
    });

    if (outcome.requiresApproval) {
      approvals.push({
        stepNodeId: node.id,
        kind: approvalKindForNode(node),
        title: node.title,
        preview: node.title
      });
    }
  }

  return {
    runStatus: blocked ? "failed_terminal" : approvals.length > 0 ? "approval_required" : "completed",
    currentNodeId,
    stepRuns,
    approvals
  };
}

function classifyNode(node: FlowNode): {
  readonly requiresApproval: boolean;
  readonly blocked: boolean;
  readonly reason: string | null;
} {
  if ("approvalMode" in node) {
    if (node.approvalMode === "manual_approve" || node.approvalMode === "draft_only") {
      return { requiresApproval: true, blocked: false, reason: node.approvalMode };
    }
    if (node.approvalMode === "auto_send") {
      return { requiresApproval: false, blocked: true, reason: "auto_send_disabled" };
    }
    if (node.category === "action" && !internalSafeActionKinds.has(node.kind)) {
      return { requiresApproval: true, blocked: false, reason: "unsafe_external_action" };
    }
  }

  return { requiresApproval: false, blocked: false, reason: null };
}

function approvalKindForNode(node: FlowNode): FlowApprovalKind {
  if (node.category === "ai") return "ai_output";
  if (node.category === "action" && (node.kind === "request_payment" || node.kind === "offer_slot")) {
    return "payment_offer";
  }
  if (node.category === "action" && (node.kind === "send_message" || node.kind === "deliver_result")) {
    return "delivery";
  }
  return "manual_task";
}

function containsAutoSendNode(graph: FlowGraph): boolean {
  return graph.nodes.some((node) => "approvalMode" in node && node.approvalMode === "auto_send");
}

function orderedNodes(graph: FlowGraph): FlowNode[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const trigger = graph.nodes.find((node) => node.category === "trigger");
  if (!trigger) return graph.nodes;

  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const existing = outgoing.get(edge.fromNodeId) ?? [];
    existing.push(edge.toNodeId);
    outgoing.set(edge.fromNodeId, existing);
  }

  const ordered: FlowNode[] = [];
  const seen = new Set<string>();
  const pending = [trigger.id];
  while (pending.length > 0) {
    const nodeId = pending.shift();
    if (!nodeId || seen.has(nodeId)) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;
    seen.add(nodeId);
    ordered.push(node);
    pending.push(...(outgoing.get(nodeId) ?? []));
  }

  return ordered;
}
