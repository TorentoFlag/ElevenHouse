import type { ClientCrmActivityItem } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import {
  formatClientCrmActivityItem,
  formatClientCrmDateTime
} from "../model/clientsCrmPresentation";
import styles from "./ClientsCrm.module.css";

type ClientCrmActivityTimelineProps = {
  readonly copy: ClientsCrmCopy;
  readonly items: readonly ClientCrmActivityItem[];
  readonly locale: SupportedLocale;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
};

export function ClientCrmActivityTimeline({
  copy,
  items,
  locale,
  isLoading,
  isError,
  onRetry
}: ClientCrmActivityTimelineProps) {
  if (isLoading) {
    return (
      <div role="status" aria-label={copy.loadingActivityLabel} className={styles.loadingState}>
        {copy.loadingActivityLabel}
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" aria-label={copy.activityErrorTitle} className={styles.errorState}>
        <div>
          <p className={styles.errorTitle}>{copy.activityErrorTitle}</p>
          <button type="button" className={styles.button} onClick={onRetry}>
            <Icon iconName="refresh" size={15} aria-hidden="true" />
            {copy.retryLabel}
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return <div className={styles.emptyState}>{copy.emptyActivity}</div>;
  }

  return (
    <div className={styles.activityTimeline}>
      {items.map((item) => {
        const presentation = formatClientCrmActivityItem(item, locale);

        return (
          <article className={styles.activityItem} key={item.id}>
            <span className={styles.activityIcon} data-tone={presentation.tone} aria-hidden="true">
              <Icon iconName={activityIconNameByKind[item.kind]} size={17} />
            </span>
            <div className={styles.activityContent}>
              <div>
                <div className={styles.activityTitle}>{presentation.title}</div>
                <div className={styles.activityMeta}>{formatClientCrmDateTime(item.occurredAt, locale)}</div>
              </div>
              <span className={styles.activityDetail}>{presentation.detail}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const activityIconNameByKind = {
  relationship_created: "users",
  lifecycle_changed: "verified",
  birth_data_updated: "calendar",
  related_birth_profile_updated: "orbit"
} as const;
