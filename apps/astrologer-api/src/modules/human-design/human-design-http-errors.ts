import { HttpException } from "@nestjs/common";

export type HumanDesignErrorCode =
  | "HUMAN_DESIGN_VALIDATION_FAILED"
  | "HUMAN_DESIGN_CLIENT_NOT_FOUND"
  | "HUMAN_DESIGN_BIRTH_DATA_NOT_READY"
  | "HUMAN_DESIGN_PROVIDER_FAILED";

export function humanDesignHttpError(
  status: number,
  code: HumanDesignErrorCode,
  message: string
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}

export async function mapHumanDesignError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw error;
  }
}
