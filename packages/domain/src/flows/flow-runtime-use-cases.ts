import type {
  DecideFlowApprovalRequest,
  ListFlowApprovalsQuery,
  ListFlowRunsQuery
} from "@elevenhouse/contracts";

import { throwFlowRuntimeExecutionUnavailable } from "./flow-runtime-availability";
import type { FlowApprovalRecord, FlowRuntimeStore } from "./flow-runtime-store";

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
