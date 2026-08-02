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
