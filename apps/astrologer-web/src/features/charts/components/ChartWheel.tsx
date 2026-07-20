import type { StoredChartCalculationPayload } from "@elevenhouse/contracts";
import styles from "./ChartEnginePage.module.css";

const zodiacSymbols = ["♈︎", "♉︎", "♊︎", "♋︎", "♌︎", "♍︎", "♎︎", "♏︎", "♐︎", "♑︎", "♒︎", "♓︎"];
const planetSymbols: Record<string, string> = {
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
  true_node: "☊︎",
  mean_node: "☊︎"
};

export type ChartWheelProps = {
  readonly result: StoredChartCalculationPayload | null;
};

export function ChartWheel({ result }: ChartWheelProps) {
  const houses = result?.result.houses ?? [];
  const points = result?.result.points ?? [];

  return (
    <div className={styles.wheelStage} aria-label="Натальная карта">
      <svg className={styles.wheelSvg} viewBox="0 0 520 520" role="img" aria-label="Круг карты">
        <circle className={styles.wheelOuter} cx="260" cy="260" r="220" />
        <circle className={styles.wheelMiddle} cx="260" cy="260" r="166" />
        <circle className={styles.wheelInner} cx="260" cy="260" r="72" />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = index * 30;
          const line = radialLine(angle, 78, 220);
          const label = polar(angle + 15, 238);

          return (
            <g key={zodiacSymbols[index]}>
              <line className={styles.wheelTick} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              <text className={styles.zodiacLabel} x={label.x} y={label.y}>
                {zodiacSymbols[index]}
              </text>
            </g>
          );
        })}
        {houses.map((house) => {
          const line = radialLine(house.longitude, 72, 205);
          const label = polar(house.longitude + 7, 108);

          return (
            <g key={house.number}>
              <line className={styles.houseLine} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              <text className={styles.houseLabel} x={label.x} y={label.y}>
                {house.number}
              </text>
            </g>
          );
        })}
        {result?.result.aspects.slice(0, 28).map((aspect, index) => {
          const a = points.find((point) => point.id === aspect.pointA);
          const b = points.find((point) => point.id === aspect.pointB);
          if (!a || !b) return null;
          const start = polar(a.longitude, 132);
          const end = polar(b.longitude, 132);

          return (
            <line
              key={`${aspect.pointA}-${aspect.pointB}-${index}`}
              className={styles.aspectLine}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
          );
        })}
        {points.map((point, index) => {
          const marker = polar(point.longitude, 138 + (index % 3) * 16);

          return (
            <g key={point.id}>
              <circle className={styles.pointDot} cx={marker.x} cy={marker.y} r="15" />
              <text className={styles.pointLabel} x={marker.x} y={marker.y}>
                {planetSymbols[point.id] ?? point.label.slice(0, 1)}
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

function polar(longitude: number, radius: number): { readonly x: number; readonly y: number } {
  const radians = ((longitude - 180) * Math.PI) / 180;

  return {
    x: 260 + Math.cos(radians) * radius,
    y: 260 + Math.sin(radians) * radius
  };
}

function radialLine(
  longitude: number,
  innerRadius: number,
  outerRadius: number
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  const inner = polar(longitude, innerRadius);
  const outer = polar(longitude, outerRadius);

  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}
