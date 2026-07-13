import { NumerologyValidationError } from "../../numerology-errors";
import type { NumerologyDigit, NumerologyRootNumber } from "../../numerology-types";

export const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export const LETTER_VALUES: Readonly<Record<string, NumerologyRootNumber>> = {
  а: 1,
  и: 1,
  с: 1,
  ъ: 1,
  б: 2,
  й: 2,
  т: 2,
  ы: 2,
  в: 3,
  к: 3,
  у: 3,
  ь: 3,
  г: 4,
  л: 4,
  ф: 4,
  э: 4,
  д: 5,
  м: 5,
  х: 5,
  ю: 5,
  е: 6,
  н: 6,
  ц: 6,
  я: 6,
  ё: 7,
  о: 7,
  ч: 7,
  ж: 8,
  п: 8,
  ш: 8,
  з: 9,
  р: 9,
  щ: 9
};

export const VOWELS = new Set(["а", "е", "ё", "и", "о", "у", "ы", "э", "ю", "я"]);

export const STRENGTH_LINES: readonly {
  readonly code: string;
  readonly label: string;
  readonly cells: readonly NumerologyDigit[];
}[] = [
  { code: "goal", label: "Целеустремлённость", cells: ["1", "4", "7"] },
  { code: "family", label: "Семейность", cells: ["2", "5", "8"] },
  { code: "stability", label: "Стабильность", cells: ["3", "6", "9"] },
  { code: "self_esteem", label: "Самооценка", cells: ["1", "2", "3"] },
  { code: "material", label: "Быт и материальность", cells: ["4", "5", "6"] },
  { code: "talent", label: "Талант", cells: ["7", "8", "9"] },
  { code: "spirituality", label: "Духовность", cells: ["1", "5", "9"] },
  { code: "temperament", label: "Темперамент", cells: ["3", "5", "7"] }
];

export type ParsedIsoDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly yearText: string;
  readonly monthText: string;
  readonly dayText: string;
};

export function parseIsoDate(value: string, fieldName: string): ParsedIsoDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new NumerologyValidationError(`Invalid ISO date for ${fieldName}`);
  const yearText = match[1]!;
  const monthText = match[2]!;
  const dayText = match[3]!;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new NumerologyValidationError(`Invalid ISO date for ${fieldName}`);
  }
  return { year, month, day, yearText, monthText, dayText };
}

export function sumDigits(value: string | number): number {
  return [...String(value)].reduce((sum, digit) => sum + Number(digit), 0);
}
