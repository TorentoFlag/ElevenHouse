import { MatrixValidationError } from "../matrix-errors";

export type MatrixDateParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

export function parseMatrixDate(value: string): MatrixDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw invalidDate(value);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw invalidDate(value);
  }
  return { year, month, day };
}

export function sumDigits(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new MatrixValidationError("Matrix digit sum requires a non-negative integer");
  }
  return String(value)
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
}

function invalidDate(value: string): MatrixValidationError {
  return new MatrixValidationError(`Matrix birth date must be a valid ISO calendar date: ${value}`);
}
