import type {
  FlowExecutionClaim,
  FlowExecutionDecision,
  FlowExecutionFailure,
  FlowExecutionFailureReasonCode,
  FlowNodeExecutorKey
} from "./flow-execution-interpreter";

export type FlowExecutionRetryPolicySnapshot = {
  readonly key: "flow-execution-retry.v1";
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
};

export const flowExecutionRetryPolicyV1 = {
  key: "flow-execution-retry.v1",
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000
} as const satisfies FlowExecutionRetryPolicySnapshot;

export type FlowExecutionFailureDisposition = "retry_scheduled" | "failed_terminal" | "quarantined";

export type FlowExecutionClaimNextResult =
  | { readonly status: "claimed"; readonly claim: FlowExecutionClaim }
  | {
      readonly status: "quarantined";
      readonly tokenId: string;
      readonly runId: string;
      readonly attemptId: null;
      readonly traceSequence: bigint;
      readonly reasonCode: FlowExecutionFailureReasonCode;
    };

export type FlowExecutionFinalizeResult =
  | {
      readonly status: "applied";
      readonly attemptId: string;
      readonly traceSequence: bigint;
    }
  | { readonly status: "stale" };

export type FlowExecutionFailureFinalizeResult =
  | {
      readonly status: "applied";
      readonly disposition: FlowExecutionFailureDisposition;
      readonly attemptId: string;
      readonly traceSequence: bigint;
      readonly availableAt: string | null;
    }
  | { readonly status: "stale" };

export type FlowExecutionRecoveryResult = {
  readonly recoveredCount: number;
  readonly retryScheduledCount: number;
  readonly failedTerminalCount: number;
  readonly quarantinedCount: number;
};

export type FlowExecutionTokenDetail = {
  readonly id: string;
  readonly nodeId: string;
  readonly executorKey: FlowNodeExecutorKey;
  readonly state: string;
  readonly nodeActivationSequence: bigint;
  readonly attemptCounter: bigint;
  readonly fencingToken: bigint;
  readonly retryPolicy: FlowExecutionRetryPolicySnapshot;
  readonly failureDisposition: FlowExecutionFailureDisposition | null;
  readonly failureReasonCode: FlowExecutionFailureReasonCode | null;
  readonly availableAt: string;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly terminalAt: string | null;
  readonly quarantinedAt: string | null;
};

export type FlowExecutionAttemptDetail = {
  readonly id: string;
  readonly nodeId: string;
  readonly executorKey: FlowNodeExecutorKey;
  readonly nodeActivationSequence: bigint;
  readonly attemptNumber: bigint;
  readonly fencingToken: bigint;
  readonly leaseOwner: string;
  readonly outcome: string;
  readonly resultCode: string;
  readonly traceSummary: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly completedAt: string;
};

export type FlowRunEventDetail = {
  readonly id: string;
  readonly sequence: bigint;
  readonly eventType: string;
  readonly nodeId: string | null;
  readonly attemptId: string | null;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
};

export type FlowExecutionRunDetail = {
  readonly runId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly graphSchemaVersion: "flow-graph.v2";
  readonly status: string;
  readonly currentNodeId: string | null;
  readonly traceSequence: bigint;
  readonly token: FlowExecutionTokenDetail;
  readonly attempts: readonly FlowExecutionAttemptDetail[];
  readonly events: readonly FlowRunEventDetail[];
};

export type FlowExecutionStore = {
  readonly claimNext: (input: {
    readonly leaseOwner: string;
    readonly leaseDurationMs: number;
    readonly executorKeys: readonly FlowNodeExecutorKey[];
  }) => Promise<FlowExecutionClaimNextResult | null>;
  readonly finalize: (input: {
    readonly claim: FlowExecutionClaim;
    readonly decision: FlowExecutionDecision;
  }) => Promise<FlowExecutionFinalizeResult>;
  readonly finalizeFailure: (input: {
    readonly claim: FlowExecutionClaim;
    readonly failure: FlowExecutionFailure;
  }) => Promise<FlowExecutionFailureFinalizeResult>;
  readonly recoverExpired: (input: {
    readonly limit: number;
  }) => Promise<FlowExecutionRecoveryResult>;
  readonly getRunDetail: (input: {
    readonly ownerUserId: string;
    readonly runId: string;
  }) => Promise<FlowExecutionRunDetail | null>;
};
