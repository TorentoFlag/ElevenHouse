import type { ChartPoint, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import {
  formatAspectTypeDisplay,
  formatChartPointPosition,
  formatDegree,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
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
      <div className={styles.dataList}>
        {result.result.points.map((point) => (
          <div className={styles.dataRow} key={point.id}>
            <span>{getChartPointDisplayLabel(point.id, point.label)}</span>
            <span>{formatPointPosition(point)}</span>
            <span>{point.house ? `${romanHouses[point.house]} дом` : "—"}</span>
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
      <div className={styles.dataList}>
        {result.result.houses.map((house) => (
          <div className={styles.dataRow} key={house.number}>
            <span>{romanHouses[house.number]} дом</span>
            <span>{formatHouseSignDisplay(house.sign)}</span>
            <span>{formatDegree(house.signDegree)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AspectsTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  return (
    <section className={styles.tableSection} aria-labelledby="chart-aspects-heading">
      <h2 id="chart-aspects-heading">Аспекты</h2>
      <div className={styles.dataList}>
        {result.result.aspects.length > 0 ? (
          result.result.aspects.map((aspect, index) => (
            <div className={styles.dataRow} key={`${aspect.pointA}-${aspect.pointB}-${index}`}>
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

function formatPointPosition(point: ChartPoint): string {
  return formatChartPointPosition(point);
}

function getPointLabel(result: StoredChartCalculationPayload, pointId: string): string {
  const point = result.result.points.find((candidate) => candidate.id === pointId);

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId);
}
