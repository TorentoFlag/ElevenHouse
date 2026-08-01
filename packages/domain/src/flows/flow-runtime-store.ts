import type {
  FlowApproval,
  FlowApprovalDecision,
  FlowApprovalKind,
  FlowApprovalStatus,
  FlowRuntimeEvent,
  FlowRuntimeEventSource,
  FlowRunResponse,
  FlowRunSnapshot,
  FlowRunStatus,
  FlowRunSubjectType,
  FlowStepRunResponse,
  FlowStepRunStatus
} from "@elevenhouse/contracts";

import type { FlowSuppressionReason } from "./flow-eligibility";

export type FlowRuntimeEventRecord = FlowRuntimeEvent;
export type FlowRunRecord = FlowRunResponse;
export type FlowStepRunRecord = FlowStepRunResponse;
export type FlowApprovalRecord = FlowApproval;
export type FlowDeliveryAttemptStatus = "pending" | "sent" | "failed" | "unknown";

export type FlowSuppressionRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly runtimeEventId: string;
  readonly flowRunId: string | null;
  readonly reason: FlowSuppressionReason;
  readonly details: Record<string, unknown>;
  readonly createdAt: string;
};

export type CreateFlowRuntimeEventInput = {
  readonly ownerUserId: string;
  readonly source: FlowRuntimeEventSource;
  readonly sourceEventId: string;
  readonly dedupeKey: string;
  readonly subjectType: FlowRunSubjectType;
  readonly subjectId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
};

export type FindFlowRuntimeEventByDedupeKeyInput = {
  readonly ownerUserId: string;
  readonly dedupeKey: string;
};

export type FindFlowRunByEventAndFlowInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly runtimeEventId: string;
};

export type FindFlowRunByIdInput = {
  readonly ownerUserId: string;
  readonly runId: string;
};

export type CreateFlowRunStepInput = {
  readonly nodeId: string;
  readonly status: FlowStepRunStatus;
  readonly inputSnapshot: Record<string, unknown>;
  readonly outputSnapshot: Record<string, unknown> | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
};

export type CreateFlowRunApprovalInput = {
  readonly stepNodeId: string | null;
  readonly kind: FlowApprovalKind;
  readonly title: string;
  readonly preview: string;
};

export type CreateFlowRunInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly runtimeEventId: string;
  readonly sourceEventId: string;
  readonly status: FlowRunStatus;
  readonly snapshot: FlowRunSnapshot;
  readonly currentNodeId: string | null;
  readonly now: string;
  readonly stepRuns: readonly CreateFlowRunStepInput[];
  readonly approvals: readonly CreateFlowRunApprovalInput[];
};

export type CreateFlowRunResult = {
  readonly run: FlowRunRecord;
  readonly stepRuns: readonly FlowStepRunRecord[];
  readonly approvals: readonly FlowApprovalRecord[];
};

export type CreateFlowRunForEventDedupeInput = {
  readonly event: CreateFlowRuntimeEventInput;
  readonly run: Omit<CreateFlowRunInput, "ownerUserId" | "runtimeEventId" | "sourceEventId">;
  readonly suppression?: Pick<CreateFlowSuppressionInput, "reason" | "details">;
};

export type CreateFlowRunForEventDedupeResult = CreateFlowRunResult & {
  readonly status: "created" | "duplicate";
  readonly event: FlowRuntimeEventRecord;
  readonly suppression?: FlowSuppressionRecord | null;
};

export type CreateFlowSuppressionInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly runtimeEventId: string;
  readonly flowRunId: string | null;
  readonly reason: FlowSuppressionReason;
  readonly details: Record<string, unknown>;
  readonly createdAt: string;
};

export type FindFlowSuppressionByRunInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly runtimeEventId: string;
  readonly flowRunId: string;
};

export type CreateFlowDeliveryAttemptInput = {
  readonly ownerUserId: string;
  readonly flowRunId: string;
  readonly flowStepRunId: string;
  readonly idempotencyKey: string;
  readonly attemptNumber: number;
  readonly provider?: string | null;
  readonly status: FlowDeliveryAttemptStatus;
  readonly providerRequestPayload?: Record<string, unknown> | null;
  readonly providerResponsePayload?: Record<string, unknown> | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly attemptedAt?: string | null;
  readonly createdAt: string;
};

export type FlowRunStoreListInput = {
  readonly ownerUserId: string;
  readonly flowId?: string;
  readonly status: FlowRunStatus | "all";
  readonly limit: number;
  readonly offset: number;
};

export type FlowApprovalStoreListInput = {
  readonly ownerUserId: string;
  readonly status: FlowApprovalStatus | "all";
  readonly limit: number;
  readonly offset: number;
};

export type DecideFlowApprovalStoreInput = {
  readonly ownerUserId: string;
  readonly approvalId: string;
  readonly decidedByUserId: string;
  readonly decision: FlowApprovalDecision;
  readonly note?: string;
  readonly now: string;
  readonly snoozedUntil?: string;
};

export type CancelFlowRunStoreInput = {
  readonly ownerUserId: string;
  readonly runId: string;
  readonly now: string;
};

export type FlowRuntimeStore = {
  readonly createEvent: (input: CreateFlowRuntimeEventInput) => Promise<FlowRuntimeEventRecord>;
  readonly findEventByDedupeKey: (
    input: FindFlowRuntimeEventByDedupeKeyInput
  ) => Promise<FlowRuntimeEventRecord | null>;
  readonly findRunByEventAndFlow: (
    input: FindFlowRunByEventAndFlowInput
  ) => Promise<FlowRunRecord | null>;
  readonly findRunById: (input: FindFlowRunByIdInput) => Promise<FlowRunRecord | null>;
  readonly cancelRun: (input: CancelFlowRunStoreInput) => Promise<FlowRunRecord | null>;
  readonly createRun: (input: CreateFlowRunInput) => Promise<CreateFlowRunResult>;
  readonly createRunForEventDedupe: (
    input: CreateFlowRunForEventDedupeInput
  ) => Promise<CreateFlowRunForEventDedupeResult>;
  readonly createSuppression: (input: CreateFlowSuppressionInput) => Promise<FlowSuppressionRecord>;
  readonly findSuppressionByRun: (
    input: FindFlowSuppressionByRunInput
  ) => Promise<FlowSuppressionRecord | null>;
  readonly createDeliveryAttempt: (input: CreateFlowDeliveryAttemptInput) => Promise<void>;
  readonly listRuns: (
    input: FlowRunStoreListInput
  ) => Promise<{ readonly runs: readonly FlowRunRecord[]; readonly total: number }>;
  readonly listApprovals: (
    input: FlowApprovalStoreListInput
  ) => Promise<{ readonly approvals: readonly FlowApprovalRecord[]; readonly total: number }>;
  readonly decideApproval: (
    input: DecideFlowApprovalStoreInput
  ) => Promise<FlowApprovalRecord | null>;
};
