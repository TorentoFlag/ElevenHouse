import type { NumerologyWorkspaceModel } from "../../features/numerology/model/numerologyWorkspaceModel";
import styles from "./NumerologyPresentation.module.css";

const monthLabels = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
] as const;

const individualKeyNumberCodes = new Set([
  "lifePath",
  "expression",
  "soul",
  "personality",
  "birthday"
]);

export type IndividualNumerologyPresentationProps = {
  readonly model: NumerologyWorkspaceModel;
  readonly isPeriodVisible: boolean;
  readonly interpretationText: string;
};

export function IndividualNumerologyPresentation({
  model,
  isPeriodVisible,
  interpretationText
}: IndividualNumerologyPresentationProps) {
  const interpretation = interpretationText.trim();
  const showPeriod = isPeriodVisible && model.personalYear !== null;

  return (
    <div className={styles.presentation}>
      <section className={styles.identity} aria-label="Участник расчета">
        <span className={styles.avatar}>{model.subject?.initials || "#"}</span>
        <div>
          <strong>{model.subject?.displayName ?? model.title}</strong>
          <span>{model.subject?.birthDate ?? ""}</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="presentation-key-numbers">
        <h3 className={styles.sectionTitle} id="presentation-key-numbers">
          Ключевые числа
        </h3>
        <div className={styles.keyGrid}>
          {model.keyNumbers
            .filter((item) => individualKeyNumberCodes.has(item.code))
            .map((item) => (
              <article className={styles.keyCard} data-key-number={item.code} key={item.code}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
                {item.meaning ? <small>{item.meaning.essence}</small> : null}
              </article>
            ))}
        </div>
      </section>

      {showPeriod ? (
        <section className={styles.section} aria-labelledby="presentation-period">
          <h3 className={styles.sectionTitle} id="presentation-period">
            Прогнозный период
          </h3>
          <article className={styles.yearCard} data-personal-year={model.personalYear?.year}>
            <strong>Личный год {model.personalYear?.year}</strong>
            <span>{model.personalYear?.value}</span>
          </article>
          <div className={styles.monthGrid} aria-label="Личные месяцы">
            {model.personalMonths.map((month) => (
              <article
                className={styles.monthCard}
                data-personal-month={month.month}
                key={`${month.year}-${month.month}`}
              >
                <small>{monthLabels[month.month - 1] ?? String(month.month)}</small>
                <strong>{month.value}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {model.matrix ? (
        <section className={styles.section} aria-labelledby="presentation-matrix">
          <div className={styles.sectionHeading}>
            <h3 className={styles.sectionTitle} id="presentation-matrix">
              Психоматрица
            </h3>
            <span>Рабочие числа: {model.matrix.workingNumbersLabel || "—"}</span>
          </div>
          <div className={styles.matrixGrid}>
            {model.matrix.cells.map((cell) => (
              <article className={styles.matrixCell} data-matrix-cell={cell.digit} key={cell.digit}>
                <strong>{cell.value || "—"}</strong>
                <span>{cell.label}</span>
                <small>{cell.text}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="presentation-lines">
        <h3 className={styles.sectionTitle} id="presentation-lines">
          Линии силы
        </h3>
        <div className={styles.lineGrid}>
          {model.strengthLines.map((line) => (
            <article className={styles.lineCard} data-strength-line={line.code} key={line.code}>
              <div>
                <strong>{line.label}</strong>
                <span>{line.level}</span>
              </div>
              <b>{line.value}</b>
              <p>{line.text}</p>
            </article>
          ))}
        </div>
      </section>

      {interpretation ? (
        <section className={styles.interpretation} aria-labelledby="presentation-interpretation">
          <h3 className={styles.sectionTitle} id="presentation-interpretation">
            Трактовка астролога
          </h3>
          <p>{interpretation}</p>
        </section>
      ) : null}
    </div>
  );
}
