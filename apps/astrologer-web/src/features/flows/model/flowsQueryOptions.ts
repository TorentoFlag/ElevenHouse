import type {
  ActivateFlowVersionResponse,
  DeleteFlowDefinitionResponse,
  DecideFlowApprovalRequest,
  FlowDefinitionV2,
  ListFlowApprovalsQuery,
  ListFlowDefinitionsQueryInput,
  ListFlowRunsQuery,
  ListFlowRunsResponse,
  ListFlowWorkItemsQuery,
  CreateManualClientFlowRunResponse,
  CancelFlowRunResponse,
  PauseFlowEnrollmentResponse,
  PublishFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { activateFlow, type ActivateFlowInput } from "../api/activateFlow";
import { createFlow, type CreateFlowInput } from "../api/createFlow";
import { createNextFlowDraft, type CreateNextFlowDraftInput } from "../api/createNextFlowDraft";
import { createManualFlowRun, type CreateManualFlowRunInput } from "../api/createManualFlowRun";
import { cancelFlowRun, type CancelFlowRunInput } from "../api/cancelFlowRun";
import { completeFlowWorkItem, type CompleteFlowWorkItemInput } from "../api/completeFlowWorkItem";
import { decideFlowApproval, type DecideFlowApprovalInput } from "../api/decideFlowApproval";
import {
  archiveFlowDefinition,
  deleteFlowDefinition,
  duplicateFlowDefinition,
  restoreFlowDefinition,
  type DuplicateFlowDefinitionInput,
  type FlowDefinitionLifecycleInput
} from "../api/flowDefinitionLifecycle";
import { getFlowDefinition } from "../api/getFlowDefinition";
import { getFlowRun } from "../api/getFlowRun";
import { getFlowActivationReview } from "../api/getFlowActivationReview";
import { getFlowEnrollment } from "../api/getFlowEnrollment";
import { listFlowApprovals } from "../api/listFlowApprovals";
import { listFlowRuns } from "../api/listFlowRuns";
import { listFlowTemplates } from "../api/listFlowTemplates";
import { listFlowWorkItems } from "../api/listFlowWorkItems";
import { listFlows } from "../api/listFlows";
import { pauseFlowEnrollment, type PauseFlowEnrollmentInput } from "../api/pauseFlowEnrollment";
import { publishFlow, type PublishFlowInput } from "../api/publishFlow";
import { snoozeFlowWorkItem, type SnoozeFlowWorkItemInput } from "../api/snoozeFlowWorkItem";
import { startFlowWorkItem, type StartFlowWorkItemInput } from "../api/startFlowWorkItem";
import { updateFlowDraft, type UpdateFlowDraftInput } from "../api/updateFlowDraft";
import {
  validateFlowDefinition,
  type ValidateFlowDefinitionInput
} from "../api/validateFlowDefinition";

export const flowsQueryKeys = {
  all: () => ["flows"] as const,
  list: (query: ListFlowDefinitionsQueryInput) => ["flows", "list", query] as const,
  detail: (flowId: string | null) => ["flows", "detail", flowId] as const,
  run: (runId: string | null) => ["flows", "run", runId] as const,
  activationReview: (flowId: string | null, versionId: string | null) =>
    ["flows", "activation-review", flowId, versionId] as const,
  enrollment: (flowId: string | null) => ["flows", "enrollment", flowId] as const,
  templates: (locale: "ru" | "en") => ["flows", "templates", locale] as const,
  runs: (flowId: string, query: ListFlowRunsQuery) => ["flows", "runs", flowId, query] as const,
  approvals: (query: ListFlowApprovalsQuery) => ["flows", "approvals", query] as const,
  workItems: (query: ListFlowWorkItemsQuery) => ["flows", "work-items", query] as const
};

export function flowListQueryOptions(query: ListFlowDefinitionsQueryInput) {
  return {
    queryKey: flowsQueryKeys.list(query),
    queryFn: () => listFlows(query),
    placeholderData: keepPreviousData
  };
}

export function flowActivationReviewQueryOptions(flowId: string | null, versionId: string | null) {
  return {
    queryKey: flowsQueryKeys.activationReview(flowId, versionId),
    queryFn: () => {
      if (!flowId || !versionId) throw new Error("FLOW_ACTIVATION_REVIEW_TARGET_REQUIRED");
      return getFlowActivationReview({ flowId, versionId });
    },
    enabled: flowId !== null && versionId !== null,
    staleTime: 0,
    retry: false
  };
}

export function flowEnrollmentQueryOptions(flowId: string | null) {
  return {
    queryKey: flowsQueryKeys.enrollment(flowId),
    queryFn: () => {
      if (!flowId) throw new Error("FLOW_ENROLLMENT_ID_REQUIRED");
      return getFlowEnrollment(flowId);
    },
    enabled: flowId !== null,
    staleTime: 0,
    retry: false
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

export function flowRunQueryOptions(runId: string | null) {
  return {
    queryKey: flowsQueryKeys.run(runId),
    queryFn: () => {
      if (!runId) throw new Error("FLOW_RUN_ID_REQUIRED");
      return getFlowRun(runId);
    },
    enabled: runId !== null,
    staleTime: 0,
    retry: false
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

const flowRunRefreshIntervalMs = 5_000;
const flowOperatorQueueRefreshIntervalMs = 5_000;
const asynchronouslyTransitioningRunStatuses = new Set([
  "pending",
  "running",
  "waiting",
  "approval_required",
  "failed_retryable"
]);

type FlowRunWithStatus = Pick<ListFlowRunsResponse["runs"][number], "status">;

export function flowRunRefreshInterval(run: FlowRunWithStatus | undefined): number | false {
  return run && asynchronouslyTransitioningRunStatuses.has(run.status)
    ? flowRunRefreshIntervalMs
    : false;
}

export function flowRunsRefreshInterval(
  data: Pick<ListFlowRunsResponse, "runs"> | undefined
): number | false {
  return data?.runs.some((run) => flowRunRefreshInterval(run) !== false)
    ? flowRunRefreshIntervalMs
    : false;
}

/**
 * Approvals and work items may appear or change while their successful queue is
 * empty, so the operator surface keeps a foreground read fresh. A failed read
 * remains explicit and requires the existing manual retry instead of looping.
 */
export function flowOperatorQueueRefreshInterval(
  queryStatus: "pending" | "error" | "success"
): number | false {
  return queryStatus === "success" ? flowOperatorQueueRefreshIntervalMs : false;
}

export function flowApprovalsQueryOptions(query: ListFlowApprovalsQuery) {
  return {
    queryKey: flowsQueryKeys.approvals(query),
    queryFn: () => listFlowApprovals(query),
    placeholderData: keepPreviousData
  };
}

export function flowWorkItemsQueryOptions(query: ListFlowWorkItemsQuery) {
  return {
    queryKey: flowsQueryKeys.workItems(query),
    queryFn: () => listFlowWorkItems(query),
    staleTime: 0,
    retry: false
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

export function archiveFlowDefinitionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: FlowDefinitionLifecycleInput) => archiveFlowDefinition(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function restoreFlowDefinitionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: FlowDefinitionLifecycleInput) => restoreFlowDefinition(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function duplicateFlowDefinitionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: DuplicateFlowDefinitionInput) => duplicateFlowDefinition(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function deleteFlowDefinitionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: FlowDefinitionLifecycleInput) => deleteFlowDefinition(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function activateFlowMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (input: ActivateFlowInput) => activateFlow(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function pauseFlowEnrollmentMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: PauseFlowEnrollmentInput) => pauseFlowEnrollment(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
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

export function cancelFlowRunMutationOptions(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return {
    mutationFn: (input: CancelFlowRunInput) => cancelFlowRun(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
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

export function startFlowWorkItemMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: StartFlowWorkItemInput) => startFlowWorkItem(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function snoozeFlowWorkItemMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: SnoozeFlowWorkItemInput) => snoozeFlowWorkItem(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

export function completeFlowWorkItemMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: CompleteFlowWorkItemInput) => completeFlowWorkItem(input),
    onSuccess: () => invalidateFlows(queryClient),
    retry: false
  };
}

function invalidateFlows(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: flowsQueryKeys.all() });
}

export type FlowMutationResult =
  | ActivateFlowVersionResponse
  | PauseFlowEnrollmentResponse
  | FlowDefinitionV2
  | DeleteFlowDefinitionResponse
  | PublishFlowDefinitionResponse
  | CreateManualClientFlowRunResponse
  | CancelFlowRunResponse
  | { readonly approval: { readonly status: DecideFlowApprovalRequest["decision"] } };
