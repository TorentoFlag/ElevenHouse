import { NumerologyValidationError } from "./numerology-errors";
import {
  calculatePythagoreanCompatibility,
  calculatePythagoreanIndividual
} from "./pythagorean-engine";
import type {
  NumerologyCompatibilityUseCaseInput,
  NumerologyIndividualUseCaseInput,
  PythagoreanCompatibilityResult,
  PythagoreanIndividualResult
} from "./numerology-types";

export function calculateNumerologyIndividual(
  input: NumerologyIndividualUseCaseInput
): PythagoreanIndividualResult {
  if (input.methodCode !== "pythagorean") {
    throw new NumerologyValidationError(`Unsupported numerology method: ${input.methodCode}`);
  }

  return calculatePythagoreanIndividual(input.participant, input.settings);
}

export function calculateNumerologyCompatibility(
  input: NumerologyCompatibilityUseCaseInput
): PythagoreanCompatibilityResult {
  if (input.methodCode !== "pythagorean") {
    throw new NumerologyValidationError(`Unsupported numerology method: ${input.methodCode}`);
  }

  return calculatePythagoreanCompatibility(input.participants, input.settings);
}
