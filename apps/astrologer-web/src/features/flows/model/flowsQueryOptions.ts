import type {
  CreateFlowRequest,
  DecideFlowApprovalRequest,
  FlowResponse,
  ListFlowApprovalsQuery,
  ListFlowsQuery,
  ListFlowRunsQuery,
  ManualFlowRunResponse,
  PublishFlowResponse
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { activateFlow } from "../api/activateFlow";
import { createFlow } from "../api/createFlow";
import { createManualFlowRun, type CreateManualFlowRunInput } from "../api/createManualFlowRun";
import { decideFlowApproval, type DecideFlowApprovalInput } from "../api/decideFlowApproval";
import { listFlowApprovals } from "../api/listFlowApprovals";
import { listFlowRuns } from "../api/listFlowRuns";
import { listFlowTemplates } from "../api/listFlowTemplates";
import { listFlows } from "../api/listFlows";
import { pauseFlow } from "../api/pauseFlow";
import { publishFlow } from "../api/publishFlow";
import { simulateFlowRun, type SimulateFlowRunInput } from "../api/simulateFlowRun";
import { updateFlowDraft, type UpdateFlowDraftInput } from "../api/updateFlowDraft";

export const flowsQueryKeys = {
  all: () => ["flows"] as const,
  list: (query: ListFlowsQuery) => ["flows", "list", query] as const,
  templates: () => ["flows", "templates"] as const,
  runs: (flowId: string, query: ListFlowRunsQuery) => ["flows", "runs", flowId, query] as const,
  approvals: (query: ListFlowApprovalsQuery) => ["flows", "approvals", query] as const
};

export function flowListQueryOptions(query: ListFlowsQuery) {
  return {
    queryKey: flowsQueryKeys.list(query),
    queryFn: () => listFlows(query),
    placeholderData: keepPreviousData
  };
}

export function flowTemplatesQueryOptions() {
  return {
    queryKey: flowsQueryKeys.templates(),
    queryFn: () => listFlowTemplates()
  };
}

export function flowRunsQueryOptions(flowId: string, query: ListFlowRunsQuery) {
  return {
    queryKey: flowsQueryKeys.runs(flowId, query),
    queryFn: () => listFlowRuns({ flowId, query })
  };
}

export function flowApprovalsQueryOptions(query: ListFlowApprovalsQuery) {
  return {
    queryKey: flowsQueryKeys.approvals(query),
    queryFn: () => listFlowApprovals(query),
    placeholderData: keepPreviousData
  };
}

export function createFlowMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (body: CreateFlowRequest) => createFlow(body),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function updateFlowDraftMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: UpdateFlowDraftInput) => updateFlowDraft(input),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function publishFlowMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (flowId: string) => publishFlow(flowId),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function activateFlowMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (flowId: string) => activateFlow(flowId),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function pauseFlowMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (flowId: string) => pauseFlow(flowId),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function simulateFlowRunMutationOptions() {
  return {
    mutationFn: (input: SimulateFlowRunInput) => simulateFlowRun(input)
  };
}

export function createManualFlowRunMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: CreateManualFlowRunInput) => createManualFlowRun(input),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function decideFlowApprovalMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: DecideFlowApprovalInput) => decideFlowApproval(input),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

function invalidateFlows(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: flowsQueryKeys.all() });
}

export type FlowMutationResult =
  | FlowResponse
  | PublishFlowResponse
  | ManualFlowRunResponse
  | { readonly approval: { readonly status: DecideFlowApprovalRequest["decision"] } };
