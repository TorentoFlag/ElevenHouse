import type {
  AstrologerClientCrmListItem,
  ClientLifecycleStatus,
  ClientRelationshipSource
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import {
  formatClientCrmDate,
  formatClientCrmDisplayName,
  formatClientCrmLifecycle,
  formatClientCrmReadiness,
  formatClientCrmSource
} from "../model/clientsCrmPresentation";
import { ClientCrmAvatar } from "./ClientCrmAvatar";
import styles from "./ClientsCrm.module.css";

type ClientCrmListPanelProps = {
  readonly copy: ClientsCrmCopy;
  readonly items: readonly AstrologerClientCrmListItem[];
  readonly locale: SupportedLocale;
  readonly selectedClientUserId: string | undefined;
  readonly search: string;
  readonly lifecycle: ClientLifecycleStatus | undefined;
  readonly source: ClientRelationshipSource | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isFiltered: boolean;
  readonly hasNextPage: boolean;
  readonly isFetching: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onLifecycleChange: (value: ClientLifecycleStatus | undefined) => void;
  readonly onSourceChange: (value: ClientRelationshipSource | undefined) => void;
  readonly onSelectClient: (clientUserId: string) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
};

const lifecycleOptions = ["new", "active", "waiting_for_client", "in_service", "inactive"] as const;
const sourceOptions = ["direct_link", "booking", "order", "lead_magnet", "manual"] as const;

export function ClientCrmListPanel({
  copy,
  items,
  locale,
  selectedClientUserId,
  search,
  lifecycle,
  source,
  isLoading,
  isError,
  isFiltered,
  hasNextPage,
  isFetching,
  onSearchChange,
  onLifecycleChange,
  onSourceChange,
  onSelectClient,
  onLoadMore,
  onRetry
}: ClientCrmListPanelProps) {
  return (
    <aside className={styles.listPanel} aria-labelledby="clients-page-title">
      <div className={styles.listControls}>
        <label className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon iconName="search" size={16} />
          </span>
          <input
            aria-label={copy.searchLabel}
            className={`${styles.input} ${styles.searchInput}`}
            id="client-crm-search"
            name="client-crm-search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={copy.searchPlaceholder}
            type="search"
            value={search}
          />
        </label>

        <div className={styles.filterGroup} aria-label={copy.lifecycleFilterLabel}>
          <span className={styles.filterLabel}>{copy.lifecycleFilterLabel}</span>
          <button
            aria-pressed={lifecycle === undefined}
            className={styles.chip}
            data-active={lifecycle === undefined}
            onClick={() => onLifecycleChange(undefined)}
            type="button"
          >
            {copy.allLabel}
          </button>
          {lifecycleOptions.map((option) => (
            <button
              aria-pressed={lifecycle === option}
              className={styles.chip}
              data-active={lifecycle === option}
              key={option}
              onClick={() => onLifecycleChange(option)}
              type="button"
            >
              {formatClientCrmLifecycle(option, locale).label}
            </button>
          ))}
        </div>

        <label>
          <span className={styles.filterLabel}>{copy.sourceFilterLabel}</span>
          <select
            aria-label={copy.sourceFilterLabel}
            className={styles.select}
            id="client-crm-source-filter"
            name="client-crm-source-filter"
            onChange={(event) =>
              onSourceChange(event.target.value ? (event.target.value as ClientRelationshipSource) : undefined)
            }
            value={source ?? ""}
          >
            <option value="">{copy.allLabel}</option>
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {formatClientCrmSource(option, locale).label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.listScroller}>
        {isLoading ? (
          <div role="status" aria-label={copy.loadingListLabel} className={styles.loadingState}>
            {copy.loadingListLabel}
          </div>
        ) : isError ? (
          <div role="alert" aria-label={copy.listErrorTitle} className={styles.errorState}>
            <div>
              <p className={styles.errorTitle}>{copy.listErrorTitle}</p>
              <button type="button" className={styles.button} onClick={onRetry}>
                <Icon iconName="refresh" size={15} aria-hidden="true" />
                {copy.retryLabel}
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <div>
              <p className={styles.emptyTitle}>
                {isFiltered ? copy.filteredEmptyTitle : copy.emptyTitle}
              </p>
              <p className={styles.emptyDescription}>
                {isFiltered ? copy.filteredEmptyDescription : copy.emptyDescription}
              </p>
            </div>
          </div>
        ) : (
          <>
            <ul className={styles.clientList}>
              {items.map((item) => (
                <ClientCrmListRow
                  item={item}
                  key={item.clientUserId}
                  locale={locale}
                  selected={item.clientUserId === selectedClientUserId}
                  onSelect={onSelectClient}
                />
              ))}
            </ul>
            {hasNextPage ? (
              <button
                className={styles.button}
                disabled={isFetching}
                onClick={onLoadMore}
                type="button"
              >
                {isFetching ? copy.loadingMoreLabel : copy.loadMoreLabel}
              </button>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

type ClientCrmListRowProps = {
  readonly item: AstrologerClientCrmListItem;
  readonly locale: SupportedLocale;
  readonly selected: boolean;
  readonly onSelect: (clientUserId: string) => void;
};

function ClientCrmListRow({ item, locale, selected, onSelect }: ClientCrmListRowProps) {
  const name = formatClientCrmDisplayName(item.clientUserId, item.displayName, locale);
  const lifecycle = formatClientCrmLifecycle(item.lifecycle.status, locale);
  const birthDataReadiness = formatClientCrmReadiness("birthData", item.readiness.birthData, locale);

  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className={styles.clientRow}
        onClick={() => onSelect(item.clientUserId)}
        type="button"
      >
        <ClientCrmAvatar name={name} />
        <span className={styles.rowMain}>
          <span className={styles.rowTop}>
            <span className={styles.rowName}>{name}</span>
            <span className={styles.badge} data-tone={lifecycle.tone}>
              {lifecycle.label}
            </span>
          </span>
          <span className={styles.rowMeta}>
            <span>{formatClientCrmSource(item.relationship.source, locale).label}</span>
            <span aria-hidden="true">·</span>
            <span>{formatClientCrmDate(item.relationship.lastLinkedAt, locale)}</span>
            <span aria-hidden="true">·</span>
            <span>{birthDataReadiness.label}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
