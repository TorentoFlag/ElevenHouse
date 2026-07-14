import type { NumerologyWorkspaceCompatibilityComparison } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";

export function CompatibilityComparisonList({
  title,
  ariaLabel,
  comparisons,
  selectedSelector,
  onSelect
}: {
  readonly title: string;
  readonly ariaLabel: string;
  readonly comparisons: readonly NumerologyWorkspaceCompatibilityComparison[];
  readonly selectedSelector: string | null;
  readonly onSelect: (selector: string) => void;
}) {
  return (
    <section className={styles.comparisonList} aria-label={ariaLabel}>
      <span className={styles.kicker}>{title}</span>
      {comparisons.map((comparison) => (
        <button
          className={styles.comparisonRow}
          data-selected={selectedSelector === comparison.selector ? "true" : undefined}
          key={comparison.selector}
          onClick={() => onSelect(comparison.selector)}
          type="button"
        >
          <span className={styles.comparisonHeading}>
            <strong>{comparison.label}</strong>
            <small>{comparison.explanation}</small>
          </span>
          <span className={styles.comparisonValues}>
            <strong>{comparison.valueA}</strong>
            <small>·</small>
            <strong>{comparison.valueB}</strong>
          </span>
          <span className={styles.relationBadge} data-relation={comparison.relation}>
            {comparison.relationLabel}
          </span>
          <small className={styles.comparisonDifference}>Δ {comparison.difference}</small>
        </button>
      ))}
    </section>
  );
}

