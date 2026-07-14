import { MatrixValidationError } from "./matrix-errors";

export function reduce22(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MatrixValidationError("Matrix reducer requires a positive integer");
  }
  let current = value;
  while (current > 22) {
    current = String(current)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return current;
}
