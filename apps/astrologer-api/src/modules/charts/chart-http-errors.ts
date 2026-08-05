import { HttpException } from "@nestjs/common";
import {
  CalculationNotFoundError,
  CalculationInterpretationModeUnavailableError,
  CalculationResultChangedError,
  CalculationValidationError,
  ChartAiDraftIdempotencyKeyReuseError,
  ChartAiDraftInProgressError,
  ChartAiDraftOutcomeUnknownError,
  ChartBirthDataReadinessError,
  ChartParticipantRelationshipInactiveError,
  ChartStoredResultIntegrityError
} from "@elevenhouse/domain";

export type ChartErrorCode =
  | "CHART_VALIDATION_FAILED"
  | "CHART_CLIENT_NOT_FOUND"
  | "CHART_PARTNER_CLIENT_NOT_FOUND"
  | "CHART_SYNASTRY_PARTNER_REQUIRED"
  | "CHART_COMPOSITE_PARTNER_REQUIRED"
  | "CHART_BIRTH_DATE_REQUIRED"
  | "CHART_BIRTH_DATE_INVALID"
  | "CHART_BIRTH_TIME_REQUIRED"
  | "CHART_BIRTH_TIME_INVALID"
  | "CHART_BIRTH_TIMEZONE_REQUIRED"
  | "CHART_BIRTH_TIMEZONE_INVALID"
  | "CHART_BIRTH_TIME_DST_OCCURRENCE_REQUIRED"
  | "CHART_BIRTH_TIME_NONEXISTENT"
  | "CHART_BIRTH_COORDINATES_REQUIRED"
  | "CHART_JOB_NOT_FOUND"
  | "CHART_CALCULATION_NOT_FOUND"
  | "CHART_CALCULATION_ARCHIVED"
  | "CHART_CALCULATION_MISMATCH"
  | "CHART_INTERPRETATION_MODE_UNAVAILABLE"
  | "CHART_RESULT_CHANGED"
  | "CHART_STORED_RESULT_INTEGRITY_INVALID"
  | "CHART_PARTICIPANT_RELATIONSHIP_INACTIVE"
  | "CHART_RECALCULATION_REQUIRED"
  | "CHART_AI_UNAVAILABLE"
  | "CHART_AI_DRAFT_IDEMPOTENCY_KEY_REUSED"
  | "CHART_AI_DRAFT_IN_PROGRESS"
  | "CHART_AI_DRAFT_OUTCOME_UNKNOWN"
  | "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE"
  | "CHART_UNSUPPORTED_AI_METHOD"
  | "CHART_PDF_NOT_READY"
  | "CHART_PDF_NOT_FOUND";

export function chartHttpError(
  status: number,
  code: ChartErrorCode,
  message: string
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}

export async function mapChartError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof ChartBirthDataReadinessError) {
      throw chartHttpError(400, error.code, error.message);
    }
    if (error instanceof ChartStoredResultIntegrityError) {
      throw chartHttpError(409, error.code, "Stored chart result failed integrity validation");
    }
    if (error instanceof ChartParticipantRelationshipInactiveError) {
      throw chartHttpError(409, error.code, error.message);
    }
    if (error instanceof CalculationInterpretationModeUnavailableError) {
      throw chartHttpError(409, error.code, error.message);
    }
    if (
      error instanceof ChartAiDraftIdempotencyKeyReuseError ||
      error instanceof ChartAiDraftInProgressError
    ) {
      throw chartHttpError(409, error.code, error.message);
    }
    if (error instanceof ChartAiDraftOutcomeUnknownError) {
      throw chartHttpError(503, error.code, error.message);
    }
    if (error instanceof CalculationNotFoundError) {
      throw chartHttpError(404, "CHART_CALCULATION_NOT_FOUND", "Chart calculation was not found");
    }
    if (error instanceof CalculationResultChangedError) {
      throw chartHttpError(409, "CHART_RESULT_CHANGED", error.message);
    }
    if (error instanceof CalculationValidationError) {
      throw chartHttpError(409, "CHART_CALCULATION_ARCHIVED", error.message);
    }
    throw error;
  }
}
