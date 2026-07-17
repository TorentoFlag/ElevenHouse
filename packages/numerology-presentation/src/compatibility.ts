import type {
  NumerologyComparison,
  NumerologyCompatibilityConclusion,
  NumerologyCompatibilityZone,
  NumerologyRelation
} from "@elevenhouse/contracts";

export type NumerologyPresentationLocale = "ru" | "en";

export type NumerologyComparisonPresentationInput = Readonly<
  Pick<
    NumerologyComparison,
    "block" | "code" | "valueA" | "valueB" | "difference" | "relation"
  >
>;

export type NumerologyZonePresentationInput = {
  readonly code: NumerologyCompatibilityZone["code"];
  readonly comparisonCodes: readonly string[];
  readonly counts: Readonly<Record<NumerologyRelation, number>>;
  readonly relation: NumerologyRelation;
};

export type NumerologyConclusionPresentationInput = Readonly<
  Pick<
    NumerologyCompatibilityConclusion,
    "code" | "matchAndClose" | "differentAndTension" | "tension"
  >
>;

export type NumerologyCompatibilityLabels = {
  readonly blockLabels: Readonly<Record<NumerologyComparison["block"] | "total", string>>;
  readonly relationLabels: Readonly<Record<NumerologyRelation, string>>;
  readonly zoneLabels: Readonly<Record<NumerologyCompatibilityZone["code"], string>>;
  readonly conclusionLabels: Readonly<
    Record<NumerologyCompatibilityConclusion["code"], string>
  >;
  readonly indicatorLabels: Readonly<Record<string, string>>;
  readonly cellLabels: Readonly<Record<string, string>>;
  readonly lineLabels: Readonly<Record<string, string>>;
};

const ru: NumerologyCompatibilityLabels = {
  blockLabels: {
    key_numbers: "Ключевые числа",
    psychomatrix: "Психоматрица",
    strength_lines: "Линии силы",
    total: "Всего"
  },
  relationLabels: {
    match: "Совпадение",
    close: "Близкие значения",
    different: "Различие",
    tension: "Напряжение"
  },
  zoneLabels: {
    identity: "Идентичность",
    inner_world: "Внутренний мир",
    resources: "Ресурсы",
    dynamics: "Динамика"
  },
  conclusionLabels: {
    harmonious: "Гармоничная совместимость",
    mixed: "Смешанная совместимость",
    attention: "Совместимость требует внимания"
  },
  indicatorLabels: {
    lifePath: "Число жизненного пути",
    birthday: "Число дня рождения",
    expression: "Число выражения",
    soul: "Число души",
    personality: "Число личности"
  },
  cellLabels: {
    "1": "Характер",
    "2": "Энергия",
    "3": "Интерес",
    "4": "Здоровье",
    "5": "Логика",
    "6": "Труд",
    "7": "Удача",
    "8": "Долг",
    "9": "Память и ум"
  },
  lineLabels: {
    goal: "Целеустремлённость",
    family: "Семейность",
    stability: "Стабильность",
    self_esteem: "Самооценка",
    material: "Быт и материальность",
    talent: "Талант",
    spirituality: "Духовность",
    temperament: "Темперамент"
  }
};

const en: NumerologyCompatibilityLabels = {
  blockLabels: {
    key_numbers: "Core numbers",
    psychomatrix: "Psychomatrix",
    strength_lines: "Strength lines",
    total: "Total"
  },
  relationLabels: {
    match: "Match",
    close: "Close values",
    different: "Different",
    tension: "Tension"
  },
  zoneLabels: {
    identity: "Identity",
    inner_world: "Inner world",
    resources: "Resources",
    dynamics: "Dynamics"
  },
  conclusionLabels: {
    harmonious: "Harmonious compatibility",
    mixed: "Mixed compatibility",
    attention: "Compatibility requires attention"
  },
  indicatorLabels: {
    lifePath: "Life path number",
    birthday: "Birthday number",
    expression: "Expression number",
    soul: "Soul number",
    personality: "Personality number"
  },
  cellLabels: {
    "1": "Character",
    "2": "Energy",
    "3": "Interest",
    "4": "Health",
    "5": "Logic",
    "6": "Work",
    "7": "Luck",
    "8": "Duty",
    "9": "Memory and intellect"
  },
  lineLabels: {
    goal: "Purpose",
    family: "Family",
    stability: "Stability",
    self_esteem: "Self-esteem",
    material: "Material life",
    talent: "Talent",
    spirituality: "Spirituality",
    temperament: "Temperament"
  }
};

export function getNumerologyCompatibilityLabels(
  locale: NumerologyPresentationLocale
): NumerologyCompatibilityLabels {
  return locale === "ru" ? ru : en;
}

export function getNumerologyComparisonIndicatorLabel(
  comparison: NumerologyComparisonPresentationInput,
  locale: NumerologyPresentationLocale
): string {
  const labels = getNumerologyCompatibilityLabels(locale);
  if (comparison.block === "psychomatrix") {
    const digit = comparison.code.replace(/^digit_/, "");
    const cellLabel = labels.cellLabels[digit];
    if (!cellLabel) return locale === "ru" ? `Цифра ${digit}` : `Digit ${digit}`;
    return locale === "ru" ? `${cellLabel} · цифра ${digit}` : `${cellLabel} · digit ${digit}`;
  }
  if (comparison.block === "strength_lines") {
    return labels.lineLabels[comparison.code] ?? humanizeCode(comparison.code);
  }
  return labels.indicatorLabels[comparison.code] ?? humanizeCode(comparison.code);
}

export function formatNumerologyComparison(
  comparison: NumerologyComparisonPresentationInput,
  locale: NumerologyPresentationLocale
): string {
  const indicator = getNumerologyComparisonIndicatorLabel(comparison, locale);
  const relation = getNumerologyCompatibilityLabels(locale).relationLabels[comparison.relation];
  return locale === "ru"
    ? `${indicator}: ${comparison.valueA} и ${comparison.valueB}. Разница — ${comparison.difference}. По методике это категория «${relation}».`
    : `${indicator}: ${comparison.valueA} and ${comparison.valueB}. Difference — ${comparison.difference}. The method classifies this as “${relation}”.`;
}

export function formatNumerologyZone(
  zone: NumerologyZonePresentationInput,
  locale: NumerologyPresentationLocale
): string {
  const labels = getNumerologyCompatibilityLabels(locale);
  const zoneLabel = labels.zoneLabels[zone.code];
  const relation = labels.relationLabels[zone.relation];
  const counts = zone.counts;
  return locale === "ru"
    ? `${zoneLabel}. Сравнений: ${zone.comparisonCodes.length}. Итоговая категория: «${relation}». Совпадения: ${counts.match}; близкие значения: ${counts.close}; различия: ${counts.different}; напряжения: ${counts.tension}.`
    : `${zoneLabel}. Comparisons: ${zone.comparisonCodes.length}. Overall category: “${relation}”. Matches: ${counts.match}; close values: ${counts.close}; differences: ${counts.different}; tensions: ${counts.tension}.`;
}

export function formatNumerologyConclusion(
  conclusion: NumerologyConclusionPresentationInput,
  locale: NumerologyPresentationLocale
): string {
  const label = getNumerologyCompatibilityLabels(locale).conclusionLabels[conclusion.code];
  const sentenceLabel = lowercaseFirst(label, locale);
  return locale === "ru"
    ? `Совпадения и близкие значения — ${conclusion.matchAndClose}; различия и напряжения — ${conclusion.differentAndTension}. Итог: ${sentenceLabel}.`
    : `Matches and close values — ${conclusion.matchAndClose}; differences and tensions — ${conclusion.differentAndTension}. Result: ${sentenceLabel}.`;
}

function humanizeCode(code: string): string {
  const words = code
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0
    ? words.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ")
    : code;
}

function lowercaseFirst(value: string, locale: NumerologyPresentationLocale): string {
  const language = locale === "ru" ? "ru-RU" : "en-US";
  return `${value[0]?.toLocaleLowerCase(language) ?? ""}${value.slice(1)}`;
}
