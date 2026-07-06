import { NumerologyValidationError } from "./numerology-errors";
import type { NameNormalizationSettings } from "./numerology-types";

export function normalizeNumerologyName(
  fullName: string,
  settings: NameNormalizationSettings
): string {
  const letters = [...fullName.normalize("NFC").toLocaleLowerCase("ru-RU")].filter((character) =>
    /\p{Letter}/u.test(character)
  );
  const normalized = letters.map((character) => normalizeRussianLetter(character, settings)).join("");

  if (!normalized) {
    throw new NumerologyValidationError("Numerology name must not be blank");
  }

  return normalized;
}

function normalizeRussianLetter(character: string, settings: NameNormalizationSettings): string {
  if (character === "ё" && settings.yoPolicy === "as_e") return "е";
  if (character === "й" && settings.shortIPolicy === "as_i") return "и";
  return character;
}
