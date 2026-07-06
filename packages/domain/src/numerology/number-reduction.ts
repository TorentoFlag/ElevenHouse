import { NumerologyValidationError } from "./numerology-errors";
import type { MasterNumberSettings } from "./numerology-types";

const defaultMasterNumbers = [11, 22, 33] as const;

export function reduceNumber(value: number, settings: MasterNumberSettings): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NumerologyValidationError("Numerology number must be a non-negative safe integer");
  }

  let current = value;
  while (current > 9) {
    if (shouldPreserveMasterNumber(current, settings)) {
      return current;
    }

    current = sumDigits(current);
  }

  return current;
}

function shouldPreserveMasterNumber(value: number, settings: MasterNumberSettings): boolean {
  if (settings.mode === "reduce_all") return false;
  if (settings.mode === "preserve_all") return defaultMasterNumbers.includes(value as 11 | 22 | 33);
  return settings.values.includes(value);
}

function sumDigits(value: number): number {
  return [...String(value)].reduce((sum, digit) => sum + Number(digit), 0);
}
