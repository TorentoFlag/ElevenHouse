import type { ChartAspect, ChartPoint, ReproducibleChartResult } from "@elevenhouse/contracts";
import type { ChartInterpretationDraftPromptInput } from "@elevenhouse/ai";
import type { DictionaryEffectiveEntry } from "@elevenhouse/domain";

type ChartAiContextInput = {
  readonly locale: "ru" | "en";
  readonly result: ReproducibleNatalChartResult;
  readonly dictionaryEntries: readonly DictionaryEffectiveEntry[];
};

type ReproducibleNatalChartResult = Extract<ReproducibleChartResult, { method: "natal" }>;

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
const aspectPointIds = new Set(pointOrder.slice(0, 10));
const maxAspects = 18;
const maxGroundingEntries = 36;
const maxGroundingContentLength = 1_600;

export function getNatalChartAiDictionaryCodes(
  result: ReproducibleNatalChartResult
): readonly string[] {
  const codes: string[] = [];
  const pointsById = new Map(result.result.points.map((point) => [point.id, point]));

  for (const point of sortPoints(result.result.points)) {
    const pointId = normalizeCodePart(point.id);
    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      codes.push(`${pointId}_${normalizeCodePart(point.sign)}`);
    }
    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      codes.push(`${pointId}_house_${point.house}`);
    }
  }

  for (const house of [...result.result.houses].sort((left, right) => left.number - right.number)) {
    codes.push(`house_${house.number}`);
  }

  for (const aspect of selectMajorAspects(result.result.aspects)) {
    if (!isDictionaryAspect(aspect)) continue;
    const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);
    if (!pointsById.has(pointA) || !pointsById.has(pointB)) continue;
    codes.push(
      `aspect_${normalizeCodePart(pointA)}_${normalizeAspectTypeCode(
        aspect.type
      )}_${normalizeCodePart(pointB)}`
    );
  }

  return Array.from(new Set(codes));
}

export function buildNatalChartAiContext(
  input: ChartAiContextInput
): ChartInterpretationDraftPromptInput {
  const zodiac = input.result.settings.zodiac;
  if (zodiac !== "tropical") {
    throw new Error("Stored natal result must declare the tropical zodiac setting");
  }

  const groundingByCode = new Map(
    input.dictionaryEntries
      .filter((entry) => entry.source === "platform")
      .map((entry) => [entry.code, entry])
  );
  const orderedGrounding = getNatalChartAiDictionaryCodes(input.result)
    .map((code) => groundingByCode.get(code))
    .filter((entry): entry is DictionaryEffectiveEntry => entry !== undefined)
    .slice(0, maxGroundingEntries)
    .map((entry) => ({
      code: entry.code,
      categoryCode: entry.categoryCode,
      title: entry.title,
      content: trimText(entry.content, maxGroundingContentLength),
      source: entry.source
    }));

  return {
    locale: input.locale,
    methodCode: "natal",
    settings: {
      zodiac,
      houseSystem: input.result.settings.houseSystem,
      nodeType: input.result.settings.nodeType,
      aspectPreset: input.result.settings.aspectPreset,
      orbMultiplier: input.result.settings.orbMultiplier
    },
    points: sortPoints(input.result.result.points).map((point) => ({
      id: point.id,
      label: point.label,
      sign: point.sign,
      degree: round(point.signDegree),
      house: point.house ?? null,
      retrograde: point.retrograde ?? false
    })),
    houses: [...input.result.result.houses]
      .sort((left, right) => left.number - right.number)
      .map((house) => ({
        number: house.number,
        sign: house.sign,
        degree: round(house.signDegree)
      })),
    majorAspects: selectMajorAspects(input.result.result.aspects).map((aspect) => ({
      pointA: aspect.pointA,
      pointB: aspect.pointB,
      type: aspect.type,
      orb: round(aspect.orb),
      applying: aspect.applying ?? null,
      strength: aspect.strength ?? null
    })),
    distributions: input.result.result.distributions,
    warnings: input.result.result.warnings.map((warning) => warning.code),
    dictionaryGrounding: orderedGrounding
  };
}

function sortPoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  const order = new Map<string, number>(pointOrder.map((pointId, index) => [pointId, index]));
  return [...points].sort(
    (left, right) => (order.get(left.id) ?? 100) - (order.get(right.id) ?? 100)
  );
}

function selectMajorAspects(aspects: readonly ChartAspect[]): readonly ChartAspect[] {
  return [...aspects].sort(compareAspects).slice(0, maxAspects);
}

function compareAspects(left: ChartAspect, right: ChartAspect): number {
  const leftStrength = left.strength ?? 0;
  const rightStrength = right.strength ?? 0;
  if (leftStrength !== rightStrength) return rightStrength - leftStrength;
  return left.orb - right.orb;
}

function isDictionaryAspect(aspect: ChartAspect): boolean {
  return (
    aspectPointIds.has(normalizeCodePart(aspect.pointA) as (typeof pointOrder)[number]) &&
    aspectPointIds.has(normalizeCodePart(aspect.pointB) as (typeof pointOrder)[number])
  );
}

function orderAspectPair(left: string, right: string): readonly [string, string] {
  const leftIndex = pointOrder.indexOf(normalizeCodePart(left) as (typeof pointOrder)[number]);
  const rightIndex = pointOrder.indexOf(normalizeCodePart(right) as (typeof pointOrder)[number]);
  if (leftIndex === -1 || rightIndex === -1 || leftIndex <= rightIndex) return [left, right];
  return [right, left];
}

function normalizeAspectTypeCode(type: string): string {
  return normalizeCodePart(type).replace(/^opposition$/, "opposition");
}

function normalizeCodePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function trimText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trim()}…`
    : normalized;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
