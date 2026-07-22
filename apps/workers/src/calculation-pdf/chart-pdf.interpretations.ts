import type { ChartAspect, ChartPoint, StoredChartNatalCalculationPayload } from "@elevenhouse/contracts";
import type { DictionaryEffectiveEntry } from "@elevenhouse/domain";
import type { ChartPdfInterpretation } from "./calculation-pdf.documents";

type ChartInterpretationAnchorGroup = "points" | "houses" | "aspects";
type ChartInterpretationDictionaryCategoryCode =
  | "planets_in_signs"
  | "planets_in_houses"
  | "house_meanings"
  | "aspects"
  | "planet_aspects";

type ChartInterpretationAnchor = {
  readonly id: string;
  readonly code: string;
  readonly categoryCode: ChartInterpretationDictionaryCategoryCode;
  readonly group: ChartInterpretationAnchorGroup;
  readonly label: string;
  readonly meta: string;
  readonly position: string;
};

const pointOrder = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "ascendant",
  "midheaven",
  "north_node",
  "south_node"
] as const;

const signDictionaryPointIds = new Set(pointOrder.slice(0, 10));
const houseDictionaryPointIds = new Set([...pointOrder.slice(0, 10), "north_node", "south_node"]);
const planetAspectPointIds = new Set(pointOrder.slice(0, 10));
const maxPlanetAspectAnchors = 12;

export function buildChartPdfInterpretationCodes(
  result: StoredChartNatalCalculationPayload
): readonly string[] {
  return Array.from(new Set(buildChartInterpretationAnchors(result).map((anchor) => anchor.code)));
}

export function buildChartPdfInterpretations(input: {
  readonly result: StoredChartNatalCalculationPayload;
  readonly entries: readonly DictionaryEffectiveEntry[];
}): readonly ChartPdfInterpretation[] {
  const entriesByCode = new Map(input.entries.map((entry) => [entry.code, entry]));

  return buildChartInterpretationAnchors(input.result).map((anchor) => {
    const entry = entriesByCode.get(anchor.code);

    return {
      code: anchor.code,
      group: anchor.group,
      label: anchor.label,
      meta: anchor.meta,
      position: anchor.position,
      entry: entry
        ? {
            title: entry.title,
            content: entry.content,
            source: entry.source
          }
        : null
    };
  });
}

function buildChartInterpretationAnchors(
  result: StoredChartNatalCalculationPayload
): readonly ChartInterpretationAnchor[] {
  const pointsById = new Map(result.result.points.map((point) => [point.id, point]));

  return [
    ...buildPointAnchors(result.result.points),
    ...buildHouseAnchors(result),
    ...buildAspectAnchors(result.result.aspects, pointsById)
  ];
}

function buildPointAnchors(points: readonly ChartPoint[]): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getPointLabelFromId(point.id, point.label);
    const signLabel = signLabelFor(point.sign);
    const position = `${signLabel} ${degree(point.signDegree)}${
      point.house ? ` · ${romanHouse(point.house)} дом` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `point-sign-${point.id}`,
        code: `${pointId}_${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: `${pointLabel} в ${signPrepositional(point.sign)}`,
        meta: "Планета в знаке",
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `point-house-${point.id}`,
        code: `${pointId}_house_${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: `${pointLabel} · ${romanHouse(point.house)} дом`,
        meta: "Планета в доме",
        position
      });
    }

    return anchors;
  });
}

function buildHouseAnchors(
  result: StoredChartNatalCalculationPayload
): readonly ChartInterpretationAnchor[] {
  return [...result.result.houses]
    .sort((left, right) => left.number - right.number)
    .map((house) => ({
      id: `house-${house.number}`,
      code: `house_${house.number}`,
      categoryCode: "house_meanings" as const,
      group: "houses" as const,
      label: `${romanHouse(house.number)} дом`,
      meta: "Значение дома",
      position: `${signLabelFor(house.sign)} ${degree(house.signDegree)}`
    }));
}

function buildAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>
): readonly ChartInterpretationAnchor[] {
  const aspectTypeAnchors = Array.from(new Set(aspects.map((aspect) => aspect.type))).map(
    (type) => ({
      id: `aspect-type-${type}`,
      code: normalizeAspectTypeCode(type),
      categoryCode: "aspects" as const,
      group: "aspects" as const,
      label: aspectLabel(type),
      meta: "Тип аспекта",
      position: "Общий паттерн аспекта"
    })
  );
  const planetPairAnchors = [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(formatDictionaryCodePart(aspect.pointA) as (typeof pointOrder)[number]) &&
        planetAspectPointIds.has(formatDictionaryCodePart(aspect.pointB) as (typeof pointOrder)[number])
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);

      return {
        id: `aspect-pair-${pointA}-${pointB}`,
        code: `${formatDictionaryCodePart(pointA)}_${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${getPointLabel(pointsById, pointA)} — ${getPointLabel(pointsById, pointB)}`,
        meta: "Связь планет",
        position: `${aspectLabel(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });

  return dedupeAnchors([...aspectTypeAnchors, ...planetPairAnchors]);
}

function sortPoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  return [...points].sort((left, right) => getPointOrder(left.id) - getPointOrder(right.id));
}

function orderAspectPair(pointA: string, pointB: string): readonly [string, string] {
  return getPointOrder(pointA) <= getPointOrder(pointB) ? [pointA, pointB] : [pointB, pointA];
}

function getPointOrder(pointId: string): number {
  const index = pointOrder.indexOf(formatDictionaryCodePart(pointId) as (typeof pointOrder)[number]);
  return index === -1 ? pointOrder.length : index;
}

function getPointLabel(pointsById: ReadonlyMap<string, ChartPoint>, pointId: string): string {
  const point = pointsById.get(pointId);
  return getPointLabelFromId(pointId, point?.label ?? pointId);
}

function getPointLabelFromId(pointId: string, fallback: string): string {
  return pointLabels[formatDictionaryCodePart(pointId)] ?? fallback;
}

function dedupeAnchors(
  anchors: readonly ChartInterpretationAnchor[]
): readonly ChartInterpretationAnchor[] {
  const seen = new Set<string>();
  return anchors.filter((anchor) => {
    if (seen.has(anchor.code)) return false;
    seen.add(anchor.code);
    return true;
  });
}

function normalizeAspectTypeCode(type: string): string {
  return formatDictionaryCodePart(type).replaceAll("_", "");
}

function formatDictionaryCodePart(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

function degree(value: number): string {
  const degrees = Math.trunc(value);
  const minutes = Math.round((value - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

function romanHouse(house: number): string {
  return romanHouses[house] ?? String(house);
}

function signLabelFor(sign: string): string {
  return signLabels[formatDictionaryCodePart(sign)] ?? sign;
}

function signPrepositional(sign: string): string {
  return signPrepositionalLabels[formatDictionaryCodePart(sign)] ?? signLabelFor(sign);
}

function aspectLabel(type: string): string {
  return aspectLabels[formatDictionaryCodePart(type)] ?? type;
}

const romanHouses: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
  11: "XI",
  12: "XII"
};

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
  south_node: "Южный узел"
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

const signPrepositionalLabels: Record<string, string> = {
  aries: "Овне",
  taurus: "Тельце",
  gemini: "Близнецах",
  cancer: "Раке",
  leo: "Льве",
  virgo: "Деве",
  libra: "Весах",
  scorpio: "Скорпионе",
  sagittarius: "Стрельце",
  capricorn: "Козероге",
  aquarius: "Водолее",
  pisces: "Рыбах"
};

const aspectLabels: Record<string, string> = {
  conjunction: "Соединение",
  opposition: "Оппозиция",
  trine: "Тригон",
  square: "Квадрат",
  sextile: "Секстиль",
  semisextile: "Полусекстиль",
  semisquare: "Полуквадрат",
  quincunx: "Квинконс",
  quintile: "Квинтиль"
};
