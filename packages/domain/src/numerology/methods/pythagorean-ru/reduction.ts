import { NumerologyValidationError } from "../../numerology-errors";

export const MASTER_NUMBERS = new Set([11, 22, 33]);

export function reduceScalar(value: number): number {
  assertNonNegativeInteger(value);
  let current = value;
  while (current > 9 && !MASTER_NUMBERS.has(current)) current = digitSum(current);
  return current;
}

export function reduceFully(value: number): number {
  assertNonNegativeInteger(value);
  let current = value;
  while (current > 9) current = digitSum(current);
  return current;
}

function assertNonNegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NumerologyValidationError("Reduction input must be a non-negative integer");
  }
}

function digitSum(value: number): number {
  return [...String(value)].reduce((sum, digit) => sum + Number(digit), 0);
}
