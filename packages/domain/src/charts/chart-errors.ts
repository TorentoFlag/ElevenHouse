export type ChartBirthDataReadinessErrorCode =
  | "CHART_BIRTH_DATE_REQUIRED"
  | "CHART_BIRTH_DATE_INVALID"
  | "CHART_BIRTH_TIME_REQUIRED"
  | "CHART_BIRTH_TIME_INVALID"
  | "CHART_BIRTH_TIMEZONE_REQUIRED"
  | "CHART_BIRTH_TIMEZONE_INVALID"
  | "CHART_BIRTH_TIME_DST_OCCURRENCE_REQUIRED"
  | "CHART_BIRTH_TIME_NONEXISTENT"
  | "CHART_BIRTH_COORDINATES_REQUIRED";

export class ChartBirthDataReadinessError extends Error {
  constructor(readonly code: ChartBirthDataReadinessErrorCode) {
    super(code);
    this.name = "ChartBirthDataReadinessError";
  }
}

export class ChartExecutionProfileError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ChartExecutionProfileError";
  }
}

export class ChartStoredResultIntegrityError extends Error {
  readonly code = "CHART_STORED_RESULT_INTEGRITY_INVALID" as const;

  constructor() {
    super("Stored chart result failed integrity validation");
    this.name = "ChartStoredResultIntegrityError";
  }
}

export class ChartParticipantRelationshipInactiveError extends Error {
  readonly code = "CHART_PARTICIPANT_RELATIONSHIP_INACTIVE" as const;

  constructor() {
    super("Client relationship changed; reload and retry");
    this.name = "ChartParticipantRelationshipInactiveError";
  }
}

export const chartCalculationReplacementErrorCodes = [
  "CHART_REPLACEMENT_TARGET_NOT_FOUND",
  "CHART_REPLACEMENT_SOURCE_CHANGED",
  "CHART_REPLACEMENT_TARGET_MISMATCH",
  "CHART_REPLACEMENT_PARTICIPANT_MISMATCH",
  "CHART_REPLACEMENT_EXACT_KEY_CONFLICT",
  "CHART_REPLACEMENT_RESULT_INTEGRITY_INVALID",
  "CHART_REPLACEMENT_JOB_IDENTITY_INVALID"
] as const;

export type ChartCalculationReplacementErrorCode =
  (typeof chartCalculationReplacementErrorCodes)[number];

export class ChartCalculationReplacementError extends Error {
  readonly disposition = "permanent" as const;

  constructor(readonly code: ChartCalculationReplacementErrorCode) {
    super(code);
    this.name = "ChartCalculationReplacementError";
  }
}

export const chartCalculationCompletionErrorCodes = [
  "CHART_RESULT_CONTRACT_INVALID",
  "CHART_RESULT_V2_REQUIRED",
  "CHART_RESULT_REPRODUCIBILITY_FINGERPRINT_MISMATCH",
  "CHART_RESULT_CHECKSUM_MISMATCH",
  "CHART_RESULT_JOB_BINDING_MISMATCH",
  "CHART_RESULT_EXECUTION_PROFILE_MISMATCH",
  "CHART_JOB_FINGERPRINT_MISMATCH",
  "CHART_PARTICIPANT_PROFILE_INVALID"
] as const;

export type ChartCalculationCompletionErrorCode =
  (typeof chartCalculationCompletionErrorCodes)[number];

export class ChartCalculationCompletionError extends Error {
  readonly disposition = "permanent" as const;

  constructor(readonly code: ChartCalculationCompletionErrorCode) {
    super(code);
    this.name = "ChartCalculationCompletionError";
  }
}
