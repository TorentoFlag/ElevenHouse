import type { MatrixData, MatrixPointCode } from "@elevenhouse/contracts";
import type { MatrixSelector } from "../model/matrixWorkspaceModel";
import styles from "../../../pages/matrix/MatrixPage.module.css";

const points: ReadonlyArray<{
  readonly code: MatrixPointCode;
  readonly label: string;
  readonly angle: number;
  readonly radius: "outer" | "inner";
  readonly kind: "personal" | "karmic" | "inner";
}> = [
  { code: "A", label: "Характер", angle: 180, radius: "outer", kind: "personal" },
  { code: "B", label: "Детство · род", angle: 90, radius: "outer", kind: "personal" },
  { code: "C", label: "Карма рода", angle: 0, radius: "outer", kind: "personal" },
  { code: "D", label: "Зона комфорта", angle: 270, radius: "outer", kind: "personal" },
  { code: "tl", label: "Таланты", angle: 135, radius: "outer", kind: "karmic" },
  { code: "tr", label: "Кармический хвост", angle: 45, radius: "outer", kind: "karmic" },
  { code: "br", label: "Род · ресурс", angle: 315, radius: "outer", kind: "karmic" },
  { code: "bl", label: "Отношения", angle: 225, radius: "outer", kind: "karmic" },
  { code: "A1", label: "Скрытый талант", angle: 180, radius: "inner", kind: "inner" },
  { code: "B1", label: "Духовная задача", angle: 90, radius: "inner", kind: "inner" },
  { code: "C1", label: "Кармический опыт", angle: 0, radius: "inner", kind: "inner" },
  { code: "D1", label: "Земная задача", angle: 270, radius: "inner", kind: "inner" },
  { code: "tl1", label: "Мужская линия рода", angle: 135, radius: "inner", kind: "inner" },
  { code: "tr1", label: "Женская линия рода", angle: 45, radius: "inner", kind: "inner" },
  { code: "br1", label: "Ресурс рода", angle: 315, radius: "inner", kind: "inner" },
  { code: "bl1", label: "Уроки рода", angle: 225, radius: "inner", kind: "inner" }
];
const ages = ["A", "tl", "B", "tr", "C", "br", "D", "bl"] as const;

export function MatrixOctagram({
  matrix,
  selected,
  agePointCode,
  compact = false,
  onSelect
}: {
  readonly matrix: MatrixData;
  readonly selected: MatrixSelector;
  readonly agePointCode?: MatrixPointCode | null;
  readonly compact?: boolean;
  readonly onSelect?: (selector: MatrixSelector) => void;
}) {
  const center = 230;
  const outerRadius = compact ? 152 : 166;
  const innerRadius = outerRadius * 0.52;
  const position = (angle: number, radius: number) => ({
    x: center + radius * Math.cos((angle * Math.PI) / 180),
    y: center - radius * Math.sin((angle * Math.PI) / 180)
  });
  const personal = points.filter((point) => point.radius === "outer" && point.kind === "personal");
  const karmic = points.filter((point) => point.radius === "outer" && point.kind === "karmic");

  return (
    <svg
      className={styles.octagram}
      viewBox="0 0 460 460"
      role="img"
      aria-label="Октаграмма Матрицы судьбы"
    >
      <polygon
        points={polygon(personal, position, outerRadius)}
        className={styles.personalContour}
      />
      <polygon points={polygon(karmic, position, outerRadius)} className={styles.karmicContour} />
      {points
        .filter((point) => point.radius === "outer")
        .map((point) => {
          const target = position(point.angle, outerRadius);
          const lineClass =
            point.code === "bl"
              ? styles.loveLine
              : point.code === "br"
                ? styles.moneyLine
                : styles.matrixLine;
          return (
            <line
              key={`line-${point.code}`}
              x1={center}
              y1={center}
              x2={target.x}
              y2={target.y}
              className={lineClass}
            />
          );
        })}
      {!compact ? (
        <>
          <text x="93" y="352" className={styles.loveLabel} transform="rotate(45 93 352)">
            линия любви
          </text>
          <text x="347" y="352" className={styles.moneyLabel} transform="rotate(-45 347 352)">
            линия денег
          </text>
          {ages.map((code, index) => {
            const point = points.find((item) => item.code === code)!;
            const target = position(point.angle, outerRadius + 27);
            return (
              <text
                key={`age-${code}`}
                x={target.x}
                y={target.y}
                className={agePointCode === code ? styles.ageActive : styles.ageLabel}
              >
                {index * 10}
              </text>
            );
          })}
        </>
      ) : null}
      {points.map((point) => {
        const target = position(point.angle, point.radius === "outer" ? outerRadius : innerRadius);
        const isSelected = selected === point.code;
        const className = [
          styles.arcanaPoint,
          styles[`arcanaPoint_${point.kind}`],
          isSelected ? styles.arcanaPointSelected : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <g
            key={point.code}
            className={onSelect ? styles.arcanaInteractive : undefined}
            onClick={onSelect ? () => onSelect(point.code) : undefined}
          >
            <title>{`${point.label} · аркан ${matrix.points[point.code]}`}</title>
            {agePointCode === point.code ? (
              <circle
                cx={target.x}
                cy={target.y}
                r={point.radius === "outer" ? 27 : 19}
                className={styles.ageRing}
              />
            ) : null}
            <circle
              cx={target.x}
              cy={target.y}
              r={point.radius === "outer" ? 20 : 13}
              className={className}
            />
            <text
              x={target.x}
              y={target.y}
              className={point.radius === "outer" ? styles.arcanaNumber : styles.arcanaNumberSmall}
            >
              {matrix.points[point.code]}
            </text>
          </g>
        );
      })}
      <g
        className={onSelect ? styles.arcanaInteractive : undefined}
        onClick={onSelect ? () => onSelect("E") : undefined}
      >
        <title>{`Портрет · Я · аркан ${matrix.points.E}`}</title>
        <circle
          cx={center}
          cy={center}
          r="31"
          className={selected === "E" ? styles.centerRingSelected : styles.centerRing}
        />
        <circle cx={center} cy={center} r="26" className={styles.centerPoint} />
        <text x={center} y={center} className={styles.centerNumber}>
          {matrix.points.E}
        </text>
      </g>
    </svg>
  );
}

function polygon(
  items: ReadonlyArray<{ angle: number }>,
  position: (angle: number, radius: number) => { x: number; y: number },
  radius: number
): string {
  return items
    .map((item) => {
      const point = position(item.angle, radius);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}
