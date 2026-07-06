import { NumerologyValidationError } from "./numerology-errors";
import type { MasterNumber, MasterNumberSettings } from "./numerology-types";

const defaultMasterNumbers: readonly MasterNumber[] = [11, 22, 33];

export function reduceNumber(value: number, settings: MasterNumberSettings): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NumerologyValidationError("Numerology number must be a non-negative safe integer");
  }
  validateMasterNumberSettings(settings);

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
  if (settings.mode === "preserve_all") return isMasterNumber(value);
  return isMasterNumber(value) && settings.values.includes(value);
}

function validateMasterNumberSettings(settings: MasterNumberSettings): void {
  if (typeof settings !== "object" || settings === null) {
    throw new NumerologyValidationError("Invalid master number settings");
  }

  if (settings.mode === "reduce_all" || settings.mode === "preserve_all") return;

  if (settings.mode !== "preserve_selected" || !Array.isArray(settings.values)) {
    throw new NumerologyValidationError("Invalid master number settings");
  }

  if (!settings.values.every(isMasterNumber)) {
    throw new NumerologyValidationError("Unsupported master number");
  }
}

function isMasterNumber(value: number): value is MasterNumber {
  return defaultMasterNumbers.includes(value as MasterNumber);
}

function sumDigits(value: number): number {
  return [...String(value)].reduce((sum, digit) => sum + Number(digit), 0);
}
