import type { AstroDiaryTimelineItem } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "./AstroDiaryWorkspaceView.module.css";

type AstroDiaryTimelineProps = Readonly<{
  copy: AstrologerCopy["astroDiary"];
  locale: SupportedLocale;
  timeZone?: string;
  items: readonly AstroDiaryTimelineItem[];
  status: "loading" | "empty" | "error" | "ready";
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}>;

export function AstroDiaryTimeline({
  copy,
  locale,
  timeZone,
  items,
  status,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onRetry,
  onLoadMore
}: AstroDiaryTimelineProps) {
  if (status === "loading") {
    return (
      <div className={styles.timelineState} aria-busy="true">
        <span className={styles.timelineSkeleton} />
        <span className={styles.timelineSkeleton} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.timelineState} role="alert">
        <p>{copy.timeline.errorLabel}</p>
        <button type="button" onClick={onRetry}>
          <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
          {copy.retryLabel}
        </button>
      </div>
    );
  }
  if (status === "empty") {
    return <p className={styles.timelineState}>{copy.timeline.emptyLabel}</p>;
  }

  return (
    <div className={styles.timelineItems} aria-label={copy.timeline.ariaLabel}>
      <article className={styles.explanationCard}>
        <Icon iconName="orbit" width={20} height={20} aria-hidden="true" />
        <div>
          <strong>{copy.timeline.contextTitle}</strong>
          <p>{copy.timeline.contextDescription}</p>
        </div>
      </article>
      {items.map((item) => (
        <article className={styles.timelineItem} data-author={item.authorRole} key={item.id}>
          <div className={styles.timelineMeta}>
            <strong>{copy.timeline.authorLabels[item.authorRole]}</strong>
            <span>{formatTimelineDate(item.occurredAt, locale, timeZone)}</span>
          </div>
          <p className={styles.timelineKind}>{copy.timeline.kindLabels[item.kind]}</p>
          <p className={styles.timelineBody}>
            {"body" in item ? item.body : copy.timeline.tombstoneLabels[item.reason]}
          </p>
          {item.kind === "client_entry" && item.moodId ? (
            <span className={styles.mood}>{copy.timeline.moodLabels[item.moodId]}</span>
          ) : null}
        </article>
      ))}
      {loadMoreError ? (
        <div className={styles.loadMoreError} role="alert">
          <p>{copy.timeline.loadMoreErrorLabel}</p>
          <button type="button" onClick={onLoadMore}>
            <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
            {copy.timeline.retryLoadMoreLabel}
          </button>
        </div>
      ) : hasMore ? (
        <button
          className={styles.loadMoreButton}
          type="button"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          {isLoadingMore ? copy.timeline.loadingMoreLabel : copy.timeline.loadMoreLabel}
        </button>
      ) : null}
    </div>
  );
}

function formatTimelineDate(instant: string, locale: SupportedLocale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {})
  }).format(new Date(instant));
}
