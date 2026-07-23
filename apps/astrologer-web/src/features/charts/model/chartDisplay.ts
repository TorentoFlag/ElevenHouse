import type {
  ChartRenderResult,
  StoredChartCalculationPayload,
  StoredChartProgressionCalculationPayload,
  StoredChartSolarReturnCalculationPayload,
  StoredChartSynastryCalculationPayload,
  StoredChartTransitCalculationPayload
} from "@elevenhouse/contracts";

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

const pointLabels: Record<string, string> = {
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

const signLabels: Record<string, string> = {
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
};

const aspectLabels: Record<string, string> = {
  conjunction: "Соединение",
  sextile: "Секстиль",
  square: "Квадрат",
  trine: "Тригон",
  opposition: "Оппозиция",
  "semi-sextile": "Полусекстиль",
  "semi-square": "Полуквадрат",
  quincunx: "Квинконс",
  quintile: "Квинтиль"
};

export function getChartPointDisplayLabel(pointId: string, fallback: string): string {
  return pointLabels[pointId] ?? fallback;
}

export function getChartPointSymbol(pointId: string, fallback: string): string {
  return pointSymbols[pointId] ?? fallback.slice(0, 1);
}

export function formatHouseSignDisplay(sign: string): string {
  return signLabels[sign.toLowerCase()] ?? sign;
}

export function formatAspectTypeDisplay(type: string): string {
  return aspectLabels[type] ?? type;
}

export function formatChartPointPosition(point: {
  readonly sign: string;
  readonly signDegree: number;
  readonly retrograde?: boolean | null;
}): string {
  return `${formatHouseSignDisplay(point.sign)} ${formatDegree(point.signDegree)}${
    point.retrograde ? " R" : ""
  }`;
}

export function formatDegree(value: number): string {
  const degrees = Math.floor(value);
  const minutes = Math.round((value - degrees) * 60);

  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

export function getPrimaryChartRenderResult(
  result: StoredChartCalculationPayload
): ChartRenderResult {
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

  return result.result;
}

export function getTransitChartRenderResult(
  result: StoredChartCalculationPayload
): ChartRenderResult | null {
  return result.method === "transit" ? result.result.transit : null;
}

export function getTransitChartResult(
  result: StoredChartCalculationPayload
): StoredChartTransitCalculationPayload | null {
  return result.method === "transit" ? result : null;
}

export function getSolarReturnChartRenderResult(
  result: StoredChartCalculationPayload
): ChartRenderResult | null {
  return result.method === "solar_return" ? result.result.solarReturn : null;
}

export function getSolarReturnChartResult(
  result: StoredChartCalculationPayload
): StoredChartSolarReturnCalculationPayload | null {
  return result.method === "solar_return" ? result : null;
}

export function getProgressionChartRenderResult(
  result: StoredChartCalculationPayload
): ChartRenderResult | null {
  return result.method === "progression" ? result.result.progressed : null;
}

export function getProgressionChartResult(
  result: StoredChartCalculationPayload
): StoredChartProgressionCalculationPayload | null {
  return result.method === "progression" ? result : null;
}

export function getPartnerChartRenderResult(
  result: StoredChartCalculationPayload
): ChartRenderResult | null {
  return result.method === "synastry" ? result.result.partner : null;
}

export function getSynastryChartResult(
  result: StoredChartCalculationPayload
): StoredChartSynastryCalculationPayload | null {
  return result.method === "synastry" ? result : null;
}

export function getChartWarnings(result: StoredChartCalculationPayload) {
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
