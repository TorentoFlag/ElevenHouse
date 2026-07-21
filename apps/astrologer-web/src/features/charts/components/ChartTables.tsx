import type { ChartAspect, ChartPoint, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import {
  formatAspectTypeDisplay,
  formatChartPointPosition,
  formatDegree,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  romanHouses
} from "../model/chartDisplay";
import styles from "./ChartEnginePage.module.css";

export type ChartPanelTab = "planets" | "aspects" | "houses" | "interpretations";

export type ChartTablesProps = {
  readonly result: StoredChartCalculationPayload | null;
  readonly activeTab: ChartPanelTab;
};

export function ChartTables({ activeTab, result }: ChartTablesProps) {
  if (!result) {
    return (
      <div className={styles.panelEmpty}>
        После расчёта здесь появятся планеты, аспекты и дома из canonical result.
      </div>
    );
  }

  return (
    <div className={styles.tableStack}>
      {activeTab === "planets" ? <PlanetsTable result={result} /> : null}
      {activeTab === "aspects" ? <AspectsTable result={result} /> : null}
      {activeTab === "houses" ? <HousesTable result={result} /> : null}
      {activeTab === "interpretations" ? <InterpretationSummary result={result} /> : null}
    </div>
  );
}

function PlanetsTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  return (
    <section className={styles.tableSection} aria-labelledby="chart-planets-heading">
      <h2 id="chart-planets-heading">Планеты</h2>
      <div className={styles.planetList}>
        {result.result.points.map((point) => (
          <div className={styles.planetRow} key={point.id}>
            <span className={styles.pointGlyph} aria-hidden="true">
              {getChartPointSymbol(point.id, point.label)}
            </span>
            <span className={styles.pointName}>{getChartPointDisplayLabel(point.id, point.label)}</span>
            <span className={styles.signGlyph} aria-hidden="true">
              {getZodiacSymbol(point.sign)}
            </span>
            <span className={styles.pointDegree}>
              {formatDegree(point.signDegree)}
              {point.retrograde ? <b>R</b> : null}
            </span>
            <span className={styles.pointHouse}>{point.house ? `${romanHouses[point.house]} дом` : "—"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HousesTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  return (
    <section className={styles.tableSection} aria-labelledby="chart-houses-heading">
      <h2 id="chart-houses-heading">Дома</h2>
      <div className={styles.houseGrid}>
        {result.result.houses.map((house) => (
          <div className={styles.houseCard} key={house.number}>
            <span>{romanHouses[house.number]} дом</span>
            <strong>
              {getZodiacSymbol(house.sign)} {formatDegree(house.signDegree)}
            </strong>
            <small>{formatHouseSignDisplay(house.sign)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function AspectsTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  const matrixPoints = getAspectMatrixPoints(result.result.points);
  const aspectsByPair = new Map(
    result.result.aspects.map((aspect) => [getAspectPairKey(aspect.pointA, aspect.pointB), aspect])
  );

  return (
    <section className={styles.tableSection} aria-labelledby="chart-aspects-heading">
      <h2 id="chart-aspects-heading">Аспекты</h2>
      <h3 className={styles.matrixHeading}>Матрица аспектов</h3>
      {matrixPoints.length > 1 ? (
        <div
          className={styles.aspectMatrix}
          style={{ gridTemplateColumns: `34px repeat(${matrixPoints.length}, minmax(22px, 1fr))` }}
        >
          <span aria-hidden="true" />
          {matrixPoints.map((point) => (
            <span className={styles.aspectMatrixHead} key={`head-${point.id}`}>
              {getChartPointSymbol(point.id, point.label)}
            </span>
          ))}
          {matrixPoints.map((rowPoint, rowIndex) => (
            <AspectMatrixRow
              aspectsByPair={aspectsByPair}
              key={rowPoint.id}
              points={matrixPoints}
              rowIndex={rowIndex}
              rowPoint={rowPoint}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyRow}>Недостаточно точек для матрицы</div>
      )}
      <div className={styles.aspectLegend} aria-label="Легенда аспектов">
        {aspectLegendItems.map((item) => (
          <span key={item.type}>
            <b>{item.symbol}</b>
            {item.label}
          </span>
        ))}
      </div>
      <h2>Список аспектов</h2>
      <div className={styles.aspectList}>
        {result.result.aspects.length > 0 ? (
          result.result.aspects.map((aspect, index) => (
            <div className={styles.aspectRow} key={`${aspect.pointA}-${aspect.pointB}-${index}`}>
              <span>{formatAspectTypeDisplay(aspect.type)}</span>
              <span>
                {getPointLabel(result, aspect.pointA)} — {getPointLabel(result, aspect.pointB)}
              </span>
              <span>{aspect.orb.toFixed(2)}°</span>
            </div>
          ))
        ) : (
          <div className={styles.emptyRow}>Мажорные аспекты не найдены</div>
        )}
      </div>
    </section>
  );
}

function AspectMatrixRow({
  aspectsByPair,
  points,
  rowIndex,
  rowPoint
}: {
  readonly aspectsByPair: ReadonlyMap<string, ChartAspect>;
  readonly points: readonly ChartPoint[];
  readonly rowIndex: number;
  readonly rowPoint: ChartPoint;
}) {
  return (
    <>
      <span className={styles.aspectMatrixHead}>{getChartPointSymbol(rowPoint.id, rowPoint.label)}</span>
      {points.map((columnPoint, columnIndex) => {
        const aspect = aspectsByPair.get(getAspectPairKey(rowPoint.id, columnPoint.id));
        const isEmpty = columnIndex >= rowIndex || !aspect;

        return (
          <span
            aria-label={
              !isEmpty && aspect
                ? `${getPointLabelFromPoint(rowPoint)} ${formatAspectTypeDisplay(aspect.type)} ${getPointLabelFromPoint(
                    columnPoint
                  )}, орбис ${aspect.orb.toFixed(2)}°`
                : undefined
            }
            className={isEmpty ? styles.aspectMatrixEmpty : styles.aspectMatrixCell}
            key={`${rowPoint.id}-${columnPoint.id}`}
          >
            {!isEmpty && aspect ? getAspectSymbol(aspect.type) : ""}
          </span>
        );
      })}
    </>
  );
}

function InterpretationSummary({ result }: { readonly result: StoredChartCalculationPayload }) {
  const sun = result.result.points.find((point) => point.id === "sun");
  const moon = result.result.points.find((point) => point.id === "moon");
  const ascendant = result.result.houses.find((house) => house.number === 1);

  return (
    <section className={styles.tableSection} aria-labelledby="chart-interpretations-heading">
      <h2 id="chart-interpretations-heading">Трактовки</h2>
      <div className={styles.interpretationStack}>
        <div className={styles.interpretationNote}>
          Интерпретационный контур не подключён. Ниже только опорные положения из canonical result.
        </div>
        <div className={styles.dataList}>
          <div className={styles.dataRow}>
            <span>Солнце</span>
            <span>{sun ? formatPointPosition(sun) : "—"}</span>
            <span>{sun?.house ? `${romanHouses[sun.house]} дом` : "—"}</span>
          </div>
          <div className={styles.dataRow}>
            <span>Луна</span>
            <span>{moon ? formatPointPosition(moon) : "—"}</span>
            <span>{moon?.house ? `${romanHouses[moon.house]} дом` : "—"}</span>
          </div>
          <div className={styles.dataRow}>
            <span>Asc</span>
            <span>{ascendant ? formatHouseSignDisplay(ascendant.sign) : "—"}</span>
            <span>{ascendant ? formatDegree(ascendant.signDegree) : "—"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function getPointLabel(result: StoredChartCalculationPayload, pointId: string): string {
  const point = result.result.points.find((candidate) => candidate.id === pointId);

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId);
}

function formatPointPosition(point: ChartPoint): string {
  return formatChartPointPosition(point);
}

function getPointLabelFromPoint(point: ChartPoint): string {
  return getChartPointDisplayLabel(point.id, point.label);
}

function getAspectMatrixPoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  return mainPointOrder
    .map((pointId) => points.find((point) => point.id === pointId))
    .filter((point): point is ChartPoint => Boolean(point));
}

function getAspectPairKey(pointA: string, pointB: string): string {
  return [pointA, pointB].sort().join(":");
}

function getAspectSymbol(type: string): string {
  return aspectSymbols[type] ?? "•";
}

function getZodiacSymbol(sign: string): string {
  return zodiacSymbols[sign.toLowerCase()] ?? "♈︎";
}

const mainPointOrder = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
] as const;

const zodiacSymbols: Record<string, string> = {
  aries: "♈︎",
  taurus: "♉︎",
  gemini: "♊︎",
  cancer: "♋︎",
  leo: "♌︎",
  virgo: "♍︎",
  libra: "♎︎",
  scorpio: "♏︎",
  sagittarius: "♐︎",
  capricorn: "♑︎",
  aquarius: "♒︎",
  pisces: "♓︎"
};

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

const aspectLegendItems = [
  { type: "conjunction", symbol: "☌", label: "Соединение" },
  { type: "sextile", symbol: "✶", label: "Секстиль" },
  { type: "square", symbol: "□", label: "Квадрат" },
  { type: "trine", symbol: "△", label: "Тригон" },
  { type: "opposition", symbol: "☍", label: "Оппозиция" }
] as const;
