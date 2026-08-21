import { useEffect, useMemo, useState } from "react";
import type {
  AstrologerClientCrmListItem,
  AstrologerClientCrmListQuery,
  ClientLifecycleStatus,
  ClientRelationshipSource
} from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useNavigate, useParams } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import {
  useClientsCrmActivityQuery,
  useClientsCrmDetailQuery,
  useClientsCrmListQuery,
  useCreateManualClientCrmClientMutation,
  useCreateClientRelatedBirthProfileMutation,
  useUpdateClientBirthDataMutation,
  useUpdateClientCrmPrivateProfileMutation,
  useUpdateClientRelatedBirthProfileMutation
} from "../../features/clients/model/clientsCrmQueries";
import type { ClientCrmTabId } from "../../features/clients/ui/ClientCrmTabs";
import type { ClientCrmListViewMode } from "../../features/clients/ui/ClientCrmListPanel";
import { ClientsPageView } from "./ClientsPageView";

const clientsCrmPageSize = 20;

export function ClientsPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const navigate = useNavigate();
  const { clientUserId } = useParams<{ clientUserId?: string }>();
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<ClientLifecycleStatus | undefined>(undefined);
  const [source, setSource] = useState<ClientRelationshipSource | undefined>(undefined);
  const [listViewMode, setListViewMode] = useState<ClientCrmListViewMode>("list");
  const [cursor, setCursor] = useState<string | null>(null);
  const [clients, setClients] = useState<readonly AstrologerClientCrmListItem[]>([]);
  const [activeTab, setActiveTab] = useState<ClientCrmTabId>("overview");
  const listQueryInput = useMemo<Partial<AstrologerClientCrmListQuery>>(
    () => ({
      query: search,
      lifecycle,
      source,
      cursor,
      limit: clientsCrmPageSize,
      sort: "last_linked_at_desc"
    }),
    [cursor, lifecycle, search, source]
  );
  const listQuery = useClientsCrmListQuery(listQueryInput);
  const selectedClientUserId = clientUserId ?? clients[0]?.clientUserId;
  const detailQuery = useClientsCrmDetailQuery(selectedClientUserId);
  const activityQuery = useClientsCrmActivityQuery(selectedClientUserId);
  const createManualClientMutation = useCreateManualClientCrmClientMutation();
  const privateProfileMutation = useUpdateClientCrmPrivateProfileMutation(selectedClientUserId);
  const birthDataMutation = useUpdateClientBirthDataMutation(selectedClientUserId);
  const createRelatedProfileMutation =
    useCreateClientRelatedBirthProfileMutation(selectedClientUserId);
  const updateRelatedProfileMutation =
    useUpdateClientRelatedBirthProfileMutation(selectedClientUserId);
  const isFiltered = search.trim().length > 0 || lifecycle !== undefined || source !== undefined;

  useDocumentTitle(dictionary.clients.documentTitle);

  useEffect(() => {
    if (!listQuery.data) {
      return;
    }

    setClients((current) =>
      cursor ? mergeClientPages(current, listQuery.data.items) : listQuery.data.items
    );
  }, [cursor, listQuery.data]);

  useEffect(() => {
    setActiveTab("overview");
  }, [selectedClientUserId]);

  const resetListPagination = () => {
    setClients([]);
    setCursor(null);
  };

  const handleSearchChange = (value: string) => {
    resetListPagination();
    setSearch(value);
  };

  const handleLifecycleChange = (value: ClientLifecycleStatus | undefined) => {
    resetListPagination();
    setLifecycle(value);
  };

  const handleSourceChange = (value: ClientRelationshipSource | undefined) => {
    resetListPagination();
    setSource(value);
  };

  return (
    <ClientsPageView
      title={dictionary.clients.title}
      copy={dictionary.clients.crm}
      locale={locale}
      clients={clients}
      selectedClientUserId={selectedClientUserId}
      isMobileDetailOpen={Boolean(clientUserId)}
      selectedClient={detailQuery.data?.client ?? null}
      activityItems={activityQuery.data?.items ?? []}
      search={search}
      lifecycle={lifecycle}
      source={source}
      listViewMode={listViewMode}
      activeTab={activeTab}
      isListLoading={listQuery.isLoading}
      isListError={listQuery.isError}
      isListFetching={listQuery.isFetching}
      isDetailLoading={detailQuery.isLoading}
      isDetailError={detailQuery.isError}
      isActivityLoading={activityQuery.isLoading}
      isActivityError={activityQuery.isError}
      isPrivateCrmSaving={privateProfileMutation.isPending}
      isPrivateCrmError={privateProfileMutation.isError}
      isBirthDataSaving={birthDataMutation.isPending}
      isBirthDataError={birthDataMutation.isError}
      isRelatedProfileSaving={
        createRelatedProfileMutation.isPending || updateRelatedProfileMutation.isPending
      }
      isRelatedProfileError={
        createRelatedProfileMutation.isError || updateRelatedProfileMutation.isError
      }
      isManualClientCreating={createManualClientMutation.isPending}
      isManualClientCreateError={createManualClientMutation.isError}
      isFiltered={isFiltered}
      hasNextPage={Boolean(listQuery.data?.nextCursor)}
      onSearchChange={handleSearchChange}
      onLifecycleChange={handleLifecycleChange}
      onSourceChange={handleSourceChange}
      onListViewModeChange={setListViewMode}
      onSelectClient={(nextClientUserId) => navigate(`/clients/${nextClientUserId}`)}
      onLoadMore={() => {
        if (listQuery.data?.nextCursor) {
          setCursor(listQuery.data.nextCursor);
        }
      }}
      onBackToList={() => navigate("/clients")}
      onTabChange={setActiveTab}
      onRetryList={() => void listQuery.refetch()}
      onRetryDetail={() => void detailQuery.refetch()}
      onRetryActivity={() => void activityQuery.refetch()}
      onCreateManualClient={async (input) => {
        const response = await createManualClientMutation.mutateAsync(input);
        resetListPagination();
        navigate(`/clients/${response.client.clientUserId}`);
      }}
      onSavePrivateCrm={(input) => privateProfileMutation.mutateAsync(input)}
      onSaveBirthData={(input) => birthDataMutation.mutateAsync(input)}
      onCreateRelatedProfile={(input) => createRelatedProfileMutation.mutateAsync(input)}
      onSaveRelatedProfile={(relatedProfileId, input) =>
        updateRelatedProfileMutation.mutateAsync({ relatedProfileId, input })
      }
    />
  );
}

function mergeClientPages(
  current: readonly AstrologerClientCrmListItem[],
  next: readonly AstrologerClientCrmListItem[]
): readonly AstrologerClientCrmListItem[] {
  const seen = new Set(current.map((client) => client.clientUserId));
  const merged = [...current];

  for (const client of next) {
    if (!seen.has(client.clientUserId)) {
      merged.push(client);
      seen.add(client.clientUserId);
    }
  }

  return merged;
}
