import type {
  ChartCalculationMethod,
  ChartExecutionProfile,
  ChartInterpretationMode,
  ChartMethodVersion,
  ReproducibleChartResult
} from "@elevenhouse/contracts";
export type {
  ChartCalculationMethod,
  ChartExecutionProfile,
  ChartInterpretationMode,
  ChartMethodVersion
} from "@elevenhouse/contracts";

export type ChartJobStatus = "queued" | "processing" | "succeeded" | "failed";
export const CHART_CALCULATION_REQUESTED_EVENT = "chart.calculation.requested.v1";
export const DEFAULT_CHART_JOB_MAX_ATTEMPTS = 3;

export type ChartCalculationParticipant = {
  readonly role: "subject" | "partner";
  readonly clientId: string;
};

export type ChartJobLease = {
  readonly lockedBy: string;
  readonly leaseGeneration: number;
  readonly lockedUntil: string;
};

export type ChartCalculationJob = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly interpretationMode: ChartInterpretationMode;
  readonly resultCalculationId: string | null;
  readonly targetCalculationId: string | null;
  readonly expectedSourceChecksum: string | null;
  readonly method: ChartCalculationMethod;
  readonly status: ChartJobStatus;
  readonly inputFingerprint: string;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
};

export type CreateOrReuseChartJobInput = {
  readonly method: ChartCalculationMethod;
  readonly methodVersion: ChartMethodVersion;
  readonly executionProfile: ChartExecutionProfile;
  readonly interpretationMode: ChartInterpretationMode;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly participants: readonly ChartCalculationParticipant[];
  readonly maxAttempts: number;
  readonly targetCalculationId: string | null;
  readonly expectedSourceChecksum: string | null;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
};
export type CreateOrReuseNatalJobInput = Omit<CreateOrReuseChartJobInput, "method">;

export type CreateOrReuseChartJobResult =
  | {
      readonly kind: "existing_result";
      readonly calculationId: string;
      readonly result: ReproducibleChartResult;
    }
  | { readonly kind: "active_job"; readonly jobId: string };
export type CreateOrReuseNatalJobResult = CreateOrReuseChartJobResult;

export type ChartCalculationRequestedPayload = {
  readonly jobId: string;
};

export type ChartCalculationJobStore = {
  readonly createOrReuseChartJob: (
    input: CreateOrReuseChartJobInput
  ) => Promise<CreateOrReuseChartJobResult>;
  readonly createOrReuseNatalJob: (
    input: CreateOrReuseNatalJobInput
  ) => Promise<CreateOrReuseNatalJobResult>;
  readonly getOwnerScopedJob: (input: {
    readonly ownerUserId: string;
    readonly jobId: string;
  }) => Promise<ChartCalculationJob | null>;
  readonly getOwnerScopedResult: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<unknown | null>;
};

export type ChartCalculationCommandStore = {
  readonly createOrReuseChartJobAndRequestCalculation: (
    input: CreateOrReuseChartJobInput & { readonly now: string }
  ) => Promise<CreateOrReuseChartJobResult>;
  readonly createOrReuseNatalJobAndRequestCalculation: (
    input: CreateOrReuseNatalJobInput & { readonly now: string }
  ) => Promise<CreateOrReuseNatalJobResult>;
};

export type ChartJobForProcessing = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly interpretationMode: ChartInterpretationMode;
  readonly method: ChartCalculationMethod;
  readonly methodVersion: ChartMethodVersion;
  readonly executionProfile: ChartExecutionProfile;
  readonly status: "processing";
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
  readonly participants: readonly ChartCalculationParticipant[];
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly targetCalculationId: string | null;
  readonly expectedSourceChecksum: string | null;
  readonly lease: ChartJobLease;
};

export type ClaimChartJobOutcome =
  | { readonly kind: "claimed"; readonly job: ChartJobForProcessing }
  | {
      readonly kind: "exhausted";
      readonly jobId: string;
      readonly attempts: number;
      readonly maxAttempts: number;
    }
  | { readonly kind: "not_claimable" };

export type ChartJobAttemptFailureOutcome =
  | { readonly kind: "requeued"; readonly attempts: number; readonly maxAttempts: number }
  | { readonly kind: "failed"; readonly attempts: number; readonly maxAttempts: number };

export type ChartJobDeliveryState = {
  readonly kind: ChartJobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
};

export type ChartJobProcessingStore = {
  readonly getPreClaimExecutionProfile: (jobId: string) => Promise<unknown | null>;
  readonly getDeliveryState: (jobId: string) => Promise<ChartJobDeliveryState | null>;
  readonly getQueueDispatch: (jobId: string) => Promise<{
    readonly jobId: string;
    readonly attempts: number;
    readonly maxAttempts: number;
  } | null>;
  readonly claimForProcessing: (input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseMs: number;
  }) => Promise<ClaimChartJobOutcome>;
  readonly extendLease: (input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseGeneration: number;
    readonly leaseMs: number;
  }) => Promise<ChartJobLease | null>;
  readonly complete: (input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseGeneration: number;
    readonly result: unknown;
    readonly resultChecksum: string;
  }) => Promise<boolean>;
  readonly recordAttemptFailure: (input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseGeneration: number;
    readonly code: string;
    readonly reason: string;
    readonly disposition: "retryable" | "permanent";
    readonly retryDelayMs: number;
  }) => Promise<ChartJobAttemptFailureOutcome | null>;
  readonly recoverExpired: (input: { readonly limit: number }) => Promise<{
    readonly requeuedJobIds: readonly string[];
    readonly failedJobIds: readonly string[];
  }>;
  readonly recoverPendingDeliveries: (input: { readonly limit: number }) => Promise<{
    readonly rearmedJobIds: readonly string[];
  }>;
};
