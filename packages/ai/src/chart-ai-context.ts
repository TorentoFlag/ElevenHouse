import type {
  ChartAspect,
  ChartPoint,
  ChartRenderResult,
  ReproducibleChartResult
} from "@elevenhouse/contracts";
import type { ChartAiDraftSubjectKind } from "./chart-ai-draft-profile";
import type { ChartInterpretationDraftPromptInput } from "./prompts/chart-interpretation-draft.v1";
import type { ChartInterpretationDraftPromptV2Input } from "./prompts/chart-interpretation-draft.v2";

type ChartAiDictionaryEntry = {
  readonly code: string;
  readonly categoryCode: string;
  readonly title: string;
  readonly content: string;
  readonly source: "platform" | "modified" | "custom";
};
type ChartAiContextInput = {
  readonly locale: "ru" | "en";
  readonly result: ReproducibleNatalChartResult;
  readonly dictionaryEntries: readonly ChartAiDictionaryEntry[];
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
  return getChartRenderAiDictionaryCodes(result.result);
}

export function getChartAiDictionaryCodes(result: ReproducibleChartResult): readonly string[] {
  if (result.method === "natal" || result.method === "composite" || result.method === "horary") {
    return getChartRenderAiDictionaryCodes(result.result);
  }
  if (result.method === "astrocartography") return [];
  if (result.method === "synastry") {
    return uniqueCodes([
      ...getChartRenderAiDictionaryCodes(result.result.primary),
      ...getChartRenderAiDictionaryCodes(result.result.partner)
    ]);
  }
  if (result.method === "transit") {
    return uniqueCodes([
      ...getChartRenderAiDictionaryCodes(result.result.natal),
      ...getChartRenderAiDictionaryCodes(result.result.transit)
    ]);
  }
  if (result.method === "solar_return") {
    return uniqueCodes([
      ...getChartRenderAiDictionaryCodes(result.result.natal),
      ...getChartRenderAiDictionaryCodes(result.result.solarReturn)
    ]);
  }
  return uniqueCodes([
    ...getChartRenderAiDictionaryCodes(result.result.natal),
    ...getChartRenderAiDictionaryCodes(result.result.progressed)
  ]);
}

export function buildChartAiDraftContext(input: {
  readonly locale: "ru" | "en";
  readonly result: ReproducibleChartResult;
  readonly subjectKind: ChartAiDraftSubjectKind;
  readonly dictionaryEntries: readonly ChartAiDictionaryEntry[];
}): ChartInterpretationDraftPromptV2Input {
  const dictionaryGrounding = selectDictionaryGrounding(
    getChartAiDictionaryCodes(input.result),
    input.dictionaryEntries
  );
  return {
    locale: input.locale,
    methodCode: input.result.method,
    subjectKind: input.subjectKind,
    ...(input.result.method === "horary"
      ? {
          horaryQuestion: {
            question: input.result.questionSnapshot.question,
            category: input.result.questionSnapshot.category
          }
        }
      : {}),
    factors: buildChartAiFactorSections(input.result),
    warnings: [...collectWarnings(input.result)],
    dictionaryGrounding
  };
}

function getChartRenderAiDictionaryCodes(result: ChartRenderResult): readonly string[] {
  const codes: string[] = [];
  const pointsById = new Map(result.points.map((point) => [point.id, point]));
  for (const point of sortPoints(result.points)) {
    const pointId = normalizeCodePart(point.id);
    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      codes.push(`${pointId}_${normalizeCodePart(point.sign)}`);
    }
    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      codes.push(`${pointId}_house_${point.house}`);
    }
  }
  for (const house of [...result.houses].sort((left, right) => left.number - right.number)) {
    codes.push(`house_${house.number}`);
  }
  for (const aspect of selectMajorAspects(result.aspects)) {
    if (!isDictionaryAspect(aspect)) continue;
    const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);
    if (!pointsById.has(pointA) || !pointsById.has(pointB)) continue;
    codes.push(
      `aspect_${normalizeCodePart(pointA)}_${normalizeAspectTypeCode(aspect.type)}_${normalizeCodePart(pointB)}`
    );
  }
  return uniqueCodes(codes);
}

export function buildNatalChartAiContext(
  input: ChartAiContextInput
): ChartInterpretationDraftPromptInput {
  const zodiac = input.result.settings.zodiac;
  if (zodiac !== "tropical")
    throw new Error("Stored natal result must declare the tropical zodiac setting");
  const orderedGrounding = selectDictionaryGrounding(
    getNatalChartAiDictionaryCodes(input.result),
    input.dictionaryEntries
  );
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

function selectDictionaryGrounding(
  codes: readonly string[],
  dictionaryEntries: readonly ChartAiDictionaryEntry[]
) {
  const groundingByCode = new Map(
    dictionaryEntries
      .filter((entry) => entry.source === "platform")
      .map((entry) => [entry.code, entry])
  );
  return codes
    .map((code) => groundingByCode.get(code))
    .filter((entry): entry is ChartAiDictionaryEntry => entry !== undefined)
    .slice(0, maxGroundingEntries)
    .map((entry) => ({
      code: entry.code,
      categoryCode: entry.categoryCode,
      title: entry.title,
      content: trimText(entry.content, maxGroundingContentLength),
      source: entry.source
    }));
}

function buildChartAiFactorSections(
  result: ReproducibleChartResult
): ChartInterpretationDraftPromptV2Input["factors"] {
  const settings = {
    section: "settings",
    facts: [
      { label: "zodiac", value: result.settings.zodiac },
      { label: "houseSystem", value: result.settings.houseSystem },
      { label: "nodeType", value: result.settings.nodeType },
      { label: "aspectPreset", value: result.settings.aspectPreset }
    ]
  };
  if (result.method === "natal" || result.method === "composite" || result.method === "horary") {
    return [settings, chartRenderFactorSection("chart", result.result)];
  }
  if (result.method === "astrocartography") {
    return [
      settings,
      {
        section: "angular_lines",
        facts: result.result.lines.map((line) => ({
          label: line.id,
          value: `${line.label} (${line.point}/${line.angle})`
        }))
      }
    ];
  }
  if (result.method === "synastry") {
    return [
      settings,
      chartRenderFactorSection("primary_chart", result.result.primary),
      chartRenderFactorSection("partner_chart", result.result.partner),
      {
        section: "between_charts",
        facts: result.result.aspectsBetween.slice(0, maxAspects).map((aspect) => ({
          label: `${aspect.primaryPoint}-${aspect.partnerPoint}`,
          value: `${aspect.type}; orb ${round(aspect.orb)}`
        }))
      }
    ];
  }
  if (result.method === "transit") {
    return [
      settings,
      chartRenderFactorSection("natal_chart", result.result.natal),
      chartRenderFactorSection("transit_chart", result.result.transit),
      aspectFactorSection("aspects_to_natal", result.result.aspectsToNatal)
    ];
  }
  if (result.method === "solar_return") {
    return [
      settings,
      {
        section: "return_year",
        facts: [{ label: "year", value: String(result.solarReturnSnapshot.year) }]
      },
      chartRenderFactorSection("natal_chart", result.result.natal),
      chartRenderFactorSection("solar_return_chart", result.result.solarReturn),
      aspectFactorSection("aspects_to_natal", result.result.aspectsToNatal)
    ];
  }
  return [
    settings,
    {
      section: "target_date",
      facts: [{ label: "date", value: result.progressionSnapshot.targetDate }]
    },
    chartRenderFactorSection("natal_chart", result.result.natal),
    chartRenderFactorSection("progressed_chart", result.result.progressed),
    aspectFactorSection("aspects_to_natal", result.result.aspectsToNatal)
  ];
}

function chartRenderFactorSection(
  section: string,
  result: ChartRenderResult
): ChartInterpretationDraftPromptV2Input["factors"][number] {
  return {
    section,
    facts: [
      ...sortPoints(result.points).map((point) => ({
        label: point.label,
        value: `${point.sign} ${round(point.signDegree)}°${point.house ? `, house ${point.house}` : ""}${point.retrograde ? ", retrograde" : ""}`
      })),
      ...selectMajorAspects(result.aspects).map((aspect) => ({
        label: `${aspect.pointA}-${aspect.pointB}`,
        value: `${aspect.type}; orb ${round(aspect.orb)}`
      }))
    ].slice(0, 80)
  };
}

function aspectFactorSection(
  section: string,
  aspects: readonly {
    readonly type: string;
    readonly orb: number;
    readonly pointA?: string;
    readonly pointB?: string;
    readonly transitPoint?: string;
    readonly solarReturnPoint?: string;
    readonly progressedPoint?: string;
    readonly natalPoint: string;
  }[]
) {
  const facts = [...aspects]
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxAspects)
    .map((aspect) => ({
      label: `${resolveAspectSourcePoint(aspect)}-${aspect.natalPoint}`,
      value: `${aspect.type}; orb ${round(aspect.orb)}`
    }));
  return facts.length > 0
    ? { section, facts }
    : { section, facts: [{ label: "none", value: "none" }] };
}

function resolveAspectSourcePoint(aspect: {
  readonly pointA?: string;
  readonly transitPoint?: string;
  readonly solarReturnPoint?: string;
  readonly progressedPoint?: string;
}): string {
  return (
    aspect.pointA ??
    aspect.transitPoint ??
    aspect.solarReturnPoint ??
    aspect.progressedPoint ??
    "unknown"
  );
}

function collectWarnings(result: ReproducibleChartResult): readonly string[] {
  if (result.method === "astrocartography")
    return result.result.warnings.map((warning) => warning.code);
  if (result.method === "transit") return result.result.warnings.map((warning) => warning.code);
  if (result.method === "synastry") return result.result.warnings.map((warning) => warning.code);
  if (result.method === "solar_return")
    return result.result.warnings.map((warning) => warning.code);
  if (result.method === "progression") return result.result.warnings.map((warning) => warning.code);
  return result.result.warnings.map((warning) => warning.code);
}

function uniqueCodes(codes: readonly string[]): readonly string[] {
  return Array.from(new Set(codes));
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
  const strength = (right.strength ?? 0) - (left.strength ?? 0);
  return strength !== 0 ? strength : left.orb - right.orb;
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
  return leftIndex === -1 || rightIndex === -1 || leftIndex <= rightIndex
    ? [left, right]
    : [right, left];
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
