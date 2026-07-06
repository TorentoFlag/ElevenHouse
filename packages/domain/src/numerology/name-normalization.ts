import { NumerologyValidationError } from "./numerology-errors";
import type { NameNormalizationSettings } from "./numerology-types";

export function normalizeNumerologyName(
  fullName: string,
  settings: NameNormalizationSettings
): string {
  const letters = [...fullName.toLocaleLowerCase("ru-RU")].filter((character) =>
    /\p{Letter}/u.test(character)
  );
  const normalized = letters
    .map((character, index) => normalizeRussianLetter(character, index, letters, settings))
    .join("");

  if (!normalized) {
    throw new NumerologyValidationError("Numerology name must not be blank");
  }

  return normalized;
}

function normalizeRussianLetter(
  character: string,
  index: number,
  letters: readonly string[],
  settings: NameNormalizationSettings
): string {
  if (character === "ё" && settings.yoPolicy === "as_e") return "е";
  if (character === "й" && settings.shortIpolicy === "as_i" && index < letters.length - 1) return "и";
  return character;
}
