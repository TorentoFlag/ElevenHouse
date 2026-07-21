export type ChartCalculationMethod = "natal";
export type ChartJobStatus = "queued" | "processing" | "succeeded" | "failed";
export const CHART_CALCULATION_REQUESTED_EVENT = "chart.calculation.requested.v1";

export type ChartCalculationJob = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly resultCalculationId: string | null;
  readonly method: ChartCalculationMethod;
  readonly status: ChartJobStatus;
  readonly inputFingerprint: string;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
};

export type CreateOrReuseNatalJobInput = {
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
};

export type CreateOrReuseNatalJobResult =
  | { readonly kind: "existing_result"; readonly calculationId: string }
  | { readonly kind: "active_job"; readonly jobId: string };

export type ChartCalculationRequestedPayload = {
  readonly jobId: string;
};

export type ChartCalculationJobStore = {
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
  readonly createOrReuseNatalJobAndRequestCalculation: (
    input: CreateOrReuseNatalJobInput & { readonly now: string }
  ) => Promise<CreateOrReuseNatalJobResult>;
};

export type ChartJobForProcessing = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly status: ChartJobStatus;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
};

export type ChartJobProcessingStore = {
  readonly findByJobId: (jobId: string) => Promise<ChartJobForProcessing | null>;
  readonly claimForProcessing: (input: {
    readonly jobId: string;
    readonly now: string;
  }) => Promise<ChartJobForProcessing | null>;
  readonly complete: (input: {
    readonly jobId: string;
    readonly result: unknown;
    readonly resultChecksum: string;
    readonly now: string;
  }) => Promise<boolean>;
  readonly fail: (input: {
    readonly jobId: string;
    readonly code: string;
    readonly reason: string;
    readonly now: string;
  }) => Promise<boolean>;
};
