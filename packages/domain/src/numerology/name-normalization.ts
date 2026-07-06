import { NumerologyValidationError } from "./numerology-errors";
import type { NameNormalizationSettings } from "./numerology-types";

export function normalizeNumerologyName(
  fullName: string,
  settings: NameNormalizationSettings
): string {
  validateNameNormalizationSettings(settings);

  const letters = [...fullName.normalize("NFC").toLocaleLowerCase("ru-RU")].filter((character) =>
    /\p{Letter}/u.test(character)
  );
  const normalized = letters.map((character) => normalizeRussianLetter(character, settings)).join("");

  if (!normalized) {
    throw new NumerologyValidationError("Numerology name must not be blank");
  }

  return normalized;
}

function validateNameNormalizationSettings(settings: NameNormalizationSettings): void {
  if (
    typeof settings !== "object" ||
    settings === null ||
    (settings.yoPolicy !== "separate" && settings.yoPolicy !== "as_e") ||
    (settings.shortIPolicy !== "separate" && settings.shortIPolicy !== "as_i")
  ) {
    throw new NumerologyValidationError("Invalid numerology name normalization settings");
  }
}

function normalizeRussianLetter(character: string, settings: NameNormalizationSettings): string {
  if (character === "ё" && settings.yoPolicy === "as_e") return "е";
  if (character === "й" && settings.shortIPolicy === "as_i") return "и";
  return character;
}
