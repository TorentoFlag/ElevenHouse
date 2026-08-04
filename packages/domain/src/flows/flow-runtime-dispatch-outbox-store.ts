export const flowRuntimeDispatchOutboxReasonValues = [
  "FLOW_RUNTIME_DISPATCH_EVENT_TYPE_UNSUPPORTED",
  "FLOW_RUNTIME_DISPATCH_PAYLOAD_INVALID",
  "FLOW_RUNTIME_DISPATCH_AGGREGATE_MISMATCH",
  "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE",
  "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED"
] as const;

export type FlowRuntimeDispatchOutboxReason =
  (typeof flowRuntimeDispatchOutboxReasonValues)[number];

export type ClaimedFlowRuntimeDispatchOutboxEvent = {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly claimFence: bigint;
};

export type FlowRuntimeDispatchOutboxDispositionResult =
  | { readonly status: "applied" }
  | { readonly status: "stale" };

export type FlowRuntimeDispatchOutboxQuarantineNotice = {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly attempts: number;
  readonly reasonCode: FlowRuntimeDispatchOutboxReason;
};

export type FlowRuntimeDispatchOutboxClaimBatch = {
  readonly claimed: readonly ClaimedFlowRuntimeDispatchOutboxEvent[];
  readonly quarantined: readonly FlowRuntimeDispatchOutboxQuarantineNotice[];
};

export type FlowRuntimeDispatchOutboxStore = {
  readonly claimBatch: (input: {
    readonly limit: number;
    readonly publishingLockTimeoutMs: number;
    readonly maxAttempts: number;
  }) => Promise<FlowRuntimeDispatchOutboxClaimBatch>;
  readonly markPublished: (input: {
    readonly eventId: string;
    readonly claimFence: bigint;
  }) => Promise<FlowRuntimeDispatchOutboxDispositionResult>;
  readonly markRetry: (input: {
    readonly eventId: string;
    readonly claimFence: bigint;
    readonly retryDelayMs: number;
    readonly reasonCode: FlowRuntimeDispatchOutboxReason;
  }) => Promise<FlowRuntimeDispatchOutboxDispositionResult>;
  readonly markQuarantined: (input: {
    readonly eventId: string;
    readonly claimFence: bigint;
    readonly reasonCode: FlowRuntimeDispatchOutboxReason;
  }) => Promise<FlowRuntimeDispatchOutboxDispositionResult>;
};
