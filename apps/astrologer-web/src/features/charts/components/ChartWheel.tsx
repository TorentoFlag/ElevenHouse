import type {
  ChartAspect,
  ChartPoint,
  ChartSynastryAspect,
  ChartTransitAspect,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import {
  formatAspectTypeDisplay,
  formatDegree,
  formatHouseSignDisplay,
  getPrimaryChartRenderResult,
  getPartnerChartRenderResult,
  getSynastryChartResult,
  getTransitChartRenderResult,
  getTransitChartResult,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  romanHouses
} from "../model/chartDisplay";
import styles from "./ChartEnginePage.module.css";

const zodiacSymbols = ["♈︎", "♉︎", "♊︎", "♋︎", "♌︎", "♍︎", "♎︎", "♏︎", "♐︎", "♑︎", "♒︎", "♓︎"];
const zodiacElementClasses = [
  styles.zodiacFire,
  styles.zodiacEarth,
  styles.zodiacAir,
  styles.zodiacWater,
  styles.zodiacFire,
  styles.zodiacEarth,
  styles.zodiacAir,
  styles.zodiacWater,
  styles.zodiacFire,
  styles.zodiacEarth,
  styles.zodiacAir,
  styles.zodiacWater
];
const axisPointIds = new Set(["ascendant", "midheaven"]);

export type ChartWheelProps = {
  readonly result: StoredChartCalculationPayload | null;
  readonly hoveredPointId: string | null;
  readonly onHoverPoint: (pointId: string | null) => void;
};

export function ChartWheel({ hoveredPointId, onHoverPoint, result }: ChartWheelProps) {
  const renderResult = result ? getPrimaryChartRenderResult(result) : null;
  const transitResult = result ? getTransitChartResult(result) : null;
  const synastryResult = result ? getSynastryChartResult(result) : null;
  const transitRenderResult = result ? getTransitChartRenderResult(result) : null;
  const partnerRenderResult = result ? getPartnerChartRenderResult(result) : null;
  const houses = renderResult?.houses ?? [];
  const points = renderResult?.points ?? [];
  const transitPoints = transitRenderResult?.points ?? [];
  const partnerPoints = partnerRenderResult?.points ?? [];
  const ascLongitude = houses.find((house) => house.number === 1)?.longitude ?? 0;
  const markerLongitudes = spreadPointLongitudes(
    points.filter((point) => !axisPointIds.has(point.id))
  );
  const transitMarkerLongitudes = spreadPointLongitudes(
    transitPoints.filter((point) => !axisPointIds.has(point.id)),
    9
  );
  const partnerMarkerLongitudes = spreadPointLongitudes(
    partnerPoints.filter((point) => !axisPointIds.has(point.id)),
    9
  );
  const hoveredPoint = getHoveredPoint({ hoveredPointId, points, transitPoints, partnerPoints });

  return (
    <div className={styles.wheelStage} aria-label="Натальная карта">
      <svg className={styles.wheelSvg} viewBox="0 0 520 520" role="img" aria-label="Круг карты">
        <circle className={styles.wheelOuter} cx="260" cy="260" r="220" />
        <circle className={styles.wheelMiddle} cx="260" cy="260" r="166" />
        <circle className={styles.aspectHub} cx="260" cy="260" r="132" />
        <circle className={styles.wheelInner} cx="260" cy="260" r="72" />
        {Array.from({ length: 360 }, (_, degree) => {
          const isSign = degree % 30 === 0;
          const isTen = degree % 10 === 0;
          const isFive = degree % 5 === 0;
          const tickLength = isSign ? 14 : isTen ? 9 : isFive ? 6 : 3.5;
          const tick = radialLine(degree, 166 - tickLength, 166, ascLongitude);

          return (
            <line
              className={[
                styles.wheelDegreeTick,
                isSign ? styles.wheelDegreeTickStrong : "",
                isTen ? styles.wheelDegreeTickMedium : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={`degree-${degree}`}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
            />
          );
        })}
        {Array.from({ length: 12 }, (_, index) => {
          const angle = index * 30;
          const line = radialLine(angle, 166, 220, ascLongitude);
          const label = polar(angle + 15, 193, ascLongitude);

          return (
            <g key={zodiacSymbols[index]}>
              <line
                className={styles.wheelTick}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
              />
              <text
                className={[styles.zodiacLabel, zodiacElementClasses[index]].join(" ")}
                x={label.x}
                y={label.y}
              >
                {zodiacSymbols[index]}
              </text>
            </g>
          );
        })}
        {houses.map((house) => {
          const line = radialLine(house.longitude, 72, 166, ascLongitude);
          const nextHouse = houses.find(
            (candidate) => candidate.number === (house.number % 12) + 1
          );
          const labelLongitude =
            house.longitude +
            arcDistance(house.longitude, nextHouse?.longitude ?? house.longitude) / 2;
          const label = polar(labelLongitude, 98, ascLongitude);
          const isAxis = house.number === 1 || house.number === 10;
          const axisLabel = house.number === 1 ? "Asc" : house.number === 10 ? "MC" : null;
          const axisPosition = polar(house.longitude, 184, ascLongitude);

          return (
            <g key={house.number}>
              <line
                className={[styles.houseLine, isAxis ? styles.houseLineMajor : ""]
                  .filter(Boolean)
                  .join(" ")}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
              />
              <text className={styles.houseLabel} x={label.x} y={label.y}>
                {house.number}
              </text>
              {axisLabel ? (
                <text className={styles.axisLabel} x={axisPosition.x} y={axisPosition.y}>
                  {axisLabel}
                </text>
              ) : null}
            </g>
          );
        })}
        {renderResult?.aspects.map((aspect, index) => {
          const a = points.find((point) => point.id === aspect.pointA);
          const b = points.find((point) => point.id === aspect.pointB);
          if (!a || !b) return null;
          const start = polar(a.longitude, 132, ascLongitude);
          const end = polar(b.longitude, 132, ascLongitude);
          const tone = getAspectTone(aspect);
          const involved = Boolean(
            hoveredPointId && (aspect.pointA === hoveredPointId || aspect.pointB === hoveredPointId)
          );
          const dimmed = Boolean(hoveredPointId && !involved);

          return (
            <line
              key={`${aspect.pointA}-${aspect.pointB}-${index}`}
              className={[
                styles.aspectLine,
                aspectToneClasses[tone],
                involved ? styles.aspectLineHovered : "",
                dimmed ? styles.aspectLineDimmed : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-aspect-tone={tone}
              data-hovered={involved ? "true" : "false"}
              data-testid={`chart-aspect-${aspect.type}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          );
        })}
        {transitResult?.result.aspectsToNatal.map((aspect, index) => {
          const transitPoint = transitPoints.find((point) => point.id === aspect.transitPoint);
          const natalPoint = points.find((point) => point.id === aspect.natalPoint);
          if (!transitPoint || !natalPoint) return null;
          const start = polar(
            transitMarkerLongitudes[transitPoint.id] ?? transitPoint.longitude,
            178,
            ascLongitude
          );
          const end = polar(natalPoint.longitude, 132, ascLongitude);
          const tone = getAspectTone(aspect);
          const transitHoverId = getTransitHoverPointId(transitPoint.id);
          const involved = Boolean(
            hoveredPointId &&
            (hoveredPointId === transitHoverId || hoveredPointId === aspect.natalPoint)
          );
          const dimmed = Boolean(hoveredPointId && !involved);

          return (
            <line
              key={`transit-${aspect.transitPoint}-${aspect.natalPoint}-${index}`}
              className={[
                styles.aspectLine,
                aspectToneClasses[tone],
                styles.transitAspectLine,
                involved ? styles.aspectLineHovered : "",
                dimmed ? styles.aspectLineDimmed : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-aspect-tone={tone}
              data-hovered={involved ? "true" : "false"}
              data-testid={`chart-transit-aspect-${aspect.type}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          );
        })}
        {synastryResult?.result.aspectsBetween.map((aspect, index) => {
          const primaryPoint = points.find((point) => point.id === aspect.primaryPoint);
          const partnerPoint = partnerPoints.find((point) => point.id === aspect.partnerPoint);
          if (!primaryPoint || !partnerPoint) return null;
          const start = polar(primaryPoint.longitude, 132, ascLongitude);
          const end = polar(
            partnerMarkerLongitudes[partnerPoint.id] ?? partnerPoint.longitude,
            178,
            ascLongitude
          );
          const tone = getAspectTone(aspect);
          const partnerHoverId = getPartnerHoverPointId(partnerPoint.id);
          const involved = Boolean(
            hoveredPointId &&
            (hoveredPointId === aspect.primaryPoint || hoveredPointId === partnerHoverId)
          );
          const dimmed = Boolean(hoveredPointId && !involved);

          return (
            <line
              key={`synastry-${aspect.primaryPoint}-${aspect.partnerPoint}-${index}`}
              className={[
                styles.aspectLine,
                aspectToneClasses[tone],
                styles.transitAspectLine,
                involved ? styles.aspectLineHovered : "",
                dimmed ? styles.aspectLineDimmed : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-aspect-tone={tone}
              data-hovered={involved ? "true" : "false"}
              data-testid={`chart-synastry-aspect-${aspect.type}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          );
        })}
        {points.map((point) => {
          if (axisPointIds.has(point.id)) return null;
          const exact = polar(point.longitude, 166, ascLongitude);
          const marker = polar(markerLongitudes[point.id] ?? point.longitude, 142, ascLongitude);
          const hovered = hoveredPointId === point.id;

          return (
            <g
              aria-label={`${getChartPointDisplayLabel(point.id, point.label)} на карте`}
              className={styles.pointMarker}
              data-hovered={hovered ? "true" : "false"}
              data-testid={`chart-point-${point.id}`}
              key={point.id}
              onBlur={() => onHoverPoint(null)}
              onFocus={() => onHoverPoint(point.id)}
              onMouseEnter={() => onHoverPoint(point.id)}
              onMouseLeave={() => onHoverPoint(null)}
              role="button"
              tabIndex={0}
            >
              <line
                className={styles.planetGuide}
                x1={exact.x}
                y1={exact.y}
                x2={marker.x}
                y2={marker.y}
              />
              <circle
                className={hovered ? styles.pointDotHovered : styles.pointDot}
                cx={marker.x}
                cy={marker.y}
                r={hovered ? "18" : "15"}
              />
              <text
                className={hovered ? styles.pointLabelHovered : styles.pointLabel}
                x={marker.x}
                y={marker.y}
              >
                {getChartPointSymbol(point.id, point.label)}
              </text>
              {point.retrograde ? (
                <text className={styles.retroLabel} x={marker.x + 14} y={marker.y - 12}>
                  R
                </text>
              ) : null}
            </g>
          );
        })}
        {transitPoints.map((point) => {
          if (axisPointIds.has(point.id)) return null;
          const exact = polar(point.longitude, 166, ascLongitude);
          const marker = polar(
            transitMarkerLongitudes[point.id] ?? point.longitude,
            178,
            ascLongitude
          );
          const hoverId = getTransitHoverPointId(point.id);
          const hovered = hoveredPointId === hoverId;

          return (
            <g
              aria-label={`Транзитный ${getChartPointDisplayLabel(point.id, point.label)} на карте`}
              className={styles.pointMarker}
              data-hovered={hovered ? "true" : "false"}
              data-testid={`chart-transit-point-${point.id}`}
              key={`transit-${point.id}`}
              onBlur={() => onHoverPoint(null)}
              onFocus={() => onHoverPoint(hoverId)}
              onMouseEnter={() => onHoverPoint(hoverId)}
              onMouseLeave={() => onHoverPoint(null)}
              role="button"
              tabIndex={0}
            >
              <line
                className={styles.transitPlanetGuide}
                x1={exact.x}
                y1={exact.y}
                x2={marker.x}
                y2={marker.y}
              />
              <circle
                className={hovered ? styles.transitPointDotHovered : styles.transitPointDot}
                cx={marker.x}
                cy={marker.y}
                r={hovered ? "17" : "14"}
              />
              <text
                className={hovered ? styles.pointLabelHovered : styles.pointLabel}
                x={marker.x}
                y={marker.y}
              >
                {getChartPointSymbol(point.id, point.label)}
              </text>
              {point.retrograde ? (
                <text className={styles.retroLabel} x={marker.x + 13} y={marker.y - 11}>
                  R
                </text>
              ) : null}
            </g>
          );
        })}
        {partnerPoints.map((point) => {
          if (axisPointIds.has(point.id)) return null;
          const exact = polar(point.longitude, 166, ascLongitude);
          const marker = polar(
            partnerMarkerLongitudes[point.id] ?? point.longitude,
            178,
            ascLongitude
          );
          const hoverId = getPartnerHoverPointId(point.id);
          const hovered = hoveredPointId === hoverId;

          return (
            <g
              aria-label={`Партнёрский ${getChartPointDisplayLabel(point.id, point.label)} на карте`}
              className={styles.pointMarker}
              data-hovered={hovered ? "true" : "false"}
              data-testid={`chart-partner-point-${point.id}`}
              key={`partner-${point.id}`}
              onBlur={() => onHoverPoint(null)}
              onFocus={() => onHoverPoint(hoverId)}
              onMouseEnter={() => onHoverPoint(hoverId)}
              onMouseLeave={() => onHoverPoint(null)}
              role="button"
              tabIndex={0}
            >
              <line
                className={styles.transitPlanetGuide}
                x1={exact.x}
                y1={exact.y}
                x2={marker.x}
                y2={marker.y}
              />
              <circle
                className={hovered ? styles.transitPointDotHovered : styles.transitPointDot}
                cx={marker.x}
                cy={marker.y}
                r={hovered ? "17" : "14"}
              />
              <text
                className={hovered ? styles.pointLabelHovered : styles.pointLabel}
                x={marker.x}
                y={marker.y}
              >
                {getChartPointSymbol(point.id, point.label)}
              </text>
              {point.retrograde ? (
                <text className={styles.retroLabel} x={marker.x + 13} y={marker.y - 11}>
                  R
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className={styles.hoverDetailSlot} data-testid="chart-hover-detail-slot">
        <HoverPointDetail point={hoveredPoint} result={result} />
      </div>
    </div>
  );
}

function HoverPointDetail({
  point,
  result
}: {
  readonly point: ChartPoint | null;
  readonly result: StoredChartCalculationPayload | null;
}) {
  if (!point || !result) {
    return <p className={styles.wheelHint}>Наведите на планету — детали, дом и аспекты</p>;
  }

  const renderResult = getPrimaryChartRenderResult(result);
  const transitResult = getTransitChartResult(result);
  const synastryResult = getSynastryChartResult(result);
  const isTransitPoint = point.id.startsWith("transit:");
  const isPartnerPoint = point.id.startsWith("partner:");
  const pointId = isTransitPoint
    ? point.id.slice("transit:".length)
    : isPartnerPoint
      ? point.id.slice("partner:".length)
      : point.id;
  const aspects =
    isTransitPoint && transitResult
      ? transitResult.result.aspectsToNatal
          .filter((aspect) => aspect.transitPoint === pointId)
          .map((aspect) => ({
            pointA: aspect.transitPoint,
            pointB: aspect.natalPoint,
            type: aspect.type,
            angle: aspect.angle,
            orb: aspect.orb,
            applying: aspect.applying,
            strength: aspect.strength
          }))
      : isPartnerPoint && synastryResult
        ? synastryResult.result.aspectsBetween
            .filter((aspect) => aspect.partnerPoint === pointId)
            .map((aspect) => ({
              pointA: aspect.primaryPoint,
              pointB: aspect.partnerPoint,
              type: aspect.type,
              angle: aspect.angle,
              orb: aspect.orb,
              applying: aspect.applying,
              strength: aspect.strength
            }))
        : renderResult.aspects
            .filter((aspect) => aspect.pointA === point.id || aspect.pointB === point.id)
            .slice(0, 6);

  return (
    <div className={styles.hoverDetailCard}>
      <span className={styles.hoverDetailGlyph} aria-hidden="true">
        {getChartPointSymbol(point.id, point.label)}
      </span>
      <div className={styles.hoverDetailText}>
        <strong>
          {isTransitPoint ? "Транзитный " : ""}
          {isPartnerPoint ? "Партнёрский " : ""}
          {getChartPointDisplayLabel(pointId, point.label)}
          {point.retrograde ? <b> R ретроград</b> : null}
        </strong>
        <span>
          {formatDegree(point.signDegree)} {formatHouseSignDisplay(point.sign)}
          {point.house ? ` · ${romanHouses[point.house]} дом` : ""}
        </span>
      </div>
      <div className={styles.hoverDetailAspects} aria-label="Аспекты выбранной планеты">
        {aspects.length ? (
          aspects.map((aspect, index) => (
            <span
              key={`${aspect.pointA}-${aspect.pointB}-${aspect.type}-${index}`}
              title={formatAspectTypeDisplay(aspect.type)}
            >
              {getAspectSymbol(aspect.type)}
            </span>
          ))
        ) : (
          <small>нет аспектов</small>
        )}
      </div>
    </div>
  );
}

function getHoveredPoint({
  hoveredPointId,
  points,
  transitPoints
}: {
  readonly hoveredPointId: string | null;
  readonly points: readonly ChartPoint[];
  readonly transitPoints: readonly ChartPoint[];
  readonly partnerPoints: readonly ChartPoint[];
}): ChartPoint | null {
  if (!hoveredPointId) {
    return null;
  }
  if (hoveredPointId.startsWith("transit:")) {
    const pointId = hoveredPointId.slice("transit:".length);
    const point = transitPoints.find((candidate) => candidate.id === pointId);

    return point ? { ...point, id: hoveredPointId } : null;
  }
  if (hoveredPointId.startsWith("partner:")) {
    const pointId = hoveredPointId.slice("partner:".length);
    const point = partnerPoints.find((candidate) => candidate.id === pointId);

    return point ? { ...point, id: hoveredPointId } : null;
  }

  return points.find((point) => point.id === hoveredPointId) ?? null;
}

function getTransitHoverPointId(pointId: string): string {
  return `transit:${pointId}`;
}

function getPartnerHoverPointId(pointId: string): string {
  return `partner:${pointId}`;
}

function polar(
  longitude: number,
  radius: number,
  ascLongitude: number
): { readonly x: number; readonly y: number } {
  const radians = ((180 + (longitude - ascLongitude)) * Math.PI) / 180;

  return {
    x: 260 + Math.cos(radians) * radius,
    y: 260 - Math.sin(radians) * radius
  };
}

function radialLine(
  longitude: number,
  innerRadius: number,
  outerRadius: number,
  ascLongitude: number
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  const inner = polar(longitude, innerRadius, ascLongitude);
  const outer = polar(longitude, outerRadius, ascLongitude);

  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}

function spreadPointLongitudes(
  points: readonly ChartPoint[],
  minSeparation = 7.5
): Record<string, number> {
  const sorted = points
    .map((point) => ({ id: point.id, longitude: normalizeLongitude(point.longitude) }))
    .sort((a, b) => a.longitude - b.longitude);
  if (sorted.length < 2) {
    return Object.fromEntries(sorted.map((point) => [point.id, point.longitude]));
  }

  for (let iteration = 0; iteration < 60; iteration += 1) {
    let moved = false;
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index]!;
      const next = sorted[(index + 1) % sorted.length]!;
      const distance =
        index === sorted.length - 1
          ? next.longitude + 360 - current.longitude
          : next.longitude - current.longitude;
      if (distance < minSeparation) {
        const push = (minSeparation - distance) / 2;
        current.longitude -= push;
        next.longitude += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return Object.fromEntries(sorted.map((point) => [point.id, normalizeLongitude(point.longitude)]));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function arcDistance(from: number, to: number): number {
  return normalizeLongitude(to - from);
}

function getAspectTone(
  aspect: ChartAspect | ChartTransitAspect | ChartSynastryAspect
): "hard" | "neutral" | "soft" {
  if (aspect.type === "square" || aspect.type === "opposition" || aspect.type === "semi-square") {
    return "hard";
  }
  if (aspect.type === "conjunction") {
    return "neutral";
  }

  return "soft";
}

const aspectToneClasses = {
  hard: styles.aspectLineHard,
  neutral: styles.aspectLineNeutral,
  soft: styles.aspectLineSoft
} as const;

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

function getAspectSymbol(type: string): string {
  return aspectSymbols[type] ?? "•";
}
