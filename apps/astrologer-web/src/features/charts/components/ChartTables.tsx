import type { ChartPoint, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import styles from "./ChartEnginePage.module.css";

const romanHouses = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export type ChartTablesProps = {
  readonly result: StoredChartCalculationPayload | null;
};

export function ChartTables({ result }: ChartTablesProps) {
  if (!result) {
    return (
      <div className={styles.panelEmpty}>
        После расчёта здесь появятся планеты, аспекты и дома из canonical result.
      </div>
    );
  }

  return (
    <div className={styles.tableStack}>
      <section className={styles.tableSection} aria-labelledby="chart-planets-heading">
        <h2 id="chart-planets-heading">Планеты</h2>
        <div className={styles.dataList}>
          {result.result.points.map((point) => (
            <div className={styles.dataRow} key={point.id}>
              <span>{point.label}</span>
              <span>{formatPointPosition(point)}</span>
              <span>{point.house ? `${romanHouses[point.house]} дом` : "—"}</span>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.tableSection} aria-labelledby="chart-houses-heading">
        <h2 id="chart-houses-heading">Дома</h2>
        <div className={styles.dataList}>
          {result.result.houses.map((house) => (
            <div className={styles.dataRow} key={house.number}>
              <span>{romanHouses[house.number]} дом</span>
              <span>{house.sign}</span>
              <span>{formatDegree(house.signDegree)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.tableSection} aria-labelledby="chart-aspects-heading">
        <h2 id="chart-aspects-heading">Аспекты</h2>
        <div className={styles.dataList}>
          {result.result.aspects.length > 0 ? (
            result.result.aspects.map((aspect, index) => (
              <div className={styles.dataRow} key={`${aspect.pointA}-${aspect.pointB}-${index}`}>
                <span>{aspect.type}</span>
                <span>
                  {aspect.pointA} — {aspect.pointB}
                </span>
                <span>{aspect.orb.toFixed(2)}°</span>
              </div>
            ))
          ) : (
            <div className={styles.emptyRow}>Мажорные аспекты не найдены</div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatPointPosition(point: ChartPoint): string {
  return `${point.sign} ${formatDegree(point.signDegree)}${point.retrograde ? " R" : ""}`;
}

function formatDegree(value: number): string {
  const degrees = Math.floor(value);
  const minutes = Math.round((value - degrees) * 60);

  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}
