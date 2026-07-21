import type { ChartAspect, ChartPoint, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import { getChartPointSymbol } from "../model/chartDisplay";
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
};

export function ChartWheel({ result }: ChartWheelProps) {
  const houses = result?.result.houses ?? [];
  const points = result?.result.points ?? [];
  const ascLongitude = houses.find((house) => house.number === 1)?.longitude ?? 0;
  const markerLongitudes = spreadPointLongitudes(points.filter((point) => !axisPointIds.has(point.id)));

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
              <line className={styles.wheelTick} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
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
          const nextHouse = houses.find((candidate) => candidate.number === (house.number % 12) + 1);
          const labelLongitude = house.longitude + arcDistance(house.longitude, nextHouse?.longitude ?? house.longitude) / 2;
          const label = polar(labelLongitude, 98, ascLongitude);
          const isAxis = house.number === 1 || house.number === 10;
          const axisLabel = house.number === 1 ? "Asc" : house.number === 10 ? "MC" : null;
          const axisPosition = polar(house.longitude, 184, ascLongitude);

          return (
            <g key={house.number}>
              <line
                className={[styles.houseLine, isAxis ? styles.houseLineMajor : ""].filter(Boolean).join(" ")}
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
        {result?.result.aspects.map((aspect, index) => {
          const a = points.find((point) => point.id === aspect.pointA);
          const b = points.find((point) => point.id === aspect.pointB);
          if (!a || !b) return null;
          const start = polar(a.longitude, 132, ascLongitude);
          const end = polar(b.longitude, 132, ascLongitude);
          const tone = getAspectTone(aspect);

          return (
            <line
              key={`${aspect.pointA}-${aspect.pointB}-${index}`}
              className={[styles.aspectLine, aspectToneClasses[tone]].join(" ")}
              data-aspect-tone={tone}
              data-testid={`chart-aspect-${aspect.type}`}
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

          return (
            <g data-testid={`chart-point-${point.id}`} key={point.id}>
              <line className={styles.planetGuide} x1={exact.x} y1={exact.y} x2={marker.x} y2={marker.y} />
              <circle className={styles.pointDot} cx={marker.x} cy={marker.y} r="15" />
              <text className={styles.pointLabel} x={marker.x} y={marker.y}>
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
      </svg>
      <p className={styles.wheelHint}>Наведите на планету — детали, дом и аспекты</p>
    </div>
  );
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

function spreadPointLongitudes(points: readonly ChartPoint[], minSeparation = 7.5): Record<string, number> {
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

function getAspectTone(aspect: ChartAspect): "hard" | "neutral" | "soft" {
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
