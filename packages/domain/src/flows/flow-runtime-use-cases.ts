import type {
  DecideFlowApprovalRequest,
  FlowRuntimeEventSource,
  FlowRunSubjectType,
  FlowTriggerKind,
  ListFlowApprovalsQuery,
  ListFlowRunsQuery,
  SimulateFlowRunRequest,
  SimulateFlowRunResponse
} from "@elevenhouse/contracts";

import {
  FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
  throwFlowRuntimeExecutionUnavailable
} from "./flow-runtime-availability";
import type { FlowStore } from "./flow-store";
import type {
  FlowApprovalRecord,
  FlowRuntimeEventRecord,
  FlowRuntimeStore,
  FlowRunRecord,
  FlowStepRunRecord
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

export type DispatchFlowRuntimeEventResult =
  | {
      readonly status: "no_matching_flow";
      readonly matchedFlows: 0;
      readonly total: 0;
      readonly results: readonly [];
    }
  | {
      readonly status: "execution_unavailable";
      readonly matchedFlows: number;
      readonly reasonCode: typeof FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE;
      readonly total: 0;
      readonly results: readonly [];
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

export type CancelFlowRunInput = {
  readonly runtimeStore: FlowRuntimeStore;
  readonly ownerUserId: string;
  readonly runId: string;
  readonly now: string;
};

export async function simulateFlowRun(
  input: SimulateFlowRunInput
): Promise<SimulateFlowRunResponse | null> {
  const loaded = await loadRunnableFlow(input);
  if (!loaded) return null;
  throwFlowRuntimeExecutionUnavailable();
}

export async function createManualFlowRun(
  input: CreateManualFlowRunInput
): Promise<CreateManualFlowRunResult | null> {
  const loaded = await loadRunnableFlow(input);
  if (!loaded) return null;
  throwFlowRuntimeExecutionUnavailable();
}

export async function dispatchFlowRuntimeEvent(
  input: DispatchFlowRuntimeEventInput
): Promise<DispatchFlowRuntimeEventResult> {
  const flows = await input.flowStore.listActiveByTriggerKind({
    ownerUserId: input.ownerUserId,
    triggerKind: input.triggerKind
  });
  if (flows.length > 0) {
    return {
      status: "execution_unavailable",
      matchedFlows: flows.length,
      reasonCode: FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
      total: 0,
      results: []
    };
  }

  return {
    status: "no_matching_flow",
    matchedFlows: 0,
    total: 0,
    results: []
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

export async function decideFlowApproval(
  input: DecideFlowApprovalInput
): Promise<FlowApprovalRecord | null> {
  void input;
  throwFlowRuntimeExecutionUnavailable();
}

export async function cancelFlowRun(input: CancelFlowRunInput): Promise<FlowRunRecord | null> {
  void input;
  throwFlowRuntimeExecutionUnavailable();
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
