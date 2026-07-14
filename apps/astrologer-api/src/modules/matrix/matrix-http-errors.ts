import { HttpException } from "@nestjs/common";
import {
  CalculationAlreadyExistsError,
  CalculationNotFoundError,
  CalculationParticipantMismatchError,
  CalculationValidationError,
  MatrixNoteNotFoundError,
  MatrixReportNotFoundError,
  MatrixReportNotReadyError,
  MatrixReportStaleError,
  MatrixResultChangedError,
  MatrixValidationError,
  UnsupportedMatrixMethodError
} from "@elevenhouse/domain";

export type MatrixErrorCode =
  | "MATRIX_VALIDATION_FAILED"
  | "MATRIX_CLIENT_NOT_AVAILABLE"
  | "MATRIX_CLIENT_BIRTH_DATE_REQUIRED"
  | "UNSUPPORTED_MATRIX_METHOD"
  | "MATRIX_CALCULATION_MISMATCH"
  | "MATRIX_RESULT_CHANGED"
  | "MATRIX_NOTE_NOT_FOUND"
  | "MATRIX_REPORT_NOT_FOUND"
  | "MATRIX_REPORT_NOT_READY"
  | "MATRIX_REPORT_STALE"
  | "MATRIX_PDF_NOT_FOUND"
  | "MATRIX_PDF_NOT_READY"
  | "CALCULATION_PARTICIPANT_MISMATCH"
  | "CALCULATION_ALREADY_EXISTS"
  | "CALCULATION_NOT_FOUND"
  | "CALCULATION_RESULT_INTEGRITY_ERROR"
  | "ASTROLOGER_TIMEZONE_REQUIRED";

export class MatrixResultIntegrityError extends Error {
  constructor() {
    super("Saved Matrix result failed integrity validation");
    this.name = "MatrixResultIntegrityError";
  }
}

export function matrixHttpError(
  status: number,
  code: MatrixErrorCode,
  message: string
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}

export async function mapMatrixError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof CalculationNotFoundError) {
      throw matrixHttpError(404, "CALCULATION_NOT_FOUND", "Calculation not found");
    }
    if (error instanceof CalculationParticipantMismatchError) {
      throw matrixHttpError(409, "CALCULATION_PARTICIPANT_MISMATCH", error.message);
    }
    if (error instanceof CalculationAlreadyExistsError) {
      throw matrixHttpError(409, "CALCULATION_ALREADY_EXISTS", error.message);
    }
    if (error instanceof UnsupportedMatrixMethodError) {
      throw matrixHttpError(422, "UNSUPPORTED_MATRIX_METHOD", error.message);
    }
    if (error instanceof MatrixNoteNotFoundError) {
      throw matrixHttpError(404, "MATRIX_NOTE_NOT_FOUND", error.message);
    }
    if (error instanceof MatrixReportNotFoundError) {
      throw matrixHttpError(404, "MATRIX_REPORT_NOT_FOUND", error.message);
    }
    if (error instanceof MatrixReportNotReadyError) {
      throw matrixHttpError(409, "MATRIX_REPORT_NOT_READY", error.message);
    }
    if (error instanceof MatrixReportStaleError) {
      throw matrixHttpError(409, "MATRIX_REPORT_STALE", error.message);
    }
    if (error instanceof MatrixResultChangedError) {
      throw matrixHttpError(409, "MATRIX_RESULT_CHANGED", error.message);
    }
    if (error instanceof MatrixResultIntegrityError) {
      throw matrixHttpError(500, "CALCULATION_RESULT_INTEGRITY_ERROR", error.message);
    }
    if (error instanceof MatrixValidationError || error instanceof CalculationValidationError) {
      throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", error.message);
    }
    throw error;
  }
}
