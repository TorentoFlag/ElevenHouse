import { normalizeNumerologyName } from "./name-normalization";
import { NumerologyValidationError } from "./numerology-errors";
import { reduceNumber } from "./number-reduction";
import { pythagoreanProfileV1 } from "./pythagorean-profile";
import type {
  NumerologyCompatibilityInput,
  NumerologyDigit,
  NumerologyMatrixComparison,
  NumerologyNumberComparison,
  NumerologyRelation,
  NumerologyRootNumber,
  PythagoreanCompatibilityResult,
  PythagoreanIndividualResult,
  PythagoreanKeyNumberCode,
  PythagoreanKeyNumbers,
  PythagoreanPsychomatrix,
  PythagoreanPsychomatrixCells,
  PythagoreanSettings,
  PythagoreanStrengthLineResult
} from "./numerology-types";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function calculatePythagoreanIndividual(
  participant: PythagoreanIndividualResult["participant"],
  settings: PythagoreanSettings
): PythagoreanIndividualResult {
  const birthDate = parseIsoDate(participant.birthDate, "birthDate");
  const normalizedName = normalizeNumerologyName(participant.fullName, settings.nameNormalization);
  const nameValues = getNameValues(normalizedName);
  const dateDigits = getDateFormulaDigits(birthDate);
  const keyNumbers: PythagoreanKeyNumbers = {
    lifePath: reduceNumber(sumNumbers(dateDigits), settings.masterNumbers),
    birthday: reduceNumber(Number(birthDate.day), settings.masterNumbers),
    ...calculateForecastNumbers(settings, birthDate),
    ...calculateNameNumbers(nameValues, settings)
  };
  const matrix = calculatePsychomatrix(birthDate, dateDigits);

  return {
    methodCode: "pythagorean",
    methodVersion: pythagoreanProfileV1.methodVersion,
    participant,
    keyNumbers,
    psychomatrix: settings.includePsychomatrix ? matrix : undefined,
    strengthLines: settings.includeStrengthLines ? calculateStrengthLines(matrix.cells) : []
  };
}

export function calculatePythagoreanCompatibility(
  participants: NumerologyCompatibilityInput,
  settings: PythagoreanSettings
): PythagoreanCompatibilityResult {
  const first = calculatePythagoreanIndividual(participants.first, settings);
  const second = calculatePythagoreanIndividual(participants.second, settings);
  const firstComparisonMatrix = calculateParticipantPsychomatrix(participants.first);
  const secondComparisonMatrix = calculateParticipantPsychomatrix(participants.second);
  const firstComparisonStrengthLines = calculateStrengthLines(firstComparisonMatrix.cells);
  const secondComparisonStrengthLines = calculateStrengthLines(secondComparisonMatrix.cells);

  return {
    methodCode: "pythagorean",
    methodVersion: pythagoreanProfileV1.methodVersion,
    participants,
    individuals: [first, second],
    pairNumber: reduceNumber(
      first.keyNumbers.lifePath + second.keyNumbers.lifePath,
      settings.masterNumbers
    ),
    keyNumberComparisons: compareKeyNumbers(first.keyNumbers, second.keyNumbers),
    matrixComparisons: compareMatrixCells(
      firstComparisonMatrix.cells,
      secondComparisonMatrix.cells
    ),
    strengthLineComparisons: compareStrengthLines(
      firstComparisonStrengthLines,
      secondComparisonStrengthLines
    )
  };
}

function calculateForecastNumbers(
  settings: PythagoreanSettings,
  birthDate: ParsedIsoDate
): Pick<PythagoreanKeyNumbers, "personalYear" | "personalMonth" | "personalDay"> {
  if (!settings.forecastDate) return {};

  const forecastDate = parseIsoDate(settings.forecastDate, "forecastDate");
  const personalYear = reduceNumber(
    sumDigitsString(birthDate.day) +
      sumDigitsString(birthDate.month) +
      sumDigitsString(forecastDate.year),
    settings.masterNumbers
  );
  const personalMonth = reduceNumber(personalYear + Number(forecastDate.month), settings.masterNumbers);
  const personalDay = reduceNumber(
    personalMonth + sumDigitsString(forecastDate.day),
    settings.masterNumbers
  );

  return { personalYear, personalMonth, personalDay };
}

function calculateNameNumbers(
  values: readonly { readonly letter: string; readonly value: NumerologyRootNumber }[],
  settings: PythagoreanSettings
): Pick<PythagoreanKeyNumbers, "expression" | "soul" | "personality"> {
  if (!settings.includeNameNumbers) return {};

  const vowels = new Set(pythagoreanProfileV1.vowels);
  const soulValues = values.filter(({ letter }) => vowels.has(letter));
  const personalityValues = values.filter(({ letter }) => !vowels.has(letter));
  if (soulValues.length === 0 || personalityValues.length === 0) {
    throw new NumerologyValidationError(
      "Numerology name must contain both vowels and consonants for name numbers"
    );
  }

  return {
    expression: reduceNumber(sumNumbers(values.map(({ value }) => value)), settings.masterNumbers),
    soul: reduceNumber(sumNumbers(soulValues.map(({ value }) => value)), settings.masterNumbers),
    personality: reduceNumber(
      sumNumbers(personalityValues.map(({ value }) => value)),
      settings.masterNumbers
    )
  };
}

function getNameValues(
  normalizedName: string
): readonly { readonly letter: string; readonly value: NumerologyRootNumber }[] {
  return [...normalizedName].map((letter) => {
    const value = pythagoreanProfileV1.letterTable[letter];
    if (!value) {
      throw new NumerologyValidationError(`Unsupported numerology letter: ${letter}`);
    }
    return { letter, value };
  });
}

function calculatePsychomatrix(
  birthDate: ParsedIsoDate,
  sourceDigits: readonly number[]
): PythagoreanPsychomatrix {
  const first = sumNumbers(sourceDigits);
  const second = reduceNumber(first, { mode: "reduce_all" });
  const firstDayDigit = Number(String(birthDate.dayNumber)[0]);
  const third = first - 2 * firstDayDigit;
  const fourth = reduceNumber(third, { mode: "reduce_all" });
  const matrixDigits = [
    ...sourceDigits,
    ...getNumberDigits(first),
    ...getNumberDigits(second),
    ...getNumberDigits(third),
    ...getNumberDigits(fourth)
  ].filter((digit) => digit > 0);

  return {
    sourceDigits,
    workingNumbers: { first, second, third, fourth },
    cells: digits.reduce((cells, digit) => {
      const count = matrixDigits.filter((matrixDigit) => matrixDigit === Number(digit)).length;
      return { ...cells, [digit]: digit.repeat(count) };
    }, {} as Record<NumerologyDigit, string>)
  };
}

function calculateStrengthLines(
  cells: PythagoreanPsychomatrixCells
): readonly PythagoreanStrengthLineResult[] {
  return pythagoreanProfileV1.strengthLines.map((line) => ({
    code: line.code,
    cells: line.cells,
    value: line.cells.reduce((total, cell) => total + cells[cell].length, 0)
  }));
}

function compareKeyNumbers(
  first: PythagoreanKeyNumbers,
  second: PythagoreanKeyNumbers
): readonly NumerologyNumberComparison[] {
  const codes: readonly PythagoreanKeyNumberCode[] = [
    "lifePath",
    "birthday",
    "personalYear",
    "personalMonth",
    "personalDay",
    "expression",
    "soul",
    "personality"
  ];

  return codes.flatMap((code) => {
    const valueA = first[code];
    const valueB = second[code];
    if (valueA === undefined || valueB === undefined) return [];
    return [
      {
        code,
        valueA,
        valueB,
        relation: classifyNumberDifference(Math.abs(valueA - valueB))
      }
    ];
  });
}

function compareMatrixCells(
  first: PythagoreanPsychomatrixCells,
  second: PythagoreanPsychomatrixCells
): readonly NumerologyMatrixComparison[] {
  return digits.map((digit) => {
    const countA = first[digit].length;
    const countB = second[digit].length;
    return {
      digit,
      countA,
      countB,
      relation: classifyCountDifference(Math.abs(countA - countB))
    };
  });
}

function compareStrengthLines(
  first: readonly PythagoreanStrengthLineResult[],
  second: readonly PythagoreanStrengthLineResult[]
): readonly NumerologyNumberComparison[] {
  return pythagoreanProfileV1.strengthLines.map((line) => {
    const valueA = first.find((result) => result.code === line.code)?.value ?? 0;
    const valueB = second.find((result) => result.code === line.code)?.value ?? 0;
    return {
      code: line.code,
      valueA,
      valueB,
      relation: classifyCountDifference(Math.abs(valueA - valueB))
    };
  });
}

function classifyNumberDifference(difference: number): NumerologyRelation {
  if (difference === 0) return "match";
  if (difference === 1) return "close";
  if (difference <= 3) return "different";
  return "tension";
}

function classifyCountDifference(difference: number): NumerologyRelation {
  if (difference === 0) return "match";
  if (difference === 1) return "close";
  if (difference === 2) return "different";
  return "tension";
}

function calculateParticipantPsychomatrix(
  participant: PythagoreanIndividualResult["participant"]
): PythagoreanPsychomatrix {
  const birthDate = parseIsoDate(participant.birthDate, "birthDate");
  return calculatePsychomatrix(birthDate, getDateFormulaDigits(birthDate));
}

type ParsedIsoDate = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly dayNumber: number;
};

function parseIsoDate(value: string, fieldName: string): ParsedIsoDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new NumerologyValidationError(`Invalid ISO date for ${fieldName}`);
  }

  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new NumerologyValidationError(`Invalid ISO date for ${fieldName}`);
  }

  return { year, month, day, dayNumber: Number(day) };
}

function getDateFormulaDigits(date: ParsedIsoDate): readonly number[] {
  return [...date.day, ...date.month, ...date.year].map(Number);
}

function sumDigitsString(value: string): number {
  return [...value].reduce((sum, digit) => sum + Number(digit), 0);
}

function getNumberDigits(value: number): readonly number[] {
  return [...String(value)].map(Number);
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
