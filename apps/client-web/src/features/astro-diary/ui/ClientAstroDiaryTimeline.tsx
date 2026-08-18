import type { AstroDiaryTimelineItem } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ClientCopy } from "../../../common/i18n/clientCopy";
import styles from "./ClientAstroDiaryWorkspaceView.module.css";

export function ClientAstroDiaryTimeline(props: {
  readonly copy: ClientCopy["astroDiary"];
  readonly locale: SupportedLocale;
  readonly items: readonly AstroDiaryTimelineItem[];
  readonly status: "loading" | "empty" | "error" | "ready";
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly loadMoreError: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
}) {
  if (props.status === "loading") {
    return <div className={styles.timelineState} aria-busy="true"><span className={styles.timelineSkeleton} /><span className={styles.timelineSkeleton} /></div>;
  }
  if (props.status === "error") {
    return <div className={styles.timelineState} role="alert"><p>{props.copy.timeline.errorLabel}</p><button type="button" onClick={props.onRetry}><Icon iconName="refresh" width={14} height={14} aria-hidden="true" />{props.copy.retryLabel}</button></div>;
  }
  if (props.status === "empty") return <p className={styles.timelineState}>{props.copy.timeline.emptyLabel}</p>;

  return (
    <div className={styles.timelineItems} aria-label={props.copy.timeline.ariaLabel}>
      <article className={styles.explanationCard}>
        <Icon iconName="orbit" width={20} height={20} aria-hidden="true" />
        <div><strong>{props.copy.timeline.contextTitle}</strong><p>{props.copy.timeline.contextDescription}</p></div>
      </article>
      {props.items.map((item) => (
        <article className={styles.timelineItem} data-author={item.authorRole} key={item.id}>
          <div className={styles.timelineMeta}><strong>{props.copy.timeline.authorLabels[item.authorRole]}</strong><span>{formatDate(item.occurredAt, props.locale)}</span></div>
          <p className={styles.timelineKind}>{props.copy.timeline.kindLabels[item.kind]}</p>
          <p className={styles.timelineBody}>{"body" in item ? item.body : props.copy.timeline.tombstoneLabels[item.reason]}</p>
          {item.kind === "client_entry" && item.moodId ? <span className={styles.mood}>{props.copy.timeline.moodLabels[item.moodId]}</span> : null}
        </article>
      ))}
      {props.loadMoreError ? (
        <div className={styles.loadMoreError} role="alert"><p>{props.copy.timeline.loadMoreErrorLabel}</p><button type="button" onClick={props.onLoadMore}><Icon iconName="refresh" width={14} height={14} aria-hidden="true" />{props.copy.timeline.retryLoadMoreLabel}</button></div>
      ) : props.hasMore ? (
        <button className={styles.loadMoreButton} type="button" disabled={props.isLoadingMore} onClick={props.onLoadMore}>{props.isLoadingMore ? props.copy.timeline.loadingMoreLabel : props.copy.timeline.loadMoreLabel}</button>
      ) : null}
    </div>
  );
}

function formatDate(instant: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(instant));
}
