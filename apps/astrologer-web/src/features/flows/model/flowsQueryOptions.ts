import type {
  DecideFlowApprovalRequest,
  FlowDefinitionV2,
  FlowResponse,
  ListFlowApprovalsQuery,
  ListFlowDefinitionsV2QueryInput,
  ListFlowRunsQuery,
  ManualFlowRunResponse,
  PublishFlowDefinitionV2Response
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { activateFlow } from "../api/activateFlow";
import { createFlow, type CreateFlowInput } from "../api/createFlow";
import { createNextFlowDraft, type CreateNextFlowDraftInput } from "../api/createNextFlowDraft";
import { createManualFlowRun, type CreateManualFlowRunInput } from "../api/createManualFlowRun";
import { decideFlowApproval, type DecideFlowApprovalInput } from "../api/decideFlowApproval";
import { getFlowDefinition } from "../api/getFlowDefinition";
import { listFlowApprovals } from "../api/listFlowApprovals";
import { listFlowRuns } from "../api/listFlowRuns";
import { listFlowTemplates } from "../api/listFlowTemplates";
import { listFlows } from "../api/listFlows";
import {
  migrateFlowDefinition,
  type MigrateFlowDefinitionInput
} from "../api/migrateFlowDefinition";
import { pauseFlow } from "../api/pauseFlow";
import { publishFlow, type PublishFlowInput } from "../api/publishFlow";
import { simulateFlowRun, type SimulateFlowRunInput } from "../api/simulateFlowRun";
import { updateFlowDraft, type UpdateFlowDraftInput } from "../api/updateFlowDraft";
import {
  validateFlowDefinition,
  type ValidateFlowDefinitionInput
} from "../api/validateFlowDefinition";

export const flowsQueryKeys = {
  all: () => ["flows"] as const,
  list: (query: ListFlowDefinitionsV2QueryInput) => ["flows", "list", query] as const,
  detail: (flowId: string | null) => ["flows", "detail", flowId] as const,
  templates: (locale: "ru" | "en") => ["flows", "templates", locale] as const,
  runs: (flowId: string, query: ListFlowRunsQuery) => ["flows", "runs", flowId, query] as const,
  approvals: (query: ListFlowApprovalsQuery) => ["flows", "approvals", query] as const
};

export function flowListQueryOptions(query: ListFlowDefinitionsV2QueryInput) {
  return {
    queryKey: flowsQueryKeys.list(query),
    queryFn: () => listFlows(query),
    placeholderData: keepPreviousData
  };
}

export function flowDefinitionQueryOptions(flowId: string | null) {
  return {
    queryKey: flowsQueryKeys.detail(flowId),
    queryFn: () => {
      if (!flowId) throw new Error("FLOW_DEFINITION_ID_REQUIRED");
      return getFlowDefinition(flowId);
    },
    enabled: flowId !== null
  };
}

export function flowTemplatesQueryOptions(locale: "ru" | "en") {
  return {
    queryKey: flowsQueryKeys.templates(locale),
    queryFn: () => listFlowTemplates(locale)
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
    mutationFn: (input: CreateFlowInput) => createFlow(input),
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
    mutationFn: (input: PublishFlowInput) => publishFlow(input),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function createNextFlowDraftMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: CreateNextFlowDraftInput) => createNextFlowDraft(input),
    onSuccess: () => invalidateFlows(queryClient)
  };
}

export function migrateFlowDefinitionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: MigrateFlowDefinitionInput) => migrateFlowDefinition(input),
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

export function validateFlowDefinitionMutationOptions() {
  return {
    mutationFn: (input: ValidateFlowDefinitionInput) => validateFlowDefinition(input)
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
  | FlowDefinitionV2
  | PublishFlowDefinitionV2Response
  | ManualFlowRunResponse
  | { readonly approval: { readonly status: DecideFlowApprovalRequest["decision"] } };
