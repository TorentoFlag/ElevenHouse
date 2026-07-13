import { HttpException } from "@nestjs/common";
import {
  CalculationAlreadyExistsError,
  CalculationNotFoundError,
  CalculationParticipantMismatchError,
  CalculationValidationError,
  NumerologyValidationError,
  UnsupportedNumerologyMethodError
} from "@elevenhouse/domain";

export type NumerologyErrorCode =
  | "NUMEROLOGY_VALIDATION_FAILED"
  | "CLIENT_NOT_FOUND"
  | "UNSUPPORTED_NUMEROLOGY_METHOD"
  | "CALCULATION_PARTICIPANT_MISMATCH"
  | "CALCULATION_ALREADY_EXISTS"
  | "CALCULATION_NOT_FOUND"
  | "CALCULATION_RESULT_INTEGRITY_ERROR"
  | "ASTROLOGER_TIMEZONE_REQUIRED";

export class NumerologyResultIntegrityError extends Error {
  constructor() {
    super("Saved numerology result failed integrity validation");
    this.name = "NumerologyResultIntegrityError";
  }
}

export function numerologyHttpError(
  status: number,
  code: NumerologyErrorCode,
  message: string
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}

export async function mapNumerologyError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof CalculationNotFoundError) {
      throw numerologyHttpError(404, "CALCULATION_NOT_FOUND", "Calculation not found");
    }
    if (error instanceof CalculationParticipantMismatchError) {
      throw numerologyHttpError(409, "CALCULATION_PARTICIPANT_MISMATCH", error.message);
    }
    if (error instanceof CalculationAlreadyExistsError) {
      throw numerologyHttpError(409, "CALCULATION_ALREADY_EXISTS", error.message);
    }
    if (error instanceof UnsupportedNumerologyMethodError) {
      throw numerologyHttpError(422, "UNSUPPORTED_NUMEROLOGY_METHOD", error.message);
    }
    if (error instanceof NumerologyResultIntegrityError) {
      throw numerologyHttpError(500, "CALCULATION_RESULT_INTEGRITY_ERROR", error.message);
    }
    if (error instanceof NumerologyValidationError || error instanceof CalculationValidationError) {
      throw numerologyHttpError(400, "NUMEROLOGY_VALIDATION_FAILED", error.message);
    }
    throw error;
  }
}
