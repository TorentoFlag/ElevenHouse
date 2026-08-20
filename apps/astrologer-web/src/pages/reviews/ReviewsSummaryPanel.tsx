import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { AstrologerReviewsSummary } from "../../features/reviews/model/reviewsPresentation";
import type { ReviewsPageCopy } from "./ReviewsPage";
import styles from "./ReviewsPage.module.css";

export function ReviewsSummaryPanel({
  copy,
  summary
}: {
  readonly copy: ReviewsPageCopy;
  readonly summary: AstrologerReviewsSummary;
}) {
  const maxCount = Math.max(...summary.distribution.map((item) => item.count), 1);

  return (
    <aside
      className={styles.summaryCard}
      aria-label={copy.publishedCountLabel(summary.publishedCount, summary.totalCount)}
    >
      <div className={styles.summaryAverage}>{summary.averageRating}</div>
      <div className={styles.summaryStars} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <Icon
            key={index}
            iconName="star"
            size={16}
            fill={index < Math.round(Number(summary.averageRating) || 0) ? "currentColor" : "none"}
          />
        ))}
      </div>
      <p className={styles.summaryCount}>
        {copy.publishedCountLabel(summary.publishedCount, summary.totalCount)}
      </p>
      <div className={styles.distribution}>
        {summary.distribution.map((item) => (
          <div key={item.rating} className={styles.distributionRow}>
            <span className={styles.distributionRating}>{item.rating}</span>
            <Icon iconName="star" size={11} fill="currentColor" aria-hidden="true" />
            <span className={styles.distributionTrack} aria-hidden="true">
              <span
                className={styles.distributionFill}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </span>
            <span className={styles.distributionCount}>{item.count}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
