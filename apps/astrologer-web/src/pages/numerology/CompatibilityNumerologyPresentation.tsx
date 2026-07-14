import type {
  NumerologyWorkspaceCompatibilityComparison,
  NumerologyWorkspaceModel
} from "../../features/numerology/model/numerologyWorkspaceModel";
import styles from "./NumerologyPresentation.module.css";

const participantNumberFields = [
  ["lifePath", "Жизненный путь"],
  ["expression", "Выражение"],
  ["soul", "Душа"],
  ["personality", "Личность"],
  ["birthday", "День рождения"]
] as const;

const countGroups = [
  ["key_numbers", "Ключевые числа"],
  ["psychomatrix", "Психоматрица"],
  ["strength_lines", "Линии силы"],
  ["total", "Всего"]
] as const;

export type CompatibilityNumerologyPresentationProps = {
  readonly model: NumerologyWorkspaceModel;
  readonly interpretationText: string;
};

export function CompatibilityNumerologyPresentation({
  model,
  interpretationText
}: CompatibilityNumerologyPresentationProps) {
  const compatibility = model.compatibility;
  if (!compatibility) {
    return <p role="alert">Данные совместимости не прошли проверку целостности.</p>;
  }

  const interpretation = interpretationText.trim();

  return (
    <div className={styles.presentation}>
      <section className={styles.section} aria-labelledby="presentation-participants">
        <h3 className={styles.sectionTitle} id="presentation-participants">
          Участники
        </h3>
        <div className={styles.participants}>
          {compatibility.participants.map((participant) => (
            <article className={styles.participantCard} key={participant.displayName}>
              <div className={styles.participantIdentity}>
                <span className={styles.avatar}>{participant.initials}</span>
                <strong>{participant.displayName}</strong>
              </div>
              <div className={styles.participantNumbers}>
                {participantNumberFields.map(([field, label]) => (
                  <span data-participant-number={field} key={field}>
                    <small>{label}</small>
                    <strong>{participant[field] ?? "—"}</strong>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.pairCard} aria-label="Число пары">
        <strong>{compatibility.pairNumber ?? "—"}</strong>
        <div>
          <h3>Число пары</h3>
          <span>{compatibility.pairMeaning?.essence ?? "Без трактовки"}</span>
          {compatibility.pairMeaning ? <p>{compatibility.pairMeaning.text}</p> : null}
        </div>
      </section>

      <ComparisonSection
        title="Ключевые числа"
        dataAttribute="data-key-comparison"
        comparisons={compatibility.keyNumberComparisons}
      />
      <ComparisonSection
        title="Психоматрица"
        dataAttribute="data-matrix-comparison"
        comparisons={compatibility.matrixComparisons}
      />
      <ComparisonSection
        title="Линии силы"
        dataAttribute="data-line-comparison"
        comparisons={compatibility.strengthLineComparisons}
      />

      <section className={styles.section} aria-labelledby="presentation-zones">
        <h3 className={styles.sectionTitle} id="presentation-zones">
          Зоны совместимости
        </h3>
        <div className={styles.zoneGrid}>
          {compatibility.zones.map((zone) => (
            <article
              className={styles.zoneCard}
              data-compatibility-zone={zone.code}
              key={zone.code}
            >
              <div>
                <strong>{zone.label}</strong>
                <span>{zone.relationLabel}</span>
              </div>
              <small>{formatCounts(zone.counts)}</small>
              <p>{zone.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="presentation-counts">
        <h3 className={styles.sectionTitle} id="presentation-counts">
          Статистика отношений
        </h3>
        <div className={styles.countGrid}>
          {countGroups.map(([code, label]) => {
            const counts = compatibility.counts[code];
            return (
              <article data-relation-counts={code} key={code}>
                <strong>{label}</strong>
                <span>Совпадения: {counts.match}</span>
                <span>Близкие: {counts.close}</span>
                <span>Различия: {counts.different}</span>
                <span>Напряжения: {counts.tension}</span>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.conclusion} aria-labelledby="presentation-conclusion">
        <span>Итог совместимости</span>
        <h3 id="presentation-conclusion">{compatibility.conclusion.label}</h3>
        <p>{compatibility.conclusion.explanation}</p>
      </section>

      {interpretation ? (
        <section className={styles.interpretation} aria-labelledby="compatibility-interpretation">
          <h3 className={styles.sectionTitle} id="compatibility-interpretation">
            Трактовка астролога
          </h3>
          <p>{interpretation}</p>
        </section>
      ) : null}
    </div>
  );
}

function ComparisonSection({
  title,
  dataAttribute,
  comparisons
}: {
  readonly title: string;
  readonly dataAttribute: "data-key-comparison" | "data-matrix-comparison" | "data-line-comparison";
  readonly comparisons: readonly NumerologyWorkspaceCompatibilityComparison[];
}) {
  return (
    <section className={styles.section} aria-label={`Сравнение: ${title}`}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.comparisonList}>
        {comparisons.map((comparison) => (
          <article
            className={styles.comparisonRow}
            {...{ [dataAttribute]: comparison.code }}
            key={comparison.selector}
          >
            <div className={styles.comparisonHeading}>
              <strong>{comparison.label}</strong>
              <span>{comparison.relationLabel}</span>
            </div>
            <div className={styles.comparisonValues}>
              <b>
                {comparison.valueA} · {comparison.valueB}
              </b>
              <small>Разница: {comparison.difference}</small>
            </div>
            <p>{comparison.explanation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatCounts(counts: {
  readonly match: number;
  readonly close: number;
  readonly different: number;
  readonly tension: number;
}): string {
  return `${counts.match} совпадений · ${counts.close} близких · ${counts.different} различий · ${counts.tension} напряжений`;
}
