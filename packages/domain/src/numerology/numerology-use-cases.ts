import { resolveNumerologyMethod } from "./method-registry";
import type {
  NumerologyCompatibilityUseCaseInput,
  NumerologyIndividualUseCaseInput,
  PythagoreanCompatibilityResult,
  PythagoreanIndividualResult
} from "./numerology-types";

export function calculateNumerologyIndividual(
  input: NumerologyIndividualUseCaseInput
): PythagoreanIndividualResult {
  return resolveNumerologyMethod(input.methodCode).calculateIndividual({
    participant: input.participant,
    periods: input.periods
  });
}

export function calculateNumerologyCompatibility(
  input: NumerologyCompatibilityUseCaseInput
): PythagoreanCompatibilityResult {
  return resolveNumerologyMethod(input.methodCode).calculateCompatibility({
    participants: input.participants,
    periods: input.periods
  });
}
