import type {
  ChartAspect,
  ChartPoint,
  ChartProgressionAspect,
  ChartSolarReturnAspect,
  ChartSynastryHouseOverlay,
  ChartTransitAspect,
  StoredChartCalculationPayload
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
  result: StoredChartCalculationPayload,
  options: { readonly mode?: ChartInterpretationMode } = {}
): readonly ChartInterpretationAnchor[] {
  const synastryResult = getSynastryChartResult(result);
  if (synastryResult) {
    return buildSynastryAnchors(synastryResult);
  }
  if (result.method === "composite") {
    return buildCompositeAnchors(result);
  }
  if (result.method === "horary") {
    return buildHoraryAnchors(result);
  }
  if (options.mode === "child" && result.method === "natal") {
    return buildChildAnchors(result);
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
    ...buildPointAnchors(renderResult.points),
    ...buildHouseAnchors(result),
    ...buildAspectAnchors(renderResult.aspects, pointsById),
    ...(transitResult
      ? buildTransitAspectAnchors(
          transitResult.result.aspectsToNatal,
          transitPointsById,
          pointsById
        )
      : []),
    ...(solarReturnResult
      ? buildSolarReturnAspectAnchors(
          solarReturnResult.result.aspectsToNatal,
          solarReturnPointsById,
          pointsById
        )
      : []),
    ...(progressionResult
      ? buildProgressionAspectAnchors(
          progressionResult.result.aspectsToNatal,
          progressionPointsById,
          pointsById
        )
      : [])
  ];
}

function buildChildAnchors(
  result: StoredChartCalculationPayload
): readonly ChartInterpretationAnchor[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));

  return [
    ...buildChildPointAnchors(renderResult.points),
    ...buildChildHouseAnchors(result),
    ...buildChildAspectAnchors(renderResult.aspects, pointsById)
  ];
}

function buildChildPointAnchors(
  points: readonly ChartPoint[]
): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label);
    const position = `${formatChartPointPosition(point)}${
      point.house ? ` · ${romanHouses[point.house]} дом` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `child-point-sign-${point.id}`,
        code: `child.${pointId}.${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: `${pointLabel} в ${formatSignPrepositional(point.sign)}`,
        meta: "Детская карта · планета в знаке",
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `child-point-house-${point.id}`,
        code: `child.${pointId}.house.${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: `${pointLabel} · ${romanHouses[point.house]} дом`,
        meta: "Детская карта · планета в доме",
        position
      });
    }

    return anchors;
  });
}

function buildChildHouseAnchors(
  result: StoredChartCalculationPayload
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
        label: `${romanHouses[house.number]} дом`,
        meta: "Детская карта · значение дома",
        position: `${formatHouseSignDisplay(position.sign)} ${position.degree}`
      };
    });
}

function buildChildAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>
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
      const pointALabel = getPointLabel(pointsById, pointA);
      const pointBLabel = getPointLabel(pointsById, pointB);

      return {
        id: `child-aspect-${pointA}-${pointB}-${aspect.type}`,
        code: `child.aspect.${formatDictionaryCodePart(
          pointA
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: "Детская карта · аспект",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });
}

function buildCompositeAnchors(
  result: StoredChartCalculationPayload
): readonly ChartInterpretationAnchor[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));

  return [
    ...buildCompositePointAnchors(renderResult.points),
    ...buildCompositeHouseAnchors(result),
    ...buildCompositeAspectAnchors(renderResult.aspects, pointsById)
  ];
}

function buildCompositePointAnchors(
  points: readonly ChartPoint[]
): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label);
    const position = `${formatChartPointPosition(point)}${
      point.house ? ` · ${romanHouses[point.house]} дом` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `composite-point-sign-${point.id}`,
        code: `composite.${pointId}.${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: `${pointLabel} в ${formatSignPrepositional(point.sign)}`,
        meta: "Композит · планета в знаке",
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `composite-point-house-${point.id}`,
        code: `composite.${pointId}.house.${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: `${pointLabel} · ${romanHouses[point.house]} дом`,
        meta: "Композит · планета в доме",
        position
      });
    }

    return anchors;
  });
}

function buildCompositeHouseAnchors(
  result: StoredChartCalculationPayload
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
        label: `${romanHouses[house.number]} дом`,
        meta: "Композит · значение дома",
        position: `${formatHouseSignDisplay(position.sign)} ${position.degree}`
      };
    });
}

function buildCompositeAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>
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
      const pointALabel = getPointLabel(pointsById, pointA);
      const pointBLabel = getPointLabel(pointsById, pointB);

      return {
        id: `composite-aspect-${pointA}-${pointB}-${aspect.type}`,
        code: `composite.aspect.${formatDictionaryCodePart(
          pointA
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: "Композит · аспект",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });
}

function buildHoraryAnchors(
  result: StoredChartCalculationPayload
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
      label: "Категория вопроса",
      meta: "Хорар · категория вопроса",
      position: formatHoraryQuestionCategoryDisplay(result.questionSnapshot.category)
    },
    ...buildHoraryPointAnchors(renderResult.points),
    ...buildHoraryHouseAnchors(result),
    ...buildHoraryAspectAnchors(renderResult.aspects, pointsById)
  ];
}

function buildHoraryPointAnchors(
  points: readonly ChartPoint[]
): readonly ChartInterpretationAnchor[] {
  return sortPoints(points).flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label);
    const position = `${formatChartPointPosition(point)}${
      point.house ? ` · ${romanHouses[point.house]} дом` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `horary-point-sign-${point.id}`,
        code: `horary.${pointId}.${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: `${pointLabel} в ${formatSignPrepositional(point.sign)}`,
        meta: "Хорар · планета в знаке",
        position
      });
    }

    if (point.house && houseDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `horary-point-house-${point.id}`,
        code: `horary.${pointId}.house.${point.house}`,
        categoryCode: "planets_in_houses",
        group: "points",
        label: `${pointLabel} · ${romanHouses[point.house]} дом`,
        meta: "Хорар · планета в доме",
        position
      });
    }

    return anchors;
  });
}

function buildHoraryHouseAnchors(
  result: StoredChartCalculationPayload
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
        label: `${romanHouses[house.number]} дом`,
        meta: "Хорар · значение дома",
        position: `${formatHouseSignDisplay(position.sign)} ${position.degree}`
      };
    });
}

function buildHoraryAspectAnchors(
  aspects: readonly ChartAspect[],
  pointsById: ReadonlyMap<string, ChartPoint>
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
      const pointALabel = getPointLabel(pointsById, pointA);
      const pointBLabel = getPointLabel(pointsById, pointB);

      return {
        id: `horary-aspect-${pointA}-${pointB}-${aspect.type}`,
        code: `horary.aspect.${formatDictionaryCodePart(
          pointA
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: "Хорар · аспект",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });
}

export function getChartInterpretationLookupCodes(
  anchors: readonly ChartInterpretationAnchor[]
): readonly string[] {
  return Array.from(new Set(anchors.map((anchor) => anchor.code)));
}

function buildPointAnchors(points: readonly ChartPoint[]): readonly ChartInterpretationAnchor[] {
  const orderedPoints = sortPoints(points);

  return orderedPoints.flatMap((point) => {
    const anchors: ChartInterpretationAnchor[] = [];
    const pointId = formatDictionaryCodePart(point.id);
    const pointLabel = getChartPointDisplayLabel(point.id, point.label);
    const position = `${formatChartPointPosition(point)}${
      point.house ? ` · ${romanHouses[point.house]} дом` : ""
    }`;

    if (signDictionaryPointIds.has(pointId as (typeof pointOrder)[number])) {
      anchors.push({
        id: `point-sign-${point.id}`,
        code: `${pointId}_${formatDictionaryCodePart(point.sign)}`,
        categoryCode: "planets_in_signs",
        group: "points",
        label: `${pointLabel} в ${formatSignPrepositional(point.sign)}`,
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
        label: `${pointLabel} · ${romanHouses[point.house]} дом`,
        meta: "Планета в доме",
        position
      });
    }

    return anchors;
  });
}

function buildHouseAnchors(
  result: StoredChartCalculationPayload
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
        label: `${romanHouses[house.number]} дом`,
        meta: "Значение дома",
        position: `${formatHouseSignDisplay(position.sign)} ${position.degree}`
      };
    });
}

function buildTransitAspectAnchors(
  aspects: readonly ChartTransitAspect[],
  transitPointsById: ReadonlyMap<string, ChartPoint>,
  natalPointsById: ReadonlyMap<string, ChartPoint>
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
      const transitPoint = getPointLabel(transitPointsById, aspect.transitPoint);
      const natalPoint = getPointLabel(natalPointsById, aspect.natalPoint);

      return {
        id: `transit-aspect-${aspect.transitPoint}-${aspect.natalPoint}-${aspect.type}`,
        code: `transit_${formatDictionaryCodePart(aspect.transitPoint)}_${formatDictionaryCodePart(
          aspect.natalPoint
        )}_${normalizeAspectTypeCode(aspect.type)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `Транзитный ${transitPoint} — ${natalPoint}`,
        meta: "Транзит к наталу",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });
}

function buildSolarReturnAspectAnchors(
  aspects: readonly ChartSolarReturnAspect[],
  solarReturnPointsById: ReadonlyMap<string, ChartPoint>,
  natalPointsById: ReadonlyMap<string, ChartPoint>
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
      const solarReturnPoint = getPointLabel(solarReturnPointsById, aspect.solarReturnPoint);
      const natalPoint = getPointLabel(natalPointsById, aspect.natalPoint);

      return {
        id: `solar-return-aspect-${aspect.solarReturnPoint}-${aspect.natalPoint}-${aspect.type}`,
        code: `solar_return.${formatDictionaryCodePart(
          aspect.solarReturnPoint
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(aspect.natalPoint)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `Солярный ${solarReturnPoint} — ${natalPoint}`,
        meta: "Соляр к наталу",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });
}

function buildProgressionAspectAnchors(
  aspects: readonly ChartProgressionAspect[],
  progressionPointsById: ReadonlyMap<string, ChartPoint>,
  natalPointsById: ReadonlyMap<string, ChartPoint>
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
      const progressedPoint = getPointLabel(progressionPointsById, aspect.progressedPoint);
      const natalPoint = getPointLabel(natalPointsById, aspect.natalPoint);

      return {
        id: `progression-aspect-${aspect.progressedPoint}-${aspect.natalPoint}-${aspect.type}`,
        code: `progression.${formatDictionaryCodePart(
          aspect.progressedPoint
        )}.${normalizeAspectTypeCode(aspect.type)}.${formatDictionaryCodePart(aspect.natalPoint)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `Прогрессивный ${progressedPoint} — ${natalPoint}`,
        meta: "Прогрессия к наталу",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
      };
    });
}

function buildSynastryAnchors(
  result: StoredChartCalculationPayload
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
      label: `${getPointLabel(primaryPointsById, aspect.primaryPoint)} — ${getPointLabel(
        partnerPointsById,
        aspect.partnerPoint
      )} партнёра`,
      meta: "Синастрический аспект",
      position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
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
      const ownerLabel = overlay.owner === "primary" ? "клиента" : "партнёра";
      const projectedOwnerCode =
        overlay.projectedHouseOwner === "primary" ? "primary_house" : "partner_house";
      const projectedOwnerLabel =
        overlay.projectedHouseOwner === "primary" ? "клиента" : "партнёра";

      return {
        id: `synastry-overlay-${overlay.owner}-${overlay.point}-${overlay.projectedHouseOwner}-${overlay.projectedHouse}`,
        code: `synastry.overlay.${overlay.owner}.${formatDictionaryCodePart(
          overlay.point
        )}.${projectedOwnerCode}.${overlay.projectedHouse}`,
        categoryCode: "planets_in_houses" as const,
        group: "houses" as const,
        label: `${getPointLabel(pointMap, overlay.point)} ${ownerLabel} · ${
          romanHouses[overlay.projectedHouse]
        } дом ${projectedOwnerLabel}`,
        meta: "Синастрическое наложение",
        position: `${romanHouses[overlay.projectedHouse]} дом ${projectedOwnerLabel}`
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
          label: "Оценка совместимости",
          meta: "Синастрический итог",
          position: `${score.label} · ${score.value.toFixed(0)}`
        }
      ]
    : [];

  return dedupeAnchors([...aspectAnchors, ...overlayAnchors, ...scoreAnchors]);
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
      label: formatAspectTypeDisplay(type),
      meta: "Тип аспекта",
      position: "Общий паттерн аспекта"
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
      const pointALabel = getPointLabel(pointsById, pointA);
      const pointBLabel = getPointLabel(pointsById, pointB);

      return {
        id: `aspect-pair-${pointA}-${pointB}`,
        code: `${formatDictionaryCodePart(pointA)}_${formatDictionaryCodePart(pointB)}`,
        categoryCode: "planet_aspects" as const,
        group: "aspects" as const,
        label: `${pointALabel} — ${pointBLabel}`,
        meta: "Связь планет",
        position: `${formatAspectTypeDisplay(aspect.type)} · орбис ${aspect.orb.toFixed(2)}°`
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

function getPointLabel(pointsById: ReadonlyMap<string, ChartPoint>, pointId: string): string {
  const point = pointsById.get(pointId);
  return getChartPointDisplayLabel(pointId, point?.label ?? pointId);
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

function formatSignPrepositional(sign: string): string {
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

  return labels[normalized] ?? formatHouseSignDisplay(sign);
}

function formatHoraryQuestionCategoryDisplay(category: string): string {
  const labels: Record<string, string> = {
    relationship: "Отношения",
    career: "Работа",
    money: "Деньги",
    home: "Дом",
    health: "Здоровье",
    travel: "Поездка",
    other: "Другое"
  };

  return labels[category] ?? category;
}
