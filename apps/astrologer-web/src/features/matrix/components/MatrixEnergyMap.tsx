import type { MatrixData, MatrixEnergyRowCode } from "@elevenhouse/contracts";
import type { MatrixSelector } from "../model/matrixWorkspaceModel";
import styles from "../../../pages/matrix/MatrixPage.module.css";

const rows: Record<MatrixEnergyRowCode, { label: string; theme: string }> = {
  sahasrara: { label: "Сахасрара", theme: "миссия, связь с высшим" },
  ajna: { label: "Аджна", theme: "интуиция, ясность" },
  vishuddha: { label: "Вишудха", theme: "самовыражение, голос" },
  anahata: { label: "Анахата", theme: "любовь, принятие" },
  manipura: { label: "Манипура", theme: "воля, статус" },
  svadhisthana: { label: "Свадхистана", theme: "удовольствие, творчество" },
  muladhara: { label: "Муладхара", theme: "тело, материя, безопасность" }
};

export function MatrixEnergyMap({
  matrix,
  onSelect
}: {
  readonly matrix: MatrixData;
  readonly onSelect: (selector: MatrixSelector) => void;
}) {
  return (
    <section className={styles.energyCard} aria-labelledby="matrix-energy-title">
      <header>
        <h2 id="matrix-energy-title">Энергетическая карта</h2>
        <span>символические темы по центрам</span>
      </header>
      <div className={styles.energyGrid}>
        <span />
        <span className={styles.energyColumn}>Физика</span>
        <span className={styles.energyColumn}>Энергия</span>
        <span className={styles.energyColumn}>Эмоции</span>
        {matrix.energyMap.rows.map((row) => (
          <div className={styles.energyRow} key={row.code}>
            <button
              type="button"
              className={styles.energyName}
              onClick={() => onSelect(`energy:${row.code}`)}
            >
              <strong>{rows[row.code].label}</strong>
              <small>{rows[row.code].theme}</small>
            </button>
            <span>{row.physical}</span>
            <span>{row.energy}</span>
            <span>{row.emotions}</span>
          </div>
        ))}
        <div className={styles.energyTotal}>
          <strong>Итог</strong>
          <span>{matrix.energyMap.totals.physical}</span>
          <span>{matrix.energyMap.totals.energy}</span>
          <span>{matrix.energyMap.totals.emotions}</span>
        </div>
      </div>
    </section>
  );
}
