import type {
  NumerologyWorkspaceCompatibilityConclusion,
  NumerologyWorkspaceCompatibilityZone
} from "../model/numerologyWorkspaceModel";
import type { NumerologyRelationCounts } from "@elevenhouse/contracts";
import styles from "./NumerologyComponents.module.css";

export function CompatibilitySummary({
  pairNumber,
  zones,
  counts,
  conclusion,
  selectedSelector,
  onSelect
}: {
  readonly pairNumber: number | null;
  readonly zones: readonly NumerologyWorkspaceCompatibilityZone[];
  readonly counts: NumerologyRelationCounts;
  readonly conclusion: NumerologyWorkspaceCompatibilityConclusion;
  readonly selectedSelector: string | null;
  readonly onSelect: (selector: string) => void;
}) {
  return (
    <>
      <section className={styles.compatibilityZones} aria-label="Зоны совместимости">
        <span className={styles.kicker}>Зоны совместимости</span>
        {zones.map((zone) => (
          <button
            className={styles.zoneRow}
            data-selected={selectedSelector === zone.selector ? "true" : undefined}
            key={zone.code}
            onClick={() => onSelect(zone.selector)}
            type="button"
          >
            <span>
              <strong>{zone.label}</strong>
              <small>{zone.explanation}</small>
            </span>
            <span className={styles.relationBadge} data-relation={zone.relation}>
              {zone.relationLabel}
            </span>
          </button>
        ))}
      </section>
      <section className={styles.compatibilityConclusion} aria-label="Итог совместимости">
        <span className={styles.kicker}>Итог совместимости</span>
        <button
          className={styles.conclusionButton}
          data-selected={selectedSelector === conclusion.selector ? "true" : undefined}
          onClick={() => onSelect(conclusion.selector)}
          type="button"
        >
          <span className={styles.conclusionNumber}>{pairNumber ?? "—"}</span>
          <span>
            <strong>{conclusion.label}</strong>
            <small>{conclusion.explanation}</small>
          </span>
        </button>
        <div className={styles.compatibilityCounts} aria-label="Статистика совместимости">
          <span>{counts.match} совпадения</span>
          <span>{counts.close} близких</span>
          <span>{counts.different} различий</span>
          <span>{counts.tension} напряжений</span>
        </div>
      </section>
    </>
  );
}

