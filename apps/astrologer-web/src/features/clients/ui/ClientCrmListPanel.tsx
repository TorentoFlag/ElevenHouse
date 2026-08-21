import type {
  AstrologerClientCrmListItem,
  AstrologerClientCrmManualClientCreateRequest,
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
import { ClientCrmManualCreatePanel } from "./ClientCrmManualCreatePanel";
import styles from "./ClientsCrm.module.css";

type ClientCrmListPanelProps = {
  readonly copy: ClientsCrmCopy;
  readonly items: readonly AstrologerClientCrmListItem[];
  readonly locale: SupportedLocale;
  readonly selectedClientUserId: string | undefined;
  readonly search: string;
  readonly lifecycle: ClientLifecycleStatus | undefined;
  readonly source: ClientRelationshipSource | undefined;
  readonly viewMode: ClientCrmListViewMode;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isFiltered: boolean;
  readonly hasNextPage: boolean;
  readonly isFetching: boolean;
  readonly isManualClientCreating: boolean;
  readonly isManualClientCreateError: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onLifecycleChange: (value: ClientLifecycleStatus | undefined) => void;
  readonly onSourceChange: (value: ClientRelationshipSource | undefined) => void;
  readonly onViewModeChange: (value: ClientCrmListViewMode) => void;
  readonly onSelectClient: (clientUserId: string) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly onCreateManualClient: (
    input: AstrologerClientCrmManualClientCreateRequest
  ) => Promise<unknown>;
};

export type ClientCrmListViewMode = "list" | "pipeline";

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
  viewMode,
  isLoading,
  isError,
  isFiltered,
  hasNextPage,
  isFetching,
  isManualClientCreating,
  isManualClientCreateError,
  onSearchChange,
  onLifecycleChange,
  onSourceChange,
  onViewModeChange,
  onSelectClient,
  onLoadMore,
  onRetry,
  onCreateManualClient
}: ClientCrmListPanelProps) {
  return (
    <aside className={styles.listPanel} aria-labelledby="clients-page-title">
      <div className={styles.listControls}>
        <div className={styles.viewModeSwitch} aria-label={copy.pipelineViewLabel}>
          <button
            aria-pressed={viewMode === "list"}
            className={styles.viewModeButton}
            data-active={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
            type="button"
          >
            {copy.listViewLabel}
          </button>
          <button
            aria-pressed={viewMode === "pipeline"}
            className={styles.viewModeButton}
            data-active={viewMode === "pipeline"}
            onClick={() => onViewModeChange("pipeline")}
            type="button"
          >
            {copy.pipelineViewLabel}
          </button>
        </div>

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

        <ClientCrmManualCreatePanel
          copy={copy.manualCreate}
          isSaving={isManualClientCreating}
          isError={isManualClientCreateError}
          onCreate={onCreateManualClient}
        />
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
            {viewMode === "pipeline" ? (
              <ClientCrmPipelineBoard
                copy={copy}
                items={items}
                locale={locale}
                selectedClientUserId={selectedClientUserId}
                onSelect={onSelectClient}
              />
            ) : (
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
            )}
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

type ClientCrmPipelineBoardProps = {
  readonly copy: ClientsCrmCopy;
  readonly items: readonly AstrologerClientCrmListItem[];
  readonly locale: SupportedLocale;
  readonly selectedClientUserId: string | undefined;
  readonly onSelect: (clientUserId: string) => void;
};

function ClientCrmPipelineBoard({
  copy,
  items,
  locale,
  selectedClientUserId,
  onSelect
}: ClientCrmPipelineBoardProps) {
  return (
    <div className={styles.pipelineBoard}>
      {lifecycleOptions.map((status) => {
        const columnItems = items.filter((item) => item.lifecycle.status === status);
        const lifecycle = formatClientCrmLifecycle(status, locale);

        return (
          <section className={styles.pipelineColumn} key={status} aria-label={lifecycle.label}>
            <header className={styles.pipelineColumnHeader}>
              <span className={styles.badge} data-tone={lifecycle.tone}>
                {lifecycle.label}
              </span>
              <span className={styles.pipelineCount}>{columnItems.length}</span>
            </header>
            <div className={styles.pipelineColumnBody}>
              {columnItems.length === 0 ? (
                <p className={styles.pipelineEmpty}>{copy.emptyTitle}</p>
              ) : (
                columnItems.map((item) => (
                  <ClientCrmPipelineCard
                    item={item}
                    key={item.clientUserId}
                    locale={locale}
                    selected={item.clientUserId === selectedClientUserId}
                    onSelect={onSelect}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type ClientCrmPipelineCardProps = {
  readonly item: AstrologerClientCrmListItem;
  readonly locale: SupportedLocale;
  readonly selected: boolean;
  readonly onSelect: (clientUserId: string) => void;
};

function ClientCrmPipelineCard({ item, locale, selected, onSelect }: ClientCrmPipelineCardProps) {
  const name = formatClientCrmDisplayName(item.clientUserId, item.displayName, locale);
  const birthDataReadiness = formatClientCrmReadiness("birthData", item.readiness.birthData, locale);

  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={styles.pipelineCard}
      onClick={() => onSelect(item.clientUserId)}
      type="button"
    >
      <span className={styles.pipelineCardTop}>
        <ClientCrmAvatar name={name} />
        <span className={styles.rowName}>{name}</span>
      </span>
      <span className={styles.rowMeta}>
        <span>{formatClientCrmSource(item.relationship.source, locale).label}</span>
        <span aria-hidden="true">·</span>
        <span>{birthDataReadiness.label}</span>
      </span>
    </button>
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
