import { HttpException } from "@nestjs/common";
import {
  CalculationNotFoundError,
  CalculationResultChangedError,
  CalculationValidationError,
  ChartBirthDataReadinessError
} from "@elevenhouse/domain";

export type ChartErrorCode =
  | "CHART_VALIDATION_FAILED"
  | "CHART_CLIENT_NOT_FOUND"
  | "CHART_PARTNER_CLIENT_NOT_FOUND"
  | "CHART_SYNASTRY_PARTNER_REQUIRED"
  | "CHART_COMPOSITE_PARTNER_REQUIRED"
  | "CHART_BIRTH_DATE_REQUIRED"
  | "CHART_BIRTH_TIME_REQUIRED"
  | "CHART_BIRTH_TIMEZONE_REQUIRED"
  | "CHART_BIRTH_TIMEZONE_INVALID"
  | "CHART_BIRTH_COORDINATES_REQUIRED"
  | "CHART_JOB_NOT_FOUND"
  | "CHART_CALCULATION_NOT_FOUND"
  | "CHART_CALCULATION_ARCHIVED"
  | "CHART_CALCULATION_MISMATCH"
  | "CHART_RESULT_CHANGED"
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
