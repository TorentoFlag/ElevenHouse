import type { NumerologyWorkspaceCompatibilityComparison } from "../model/numerologyWorkspaceModel";
import { getCompatibilityComparisonSelection } from "../model/numerologyCompatibilityExpansionModel";
import styles from "./NumerologyComponents.module.css";

export function CompatibilityComparisonList({
  title,
  ariaLabel,
  comparisons,
  selectedSelector,
  collapsedSelector,
  onSelect
}: {
  readonly title: string;
  readonly ariaLabel: string;
  readonly comparisons: readonly NumerologyWorkspaceCompatibilityComparison[];
  readonly selectedSelector: string | null;
  readonly collapsedSelector: string;
  readonly onSelect: (selector: string) => void;
}) {
  return (
    <section className={styles.comparisonList} aria-label={ariaLabel}>
      <span className={styles.kicker}>{title}</span>
      {comparisons.map((comparison) => {
        const isExpanded = selectedSelector === comparison.selector;

        return (
          <button
            aria-expanded={isExpanded}
            className={styles.comparisonRow}
            data-expanded={isExpanded ? "true" : undefined}
            data-selected={isExpanded ? "true" : undefined}
            key={comparison.selector}
            onClick={() =>
              onSelect(
                getCompatibilityComparisonSelection(
                  selectedSelector,
                  comparison.selector,
                  collapsedSelector
                )
              )
            }
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
        );
      })}
    </section>
  );
}
