import type {
  AstrologerClientCrmDetail,
  AstrologerClientCrmListItem,
  ClientCrmActivityItem,
  ClientLifecycleStatus,
  ClientRelationshipSource
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ClientsCrmCopy } from "../../common/i18n/astrologerCopy";
import { ClientCrmDetailPanel } from "../../features/clients/ui/ClientCrmDetailPanel";
import { ClientCrmListPanel } from "../../features/clients/ui/ClientCrmListPanel";
import type { ClientCrmTabId } from "../../features/clients/ui/ClientCrmTabs";
import styles from "../../features/clients/ui/ClientsCrm.module.css";

export type ClientsPageViewProps = {
  readonly title: string;
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
  readonly clients: readonly AstrologerClientCrmListItem[];
  readonly selectedClientUserId: string | undefined;
  readonly isMobileDetailOpen: boolean;
  readonly selectedClient: AstrologerClientCrmDetail | null;
  readonly activityItems: readonly ClientCrmActivityItem[];
  readonly search: string;
  readonly lifecycle: ClientLifecycleStatus | undefined;
  readonly source: ClientRelationshipSource | undefined;
  readonly activeTab: ClientCrmTabId;
  readonly isListLoading: boolean;
  readonly isListError: boolean;
  readonly isListFetching: boolean;
  readonly isDetailLoading: boolean;
  readonly isDetailError: boolean;
  readonly isActivityLoading: boolean;
  readonly isActivityError: boolean;
  readonly isFiltered: boolean;
  readonly hasNextPage: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onLifecycleChange: (value: ClientLifecycleStatus | undefined) => void;
  readonly onSourceChange: (value: ClientRelationshipSource | undefined) => void;
  readonly onSelectClient: (clientUserId: string) => void;
  readonly onLoadMore: () => void;
  readonly onBackToList: () => void;
  readonly onTabChange: (tab: ClientCrmTabId) => void;
  readonly onRetryList: () => void;
  readonly onRetryDetail: () => void;
  readonly onRetryActivity: () => void;
};

export function ClientsPageView({
  title,
  copy,
  locale,
  clients,
  selectedClientUserId,
  isMobileDetailOpen,
  selectedClient,
  activityItems,
  search,
  lifecycle,
  source,
  activeTab,
  isListLoading,
  isListError,
  isListFetching,
  isDetailLoading,
  isDetailError,
  isActivityLoading,
  isActivityError,
  isFiltered,
  hasNextPage,
  onSearchChange,
  onLifecycleChange,
  onSourceChange,
  onSelectClient,
  onLoadMore,
  onBackToList,
  onTabChange,
  onRetryList,
  onRetryDetail,
  onRetryActivity
}: ClientsPageViewProps) {
  return (
    <section
      aria-labelledby="clients-page-title"
      className={styles.workspace}
      data-mobile-detail={isMobileDetailOpen ? "true" : "false"}
      data-testid="clients-crm-workspace"
    >
      <header className={styles.subhead}>
        <h1 className={styles.title} id="clients-page-title">
          {title}
          <span className={styles.count}>{clients.length}</span>
        </h1>
      </header>
      <div className={styles.body}>
        <ClientCrmListPanel
          copy={copy}
          items={clients}
          locale={locale}
          selectedClientUserId={selectedClientUserId}
          search={search}
          lifecycle={lifecycle}
          source={source}
          isLoading={isListLoading}
          isError={isListError}
          isFiltered={isFiltered}
          hasNextPage={hasNextPage}
          isFetching={isListFetching}
          onSearchChange={onSearchChange}
          onLifecycleChange={onLifecycleChange}
          onSourceChange={onSourceChange}
          onSelectClient={onSelectClient}
          onLoadMore={onLoadMore}
          onRetry={onRetryList}
        />
        <ClientCrmDetailPanel
          copy={copy}
          client={selectedClient}
          selectedClientUserId={selectedClientUserId}
          locale={locale}
          activeTab={activeTab}
          activityItems={activityItems}
          isDetailLoading={isDetailLoading}
          isDetailError={isDetailError}
          isActivityLoading={isActivityLoading}
          isActivityError={isActivityError}
          onTabChange={onTabChange}
          onBackToList={onBackToList}
          onRetryDetail={onRetryDetail}
          onRetryActivity={onRetryActivity}
        />
      </div>
    </section>
  );
}
