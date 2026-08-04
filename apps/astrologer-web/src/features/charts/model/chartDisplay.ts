import type { ChartRenderResult, ChartResult, DictionaryLocale } from "@elevenhouse/contracts";

type ProgressionChartResult = Extract<ChartResult, { readonly method: "progression" }>;
type SolarReturnChartResult = Extract<ChartResult, { readonly method: "solar_return" }>;
type SynastryChartResult = Extract<ChartResult, { readonly method: "synastry" }>;
type TransitChartResult = Extract<ChartResult, { readonly method: "transit" }>;

export const romanHouses = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII"
] as const;

const pointLabelsByLocale: Record<DictionaryLocale, Record<string, string>> = {
  ru: {
    sun: "Солнце",
    moon: "Луна",
    mercury: "Меркурий",
    venus: "Венера",
    mars: "Марс",
    jupiter: "Юпитер",
    saturn: "Сатурн",
    uranus: "Уран",
    neptune: "Нептун",
    pluto: "Плутон",
    ascendant: "Асцендент",
    midheaven: "Середина неба",
    north_node: "Северный узел",
    true_node: "Северный узел",
    mean_node: "Северный узел",
    south_node: "Южный узел"
  },
  en: {
    sun: "Sun",
    moon: "Moon",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
    uranus: "Uranus",
    neptune: "Neptune",
    pluto: "Pluto",
    ascendant: "Ascendant",
    midheaven: "Midheaven",
    north_node: "North Node",
    true_node: "North Node",
    mean_node: "North Node",
    south_node: "South Node"
  }
};

const pointSymbols: Record<string, string> = {
  sun: "☉︎",
  moon: "☽︎",
  mercury: "☿︎",
  venus: "♀︎",
  mars: "♂︎",
  jupiter: "♃︎",
  saturn: "♄︎",
  uranus: "♅︎",
  neptune: "♆︎",
  pluto: "♇︎",
  ascendant: "A",
  midheaven: "M",
  north_node: "☊︎",
  true_node: "☊︎",
  mean_node: "☊︎",
  south_node: "☋︎"
};

const signOrder = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces"
] as const;

const signLabelsByLocale: Record<DictionaryLocale, Record<string, string>> = {
  ru: {
    aries: "Овен",
    taurus: "Телец",
    gemini: "Близнецы",
    cancer: "Рак",
    leo: "Лев",
    virgo: "Дева",
    libra: "Весы",
    scorpio: "Скорпион",
    sagittarius: "Стрелец",
    capricorn: "Козерог",
    aquarius: "Водолей",
    pisces: "Рыбы"
  },
  en: {
    aries: "Aries",
    taurus: "Taurus",
    gemini: "Gemini",
    cancer: "Cancer",
    leo: "Leo",
    virgo: "Virgo",
    libra: "Libra",
    scorpio: "Scorpio",
    sagittarius: "Sagittarius",
    capricorn: "Capricorn",
    aquarius: "Aquarius",
    pisces: "Pisces"
  }
};

const aspectLabelsByLocale: Record<DictionaryLocale, Record<string, string>> = {
  ru: {
    conjunction: "Соединение",
    sextile: "Секстиль",
    square: "Квадрат",
    trine: "Тригон",
    opposition: "Оппозиция",
    "semi-sextile": "Полусекстиль",
    "semi-square": "Полуквадрат",
    quincunx: "Квинконс",
    quintile: "Квинтиль"
  },
  en: {
    conjunction: "Conjunction",
    sextile: "Sextile",
    square: "Square",
    trine: "Trine",
    opposition: "Opposition",
    "semi-sextile": "Semi-sextile",
    "semi-square": "Semi-square",
    quincunx: "Quincunx",
    quintile: "Quintile"
  }
};

const zodiacSymbols: Record<string, string> = {
  aries: "♈︎",
  taurus: "♉︎",
  gemini: "♊︎",
  cancer: "♋︎",
  leo: "♌︎",
  virgo: "♍︎",
  libra: "♎︎",
  scorpio: "♏︎",
  sagittarius: "♐︎",
  capricorn: "♑︎",
  aquarius: "♒︎",
  pisces: "♓︎"
};

const aspectSymbols: Record<string, string> = {
  conjunction: "☌",
  sextile: "✶",
  square: "□",
  trine: "△",
  opposition: "☍",
  "semi-sextile": "⚺",
  "semi-square": "∠",
  quincunx: "⚻",
  quintile: "Q"
};

export function getChartPointDisplayLabel(
  pointId: string,
  fallback: string,
  locale: DictionaryLocale = "ru"
): string {
  return pointLabelsByLocale[locale][pointId] ?? fallback;
}

export function getChartPointSymbol(pointId: string, fallback: string): string {
  return pointSymbols[pointId] ?? fallback.slice(0, 1);
}

export function formatHouseSignDisplay(sign: string, locale: DictionaryLocale = "ru"): string {
  return signLabelsByLocale[locale][sign.toLowerCase()] ?? sign;
}

export function formatAspectTypeDisplay(type: string, locale: DictionaryLocale = "ru"): string {
  return aspectLabelsByLocale[locale][type] ?? type;
}

export function getAspectDisplaySymbol(type: string, locale: DictionaryLocale = "ru"): string {
  return aspectSymbols[type] ?? formatAspectTypeDisplay(type, locale);
}

export function getZodiacDisplaySymbol(sign: string): string {
  return zodiacSymbols[sign.toLowerCase()] ?? sign;
}

export function formatChartPointPosition(
  point: {
    readonly sign: string;
    readonly signDegree: number;
    readonly retrograde?: boolean | null;
  },
  locale: DictionaryLocale = "ru"
): string {
  const position = getRoundedChartPointPosition(point);

  return `${formatHouseSignDisplay(position.sign, locale)} ${position.degree}${
    point.retrograde ? " R" : ""
  }`;
}

export function getRoundedChartPointPosition(point: {
  readonly sign: string;
  readonly signDegree: number;
}): { readonly sign: string; readonly degree: string } {
  const roundedMinutes = Math.round(point.signDegree * 60);
  const minutesPerSign = 30 * 60;
  const signIndex = signOrder.findIndex((sign) => sign === point.sign.toLowerCase());
  const signOffset = Math.floor(roundedMinutes / minutesPerSign);
  const normalizedMinutes = modulo(roundedMinutes, minutesPerSign);

  if (signIndex === -1) {
    return { sign: point.sign, degree: formatDegreeFromMinutes(normalizedMinutes) };
  }

  const nextSignIndex = modulo(signIndex + signOffset, signOrder.length);
  const normalizedSign = signOrder[nextSignIndex] ?? point.sign;

  return {
    sign: normalizedSign,
    degree: formatDegreeFromMinutes(normalizedMinutes)
  };
}

export function formatDegree(value: number): string {
  const minutesPerSign = 30 * 60;
  const roundedMinutes = Math.round(value * 60);

  return formatDegreeFromMinutes(modulo(roundedMinutes, minutesPerSign));
}

function formatDegreeFromMinutes(totalMinutes: number): string {
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getPrimaryChartRenderResult(result: ChartResult): ChartRenderResult {
  if (result.method === "transit") {
    return result.result.natal;
  }
  if (result.method === "synastry") {
    return result.result.primary;
  }
  if (result.method === "solar_return") {
    return result.result.natal;
  }
  if (result.method === "progression") {
    return result.result.natal;
  }
  if (result.method === "astrocartography") {
    throw new Error("Astrocartography result does not contain a wheel render result");
  }

  return result.result;
}

export function getTransitChartRenderResult(result: ChartResult): ChartRenderResult | null {
  return result.method === "transit" ? result.result.transit : null;
}

export function getTransitChartResult(result: ChartResult): TransitChartResult | null {
  return result.method === "transit" ? result : null;
}

export function getSolarReturnChartRenderResult(result: ChartResult): ChartRenderResult | null {
  return result.method === "solar_return" ? result.result.solarReturn : null;
}

export function getSolarReturnChartResult(result: ChartResult): SolarReturnChartResult | null {
  return result.method === "solar_return" ? result : null;
}

export function getProgressionChartRenderResult(result: ChartResult): ChartRenderResult | null {
  return result.method === "progression" ? result.result.progressed : null;
}

export function getProgressionChartResult(result: ChartResult): ProgressionChartResult | null {
  return result.method === "progression" ? result : null;
}

export function getPartnerChartRenderResult(result: ChartResult): ChartRenderResult | null {
  return result.method === "synastry" ? result.result.partner : null;
}

export function getSynastryChartResult(result: ChartResult): SynastryChartResult | null {
  return result.method === "synastry" ? result : null;
}

export function getChartWarnings(result: ChartResult) {
  if (
    result.method === "transit" ||
    result.method === "synastry" ||
    result.method === "solar_return" ||
    result.method === "progression"
  ) {
    return result.result.warnings;
  }

  return result.result.warnings;
}
