import { MatrixValidationError } from "../matrix-errors";
import {
  MATRIX_AGE_ORDER,
  MATRIX_ENGINE_REVISION,
  MATRIX_METHOD_CODE,
  type MatrixData,
  type MatrixDerivedProjection,
  type MatrixParticipantInput
} from "../matrix-types";
import { reduce22 } from "../reduce22";
import { parseMatrixDate, sumDigits } from "./matrix-date";

export function calculateLadini22Projection(input: {
  readonly participant: MatrixParticipantInput;
  readonly matrix: MatrixData;
  readonly selectedYear: number;
  readonly currentDate: string;
  readonly timezone: string;
}): MatrixDerivedProjection {
  if (
    !Number.isInteger(input.selectedYear) ||
    input.selectedYear < 1900 ||
    input.selectedYear > 2200
  ) {
    throw new MatrixValidationError("Matrix forecast year must be between 1900 and 2200");
  }
  if (input.timezone.trim().length === 0) {
    throw new MatrixValidationError("Matrix projection timezone is required");
  }
  const birth = parseMatrixDate(input.participant.birthDate);
  const current = parseMatrixDate(input.currentDate);
  const age = calculateAge(birth, current);
  const cycleAge = age % 80;
  const decadeIndex = Math.floor(cycleAge / 10);
  const pointCode = MATRIX_AGE_ORDER[decadeIndex]!;
  const personalYear = reduce22(birth.day + birth.month + sumDigits(input.selectedYear));
  return {
    methodCode: MATRIX_METHOD_CODE,
    engineRevision: MATRIX_ENGINE_REVISION,
    timezone: input.timezone,
    currentDate: input.currentDate,
    participant: input.participant,
    ageCycle: {
      age,
      cycleAge,
      decadeIndex,
      pointCode,
      arcana: input.matrix.points[pointCode]
    },
    yearForecast: {
      year: input.selectedYear,
      personalYear,
      challenge: reduce22(personalYear + input.matrix.points.E),
      resource: reduce22(personalYear + input.matrix.points.A)
    }
  };
}

function calculateAge(
  birth: { readonly year: number; readonly month: number; readonly day: number },
  current: { readonly year: number; readonly month: number; readonly day: number }
): number {
  const beforeBirthday =
    current.month < birth.month || (current.month === birth.month && current.day < birth.day);
  const age = current.year - birth.year - (beforeBirthday ? 1 : 0);
  if (age < 0) {
    throw new MatrixValidationError("Matrix projection current date cannot precede birth date");
  }
  return age;
}
