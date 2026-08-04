import type {
  ChartAspect,
  ChartPoint,
  ChartProgressionAspect,
  ChartSolarReturnAspect,
  ChartSynastryHouseOverlay,
  ChartTransitAspect,
  ChartResult,
  DictionaryLocale
} from "@elevenhouse/contracts";
import {
  formatAspectTypeDisplay,
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getPartnerChartRenderResult,
  getPrimaryChartRenderResult,
  getProgressionChartRenderResult,
  getProgressionChartResult,
  getRoundedChartPointPosition,
  getSolarReturnChartRenderResult,
  getSolarReturnChartResult,
  getSynastryChartResult,
  getTransitChartRenderResult,
  getTransitChartResult,
  romanHouses
} from "./chartDisplay";
import { chartEngineCopyByLocale, type ChartEngineCopy } from "./chartEngineCopy";

export type ChartInterpretationAnchorGroup = "points" | "houses" | "aspects";
export type ChartInterpretationMode = "default" | "child";
export type ChartInterpretationDictionaryCategoryCode =
  | "planets_in_signs"
  | "planets_in_houses"
  | "house_meanings"
  | "aspects"
  | "planet_aspects";

export type ChartInterpretationAnchor = {
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

export function buildChartInterpretationAnchors(
  result: ChartResult,
  options: { readonly mode?: ChartInterpretationMode; readonly locale?: DictionaryLocale } = {}
): readonly ChartInterpretationAnchor[] {
  const context = getInterpretationContext(options.locale ?? "ru");
  const synastryResult = getSynastryChartResult(result);
  if (synastryResult) {
    return buildSynastryAnchors(synastryResult, context);
  }
  if (result.method === "composite") {
    return buildCompositeAnchors(result, context);
  }
  if (result.method === "horary") {
    return buildHoraryAnchors(result, context);
  }
  if (result.method === "astrocartography") {
    return buildAstrocartographyAnchors(result, context);
  }
  if (options.mode === "child" && result.method === "natal") {
    return buildChildAnchors(result, context);
  }

  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));
  const transitResult = getTransitChartResult(result);
  const transitPointsById = new Map(
    (getTransitChartRenderResult(result)?.points ?? []).map((point) => [point.id, point])
  );
  const solarReturnResult = getSolarReturnChartResult(result);
  const solarReturnPointsById = new Map(
    (getSolarReturnChartRenderResult(result)?.points ?? []).map((point) => [point.id, point])
  );
  const progressionResult = getProgressionChartResult(result);
  const progressionPointsById = new Map(
    (getProgressionChartRenderResult(result)?.points ?? []).map((point) => [point.id, point])
  );

  return [
    ...buildPointAnchors(renderResult.points, context),
    ...buildHouseAnchors(result, context),
    ...buildAspectAnchors(renderResult.aspects, pointsById, context),
    ...(transitResult
      ? buildTransitAspectAnchors(
          transitResult.result.aspectsToNatal,
          transitPointsById,
          pointsById,
          context
        )
      : []),
    ...(solarReturnResult
      ? buildSolarReturnAspectAnchors(
          solarReturnResult.result.aspectsToNatal,
          solarReturnPointsById,
          pointsById,
          context
        )
      : []),
    ...(progressionResult
      ? buildProgressionAspectAnchors(
          progressionResult.result.aspectsToNatal,
          progressionPointsById,
          pointsById,
          context
        )
      : [])
  ];
}

function buildChildAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));

  return [
    ...buildChildPointAnchors(renderResult.points, context),
    ...buildChildHouseAnchors(result, context),
    ...buildChildAspectAnchors(renderResult.aspects, pointsById, context)
  ];
}

function buildChildPointAnchors(
  points: readonly ChartPoint[],
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label, context.locale);
    const position = `${formatChartPointPosition(point, context.locale)}${
      point.house ? ` · ${context.copy.house(romanHouses[point.house] ?? "")}` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `child-point-sign-${point.id}`,
        code: `child.${pointId}.${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: context.copy.pointInSign(
          pointLabel,
          formatSignPrepositional(point.sign, context.locale)
        ),
        meta: context.copy.childPointSign,
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `child-point-house-${point.id}`,
        code: `child.${pointId}.house.${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: context.copy.pointInHouse(
          pointLabel,
          context.copy.house(romanHouses[point.house] ?? "")
        ),
        meta: context.copy.childPointHouse,
        position
      });
    }

    return anchors;
  });
}

function buildChildHouseAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...getPrimaryChartRenderResult(result).houses]
    .sort((left, right) => left.number - right.number)
    .map((house) => {
      const position = getRoundedChartPointPosition(house);

      return {
        id: `child-house-${house.number}`,
        code: `child.house.${house.number}`,
        categoryCode: "house_meanings" as const,
        group: "houses" as const,
        label: context.copy.house(romanHouses[house.number] ?? ""),
        meta: context.copy.childHouse,
        position: `${formatHouseSignDisplay(position.sign, context.locale)} ${position.degree}`
      };
    });
}

function buildChildAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointA) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointB) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);
      const pointALabel = getPointLabel(pointsById, pointA, context.locale);
      const pointBLabel = getPointLabel(pointsById, pointB, context.locale);

      return {
        id: `child-aspect-${pointA}-${pointB}-${aspect.type}`,
        code: `child.aspect.${formatDictionaryCodePart(
          pointA
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: context.copy.childAspect,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
      };
    });
}

function buildCompositeAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));

  return [
    ...buildCompositePointAnchors(renderResult.points, context),
    ...buildCompositeHouseAnchors(result, context),
    ...buildCompositeAspectAnchors(renderResult.aspects, pointsById, context)
  ];
}

function buildCompositePointAnchors(
  points: readonly ChartPoint[],
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label, context.locale);
    const position = `${formatChartPointPosition(point, context.locale)}${
      point.house ? ` · ${context.copy.house(romanHouses[point.house] ?? "")}` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `composite-point-sign-${point.id}`,
        code: `composite.${pointId}.${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: context.copy.pointInSign(
          pointLabel,
          formatSignPrepositional(point.sign, context.locale)
        ),
        meta: context.copy.compositePointSign,
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `composite-point-house-${point.id}`,
        code: `composite.${pointId}.house.${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: context.copy.pointInHouse(
          pointLabel,
          context.copy.house(romanHouses[point.house] ?? "")
        ),
        meta: context.copy.compositePointHouse,
        position
      });
    }

    return anchors;
  });
}

function buildCompositeHouseAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...getPrimaryChartRenderResult(result).houses]
    .sort((left, right) => left.number - right.number)
    .map((house) => {
      const position = getRoundedChartPointPosition(house);

      return {
        id: `composite-house-${house.number}`,
        code: `composite.house.${house.number}`,
        categoryCode: "house_meanings" as const,
        group: "houses" as const,
        label: context.copy.house(romanHouses[house.number] ?? ""),
        meta: context.copy.compositeHouse,
        position: `${formatHouseSignDisplay(position.sign, context.locale)} ${position.degree}`
      };
    });
}

function buildCompositeAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointA) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointB) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);
      const pointALabel = getPointLabel(pointsById, pointA, context.locale);
      const pointBLabel = getPointLabel(pointsById, pointB, context.locale);

      return {
        id: `composite-aspect-${pointA}-${pointB}-${aspect.type}`,
        code: `composite.aspect.${formatDictionaryCodePart(
          pointA
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: context.copy.compositeAspect,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
      };
    });
}

function buildHoraryAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  if (result.method !== "horary") {
    return [];
  }
  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));
  const category = formatDictionaryCodePart(result.questionSnapshot.category);

  return [
    {
      id: `horary-question-${category}`,
      code: `horary.question.${category}`,
      categoryCode: "aspects",
      group: "aspects",
      label: context.copy.horaryCategory,
      meta: context.copy.horaryCategoryMeta,
      position: formatHoraryQuestionCategoryDisplay(
        result.questionSnapshot.category,
        context.locale
      )
    },
    ...buildHoraryPointAnchors(renderResult.points, context),
    ...buildHoraryHouseAnchors(result, context),
    ...buildHoraryAspectAnchors(renderResult.aspects, pointsById, context)
  ];
}

function buildAstrocartographyAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  if (result.method !== "astrocartography") {
    return [];
  }

  return result.result.lines.map((line) => ({
    id: `astrocartography-line-${line.id}`,
    code: `astrocartography.${formatDictionaryCodePart(line.point)}.${formatDictionaryCodePart(
      line.angle
    )}`,
    categoryCode: "planet_aspects" as const,
    group: "aspects" as const,
    label: line.label,
    meta: context.copy.astroLine,
    position: `${getChartPointDisplayLabel(line.point, line.point, context.locale)} · ${formatAstrocartographyAngle(
      line.angle
    )} · ${context.copy.pointsCount(line.path.length)}`
  }));
}

function formatAstrocartographyAngle(angle: string): string {
  if (angle === "mc") return "MC";
  if (angle === "ic") return "IC";
  if (angle === "asc") return "Asc";
  if (angle === "dsc") return "Dsc";
  return angle;
}

function buildHoraryPointAnchors(
  points: readonly ChartPoint[],
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label, context.locale);
    const position = `${formatChartPointPosition(point, context.locale)}${
      point.house ? ` · ${context.copy.house(romanHouses[point.house] ?? "")}` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `horary-point-sign-${point.id}`,
        code: `horary.${pointId}.${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: context.copy.pointInSign(
          pointLabel,
          formatSignPrepositional(point.sign, context.locale)
        ),
        meta: context.copy.horaryPointSign,
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `horary-point-house-${point.id}`,
        code: `horary.${pointId}.house.${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: context.copy.pointInHouse(
          pointLabel,
          context.copy.house(romanHouses[point.house] ?? "")
        ),
        meta: context.copy.horaryPointHouse,
        position
      });
    }

    return anchors;
  });
}

function buildHoraryHouseAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...getPrimaryChartRenderResult(result).houses]
    .sort((left, right) => left.number - right.number)
    .map((house) => {
      const position = getRoundedChartPointPosition(house);

      return {
        id: `horary-house-${house.number}`,
        code: `horary.house.${house.number}`,
        categoryCode: "house_meanings" as const,
        group: "houses" as const,
        label: context.copy.house(romanHouses[house.number] ?? ""),
        meta: context.copy.horaryHouse,
        position: `${formatHouseSignDisplay(position.sign, context.locale)} ${position.degree}`
      };
    });
}

function buildHoraryAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointA) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointB) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);
      const pointALabel = getPointLabel(pointsById, pointA, context.locale);
      const pointBLabel = getPointLabel(pointsById, pointB, context.locale);

      return {
        id: `horary-aspect-${pointA}-${pointB}-${aspect.type}`,
        code: `horary.aspect.${formatDictionaryCodePart(
          pointA
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: context.copy.horaryAspect,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
      };
    });
}

export function getChartInterpretationLookupCodes(
  anchors: readonly ChartInterpretationAnchor[]
): readonly string[] {
  return Array.from(new Set(anchors.map((anchor) => anchor.code)));
}

function buildPointAnchors(
  points: readonly ChartPoint[],
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  const orderedPoints = sortPoints(points);

  return orderedPoints.flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label, context.locale);
    const position = `${formatChartPointPosition(point, context.locale)}${
      point.house ? ` · ${context.copy.house(romanHouses[point.house] ?? "")}` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `point-sign-${point.id}`,
        code: `${pointId}_${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: context.copy.pointInSign(
          pointLabel,
          formatSignPrepositional(point.sign, context.locale)
        ),
        meta: context.copy.pointSign,
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `point-house-${point.id}`,
        code: `${pointId}_house_${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: context.copy.pointInHouse(
          pointLabel,
          context.copy.house(romanHouses[point.house] ?? "")
        ),
        meta: context.copy.pointHouse,
        position
      });
    }

    return anchors;
  });
}

function buildHouseAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...getPrimaryChartRenderResult(result).houses]
    .sort((left, right) => left.number - right.number)
    .map((house) => {
      const position = getRoundedChartPointPosition(house);

      return {
        id: `house-${house.number}`,
        code: `house_${house.number}`,
        categoryCode: "house_meanings" as const,
        group: "houses" as const,
        label: context.copy.house(romanHouses[house.number] ?? ""),
        meta: context.copy.houseMeaning,
        position: `${formatHouseSignDisplay(position.sign, context.locale)} ${position.degree}`
      };
    });
}

function buildTransitAspectAnchors(
  aspects: readonly ChartTransitAspect[],
  transitPointsById: ReadonlyMap<string, ChartPoint>,
  natalPointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.transitPoint) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.natalPoint) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const transitPoint = getPointLabel(transitPointsById, aspect.transitPoint, context.locale);
      const natalPoint = getPointLabel(natalPointsById, aspect.natalPoint, context.locale);

      return {
        id: `transit-aspect-${aspect.transitPoint}-${aspect.natalPoint}-${aspect.type}`,
        code: `transit_${formatDictionaryCodePart(aspect.transitPoint)}_${formatDictionaryCodePart(
          aspect.natalPoint
        )}_${normalizeAspectTypeCode(aspect.type)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: context.copy.transitLabel(transitPoint, natalPoint),
        meta: context.copy.transitMeta,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
      };
    });
}

function buildSolarReturnAspectAnchors(
  aspects: readonly ChartSolarReturnAspect[],
  solarReturnPointsById: ReadonlyMap<string, ChartPoint>,
  natalPointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.solarReturnPoint) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.natalPoint) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const solarReturnPoint = getPointLabel(
        solarReturnPointsById,
        aspect.solarReturnPoint,
        context.locale
      );
      const natalPoint = getPointLabel(natalPointsById, aspect.natalPoint, context.locale);

      return {
        id: `solar-return-aspect-${aspect.solarReturnPoint}-${aspect.natalPoint}-${aspect.type}`,
        code: `solar_return.${formatDictionaryCodePart(
          aspect.solarReturnPoint
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(aspect.natalPoint)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: context.copy.solarLabel(solarReturnPoint, natalPoint),
        meta: context.copy.solarMeta,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
      };
    });
}

function buildProgressionAspectAnchors(
  aspects: readonly ChartProgressionAspect[],
  progressionPointsById: ReadonlyMap<string, ChartPoint>,
  natalPointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  return [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.progressedPoint) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.natalPoint) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const progressedPoint = getPointLabel(
        progressionPointsById,
        aspect.progressedPoint,
        context.locale
      );
      const natalPoint = getPointLabel(natalPointsById, aspect.natalPoint, context.locale);

      return {
        id: `progression-aspect-${aspect.progressedPoint}-${aspect.natalPoint}-${aspect.type}`,
        code: `progression.${formatDictionaryCodePart(
          aspect.progressedPoint
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(aspect.natalPoint)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: context.copy.progressionLabel(progressedPoint, natalPoint),
        meta: context.copy.progressionMeta,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
      };
    });
}

function buildSynastryAnchors(
  result: ChartResult,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  const synastryResult = getSynastryChartResult(result);
  if (!synastryResult) {
    return [];
  }

  const primaryPointsById = new Map(
    getPrimaryChartRenderResult(result).points.map((point) => [point.id, point])
  );
  const partnerPointsById = new Map(
    (getPartnerChartRenderResult(result)?.points ?? []).map((point) => [point.id, point])
  );
  const aspectAnchors = [...synastryResult.result.aspectsBetween]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.primaryPoint) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.partnerPoint) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => ({
      id: `synastry-aspect-${aspect.primaryPoint}-${aspect.partnerPoint}-${aspect.type}`,
      code: `synastry.aspect.${formatDictionaryCodePart(
        aspect.primaryPoint
      )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(aspect.partnerPoint)}`,
      categoryCode: "planet_aspects" as const,
      group: "aspects" as const,
      label: `${getPointLabel(primaryPointsById, aspect.primaryPoint, context.locale)} — ${getPointLabel(
        partnerPointsById,
        aspect.partnerPoint,
        context.locale
      )} ${context.copy.partnerSuffix}`,
      meta: context.copy.synastryAspect,
      position: context.copy.orb(
        formatAspectTypeDisplay(aspect.type, context.locale),
        aspect.orb.toFixed(2)
      )
    }));
  const overlayAnchors = [...synastryResult.result.houseOverlays]
    .filter((overlay) =>
      houseDictionaryPointIds.has(
        formatDictionaryCodePart(overlay.point) as (typeof pointOrder)[number]
      )
    )
    .sort(compareHouseOverlays)
    .map((overlay) => {
      const pointMap = overlay.owner === "primary" ? primaryPointsById : partnerPointsById;
      const ownerLabel =
        overlay.owner === "primary" ? context.copy.primaryOwner : context.copy.partnerOwner;
      const projectedOwnerCode =
        overlay.projectedHouseOwner === "primary" ? "primary_house" : "partner_house";
      const projectedOwnerLabel =
        overlay.projectedHouseOwner === "primary"
          ? context.copy.primaryOwner
          : context.copy.partnerOwner;
      const projectedHouse = context.copy.house(romanHouses[overlay.projectedHouse] ?? "");

      return {
        id: `synastry-overlay-${overlay.owner}-${overlay.point}-${overlay.projectedHouseOwner}-${overlay.projectedHouse}`,
        code: `synastry.overlay.${overlay.owner}.${formatDictionaryCodePart(
          overlay.point
        )}.${projectedOwnerCode}.${overlay.projectedHouse}`,
        categoryCode: "planets_in_houses" as const,
        group: "houses" as const,
        label: `${getPointLabel(pointMap, overlay.point, context.locale)} ${ownerLabel} · ${projectedHouse} ${projectedOwnerLabel}`,
        meta: context.copy.synastryOverlay,
        position: `${projectedHouse} ${projectedOwnerLabel}`
      };
    });
  const score = synastryResult.result.relationshipScore;
  const scoreAnchors: ChartInterpretationAnchor[] = score
    ? [
        {
          id: `synastry-score-${score.label}`,
          code: `synastry.score.${formatDictionaryCodePart(score.label)}`,
          categoryCode: "aspects",
          group: "aspects",
          label: context.copy.compatibilityScore,
          meta: context.copy.synastrySummary,
          position: `${score.label} · ${score.value.toFixed(0)}`
        }
      ]
    : [];

  return dedupeAnchors([...aspectAnchors, ...overlayAnchors, ...scoreAnchors]);
}

function buildAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>,
  context: InterpretationContext
): readonly ChartInterpretationAnchor[] {
  const aspectTypeAnchors = Array.from(new Set(aspects.map((aspect) => aspect.type))).map(
    (type) => ({
      id: `aspect-type-${type}`,
      code: normalizeAspectTypeCode(type),
      categoryCode: "aspects" as const,
      group: "aspects" as const,
      label: formatAspectTypeDisplay(type, context.locale),
      meta: context.copy.aspectType,
      position: context.copy.aspectPattern
    })
  );
  const planetPairAnchors = [...aspects]
    .filter(
      (aspect) =>
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointA) as (typeof pointOrder)[number]
        ) &&
        planetAspectPointIds.has(
          formatDictionaryCodePart(aspect.pointB) as (typeof pointOrder)[number]
        )
    )
    .sort((left, right) => left.orb - right.orb)
    .slice(0, maxPlanetAspectAnchors)
    .map((aspect) => {
      const [pointA, pointB] = orderAspectPair(aspect.pointA, aspect.pointB);
      const pointALabel = getPointLabel(pointsById, pointA, context.locale);
      const pointBLabel = getPointLabel(pointsById, pointB, context.locale);

      return {
        id: `aspect-pair-${pointA}-${pointB}`,
        code: `${formatDictionaryCodePart(pointA)}_${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: context.copy.planetConnection,
        position: context.copy.orb(
          formatAspectTypeDisplay(aspect.type, context.locale),
          aspect.orb.toFixed(2)
        )
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

function compareHouseOverlays(
  left: ChartSynastryHouseOverlay,
  right: ChartSynastryHouseOverlay
): number {
  const ownerOrder = left.owner.localeCompare(right.owner);
  if (ownerOrder !== 0) {
    return ownerOrder;
  }

  const pointOrderDifference = getPointOrder(left.point) - getPointOrder(right.point);
  if (pointOrderDifference !== 0) {
    return pointOrderDifference;
  }

  return left.projectedHouse - right.projectedHouse;
}

function getPointOrder(pointId: string): number {
  const index = pointOrder.indexOf(
    formatDictionaryCodePart(pointId) as (typeof pointOrder)[number]
  );
  return index === -1 ? pointOrder.length : index;
}

function getPointLabel(
  pointsById: ReadonlyMap<string, ChartPoint>,
  pointId: string,
  locale: DictionaryLocale
): string {
  const point = pointsById.get(pointId);
  return getChartPointDisplayLabel(pointId, point?.label ?? pointId, locale);
}

function dedupeAnchors(
  anchors: readonly ChartInterpretationAnchor[]
): readonly ChartInterpretationAnchor[] {
  const seen = new Set<string>();
  return anchors.filter((anchor) => {
    if (seen.has(anchor.code)) {
      return false;
    }
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

function formatSignPrepositional(sign: string, locale: DictionaryLocale): string {
  if (locale === "en") return formatHouseSignDisplay(sign, locale);
  const normalized = sign.toLowerCase();
  const labels: Record<string, string> = {
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

  return labels[normalized] ?? formatHouseSignDisplay(sign, locale);
}

function formatHoraryQuestionCategoryDisplay(category: string, locale: DictionaryLocale): string {
  const categories = chartEngineCopyByLocale[locale].horary.categories;
  return category in categories ? categories[category as keyof typeof categories] : category;
}

type InterpretationContext = {
  readonly locale: DictionaryLocale;
  readonly copy: ChartEngineCopy["interpretationAnchors"];
};

function getInterpretationContext(locale: DictionaryLocale): InterpretationContext {
  return { locale, copy: chartEngineCopyByLocale[locale].interpretationAnchors };
}
