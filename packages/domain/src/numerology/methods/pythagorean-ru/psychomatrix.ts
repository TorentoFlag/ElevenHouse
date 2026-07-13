import type { NumerologyDigit, PythagoreanPsychomatrix } from "../../numerology-types";
import { DIGITS, parseIsoDate } from "./profile";
import { reduceFully } from "./reduction";

export function calculatePsychomatrix(birthDate: string): PythagoreanPsychomatrix {
  const date = parseIsoDate(birthDate, "birthDate");
  const sourceDigits = [...date.dayText, ...date.monthText, ...date.yearText].map(Number);
  const first = sourceDigits.reduce((sum, digit) => sum + digit, 0);
  const second = reduceFully(first);
  const firstBirthDayDigit = Number(String(date.day)[0]);
  const third = Math.abs(first - 2 * firstBirthDayDigit);
  const fourth = reduceFully(third);
  const matrixDigits = [
    ...sourceDigits,
    ...numberDigits(first),
    ...numberDigits(second),
    ...numberDigits(third),
    ...numberDigits(fourth)
  ].filter((digit) => digit !== 0);

  return {
    sourceDigits,
    workingNumbers: { first, second, third, fourth },
    cells: Object.fromEntries(
      DIGITS.map((digit) => [
        digit,
        digit.repeat(matrixDigits.filter((value) => value === Number(digit)).length)
      ])
    ) as Record<NumerologyDigit, string>
  };
}

function numberDigits(value: number): readonly number[] {
  return [...String(value)].map(Number);
}
