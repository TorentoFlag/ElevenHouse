export const flowRuntimeDispatchOutboxReasonValues = [
  "FLOW_RUNTIME_DISPATCH_EVENT_TYPE_UNSUPPORTED",
  "FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE",
  "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED",
  "FLOW_BOOKING_ENROLLMENT_DEFERRED",
  "FLOW_BOOKING_ENROLLMENT_PAYLOAD_INVALID",
  "FLOW_BOOKING_ENROLLMENT_AGGREGATE_MISMATCH",
  "FLOW_BOOKING_ENROLLMENT_PROVENANCE_INVALID",
  "FLOW_BOOKING_ENROLLMENT_PROVENANCE_CONFLICT",
  "FLOW_BOOKING_ENROLLMENT_EVENT_TIME_INVALID",
  "FLOW_BOOKING_ENROLLMENT_SUBJECT_UNAVAILABLE",
  "FLOW_BOOKING_ENROLLMENT_AUTHORITY_INVALID",
  "FLOW_BOOKING_ENROLLMENT_PINNED_DEFINITION_INVALID",
  "FLOW_BOOKING_LIFECYCLE_DEFERRED",
  "FLOW_BOOKING_LIFECYCLE_PAYLOAD_INVALID",
  "FLOW_BOOKING_LIFECYCLE_AGGREGATE_MISMATCH",
  "FLOW_BOOKING_LIFECYCLE_DIGEST_INVALID",
  "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT",
  "FLOW_BOOKING_LIFECYCLE_PROVENANCE_INVALID",
  "FLOW_BOOKING_LIFECYCLE_STALE_WITHOUT_RECEIPT",
  "FLOW_BOOKING_LIFECYCLE_TRANSITION_INVALID",
  "FLOW_BOOKING_LIFECYCLE_EVENT_UNAVAILABLE",
    "FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID",
    "FLOW_BOOKING_LIFECYCLE_SOURCE_CHAIN_INVALID",
    "FLOW_CHART_TERMINAL_PAYLOAD_INVALID",
  "FLOW_CHART_TERMINAL_AGGREGATE_MISMATCH",
  "FLOW_MESSAGING_DELIVERY_TERMINAL_PAYLOAD_INVALID",
  "FLOW_MESSAGING_DELIVERY_TERMINAL_AGGREGATE_MISMATCH",
    "FLOW_BIRTH_PROFILE_RECHECK_PAYLOAD_INVALID",
    "FLOW_BIRTH_PROFILE_RECHECK_AGGREGATE_MISMATCH",
    "FLOW_BIRTH_PROFILE_RECHECK_INTEGRITY_INVALID"
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
  readonly markDeferred: (input: {
    readonly eventId: string;
    readonly claimFence: bigint;
    readonly retryDelayMs: number;
    readonly reasonCode:
      | "FLOW_BOOKING_ENROLLMENT_DEFERRED"
      | "FLOW_BOOKING_LIFECYCLE_DEFERRED";
  }) => Promise<FlowRuntimeDispatchOutboxDispositionResult>;
  readonly markQuarantined: (input: {
    readonly eventId: string;
    readonly claimFence: bigint;
    readonly reasonCode: FlowRuntimeDispatchOutboxReason;
  }) => Promise<FlowRuntimeDispatchOutboxDispositionResult>;
};
