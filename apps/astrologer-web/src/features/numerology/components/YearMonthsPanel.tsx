import {
  buildPersonalMonthItems,
  formatNullableNumerologyNumber
} from "../model/numerologyResultPanelModel";
import styles from "./NumerologyComponents.module.css";

export type YearMonthsPanelProps = {
  readonly personalYear: number | null;
  readonly currentDate: Date;
};

export function YearMonthsPanel({ personalYear, currentDate }: YearMonthsPanelProps) {
  const monthPanel = buildPersonalMonthItems({ personalYear, currentDate });

  return (
    <div className={styles.yearMonths}>
      <span className={styles.kicker}>Личные месяцы · {monthPanel.year}</span>
      <div>
        {monthPanel.items.map((month) => (
          <span data-current={month.isCurrent ? "true" : undefined} key={month.label}>
            <small>{month.label}</small>
            <strong>{formatNullableNumerologyNumber(month.value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
