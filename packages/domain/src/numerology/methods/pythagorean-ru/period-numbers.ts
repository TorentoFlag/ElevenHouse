import { NumerologyValidationError } from "../../numerology-errors";
import type { PythagoreanPeriodNumbers, PythagoreanPeriodsRequest } from "../../numerology-types";
import { parseIsoDate, sumDigits } from "./profile";
import { reduceScalar } from "./reduction";

export function calculatePeriodNumbers(
  birthDate: string,
  request: PythagoreanPeriodsRequest
): PythagoreanPeriodNumbers {
  const birth = parseIsoDate(birthDate, "birthDate");
  const result: {
    personalYear?: { year: number; value: number };
    personalMonths?: { year: number; month: number; value: number }[];
    personalDay?: { date: string; value: number };
  } = {};

  if (request.personalYear) {
    const year = assertYear(request.personalYear.year);
    result.personalYear = { year, value: personalYear(birth.dayText, birth.monthText, year) };
  }
  if (request.personalMonths) {
    const year = assertYear(request.personalMonths.year);
    const yearValue = personalYear(birth.dayText, birth.monthText, year);
    result.personalMonths = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return { year, month, value: reduceScalar(yearValue + month) };
    });
  }
  if (request.personalDay) {
    const target = parseIsoDate(request.personalDay.date, "personalDay.date");
    const yearValue = personalYear(birth.dayText, birth.monthText, target.year);
    const monthValue = reduceScalar(yearValue + target.month);
    result.personalDay = {
      date: request.personalDay.date,
      value: reduceScalar(monthValue + sumDigits(target.dayText))
    };
  }
  return result;
}

function personalYear(day: string, month: string, year: number): number {
  return reduceScalar(sumDigits(day) + sumDigits(month) + sumDigits(year));
}

function assertYear(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 9999) {
    throw new NumerologyValidationError("Personal period year must be an integer from 1 to 9999");
  }
  return value;
}
