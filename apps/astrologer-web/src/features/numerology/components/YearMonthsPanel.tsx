import {
  buildPersonalMonthItems,
  formatNullableNumerologyNumber
} from "../model/numerologyResultPanelModel";
import styles from "./NumerologyComponents.module.css";

export type YearMonthsPanelProps = {
  readonly personalMonths: readonly {
    readonly year: number;
    readonly month: number;
    readonly value: number;
  }[];
  readonly currentDate: Date;
};

export function YearMonthsPanel({ personalMonths, currentDate }: YearMonthsPanelProps) {
  const monthPanel = buildPersonalMonthItems({
    personalMonths,
    currentMonth: currentDate.getMonth() + 1
  });

  return (
    <div className={styles.yearMonths}>
      <span className={styles.kicker}>Личные месяцы · {monthPanel.year ?? "—"}</span>
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
