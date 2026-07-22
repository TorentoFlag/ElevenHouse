import type {
  ChartAspect,
  ChartPoint,
  ChartSynastryHouseOverlay,
  ChartTransitAspect,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import {
  formatAspectTypeDisplay,
  formatChartPointPosition,
  formatDegree,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getPartnerChartRenderResult,
  getPrimaryChartRenderResult,
  getSynastryChartResult,
  getTransitChartRenderResult,
  getTransitChartResult,
  romanHouses
} from "./chartDisplay";

export type ChartInterpretationAnchorGroup = "points" | "houses" | "aspects";
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
  result: StoredChartCalculationPayload
): readonly ChartInterpretationAnchor[] {
  const synastryResult = getSynastryChartResult(result);
  if (synastryResult) {
    return buildSynastryAnchors(synastryResult);
  }

  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));
  const transitResult = getTransitChartResult(result);
  const transitPointsById = new Map(
    (getTransitChartRenderResult(result)?.points ?? []).map((point) => [point.id, point])
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
      : [])
  ];
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
    .map((house) => ({
      id: `house-${house.number}`,
      code: `house_${house.number}`,
      categoryCode: "house_meanings" as const,
      group: "houses" as const,
      label: `${romanHouses[house.number]} дом`,
      meta: "Значение дома",
      position: `${formatHouseSignDisplay(house.sign)} ${formatDegree(house.signDegree)}`
    }));
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
