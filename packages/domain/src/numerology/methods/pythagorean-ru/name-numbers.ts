import { NumerologyValidationError } from "../../numerology-errors";
import type { PythagoreanKeyNumbers } from "../../numerology-types";
import { LETTER_VALUES, VOWELS } from "./profile";
import { reduceScalar } from "./reduction";

type NameNumbers = Pick<PythagoreanKeyNumbers, "expression" | "soul" | "personality">;

const IGNORED_NAME_SEPARATORS = new Set([
  ".",
  "-",
  "‐",
  "‑",
  "‒",
  "–",
  "—",
  "―",
  "'",
  "‘",
  "’",
  "ʼ",
  '"',
  "“",
  "”",
  "„",
  "«",
  "»"
]);

export function calculateNameNumbers(calculationName: string): NameNumbers {
  const normalized = normalizeCalculationName(calculationName);
  const letters = [...normalized];
  const vowels = letters.filter((letter) => VOWELS.has(letter));
  const consonants = letters.filter((letter) => !VOWELS.has(letter));
  if (vowels.length === 0 || consonants.length === 0) {
    throw new NumerologyValidationError("Numerology name must contain both vowels and consonants");
  }
  return {
    expression: reduceScalar(sumLetterValues(letters)),
    soul: reduceScalar(sumLetterValues(vowels)),
    personality: reduceScalar(sumLetterValues(consonants))
  };
}

export function normalizeCalculationName(calculationName: string): string {
  if (typeof calculationName !== "string") {
    throw new NumerologyValidationError("Numerology name must be a string");
  }
  const normalized: string[] = [];
  for (const character of calculationName.normalize("NFC").toLocaleLowerCase("ru-RU")) {
    if (LETTER_VALUES[character]) {
      normalized.push(character);
      continue;
    }
    if (/\s/u.test(character) || IGNORED_NAME_SEPARATORS.has(character)) {
      continue;
    }
    throw new NumerologyValidationError(`Unsupported numerology name character: ${character}`);
  }
  if (normalized.length === 0) {
    throw new NumerologyValidationError("Numerology name must not be blank");
  }
  return normalized.join("");
}

function sumLetterValues(letters: readonly string[]): number {
  return letters.reduce((sum, letter) => sum + (LETTER_VALUES[letter] ?? 0), 0);
}
