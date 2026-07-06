import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDebounce } from "../../../common/hooks/useDebounce";
import {
  astrologerClientInfiniteQueryOptions,
  getAvailableClientSelectOptions,
  getSelectableClientOptions,
  resolveSelectedClientOption,
  type ClientSelectOption,
  toClientSelectOptions
} from "../model/clientSelectorModel";
import { ClientSearchComboboxView } from "./ClientSearchComboboxView";

export { ClientSearchComboboxView } from "./ClientSearchComboboxView";
export type { ClientSearchComboboxViewProps } from "./ClientSearchComboboxView";

export type ClientSearchComboboxProps = {
  readonly id?: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly selectedClient: ClientSelectOption | null;
  readonly excludeClientIds?: readonly string[];
  readonly disabled?: boolean;
  readonly onSelect: (client: ClientSelectOption) => void;
};

export function ClientSearchCombobox({
  id,
  label,
  value,
  placeholder = "Выберите клиента",
  selectedClient,
  excludeClientIds = [],
  disabled = false,
  onSelect
}: ClientSearchComboboxProps) {
  const generatedId = useId();
  const resolvedId = id ?? `client-picker-${generatedId.replace(/:/g, "")}`;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const query = useInfiniteQuery({
    ...astrologerClientInfiniteQueryOptions({ query: debouncedQuery, limit: 30 }),
    enabled: isOpen
  });
  const clients = useMemo(() => {
    return getAvailableClientSelectOptions({
      options: toClientSelectOptions(query.data?.pages.flatMap((page) => page.clients) ?? []),
      excludeClientIds,
      currentValue: value
    });
  }, [excludeClientIds, query.data?.pages, value]);
  const effectiveSelectedClient = resolveSelectedClientOption(clients, value, selectedClient);
  const loadMoreNodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveClientId(null);
      return;
    }
    setActiveClientId(
      (current) =>
        current ??
        effectiveSelectedClient?.value ??
        getSelectableClientOptions(clients)[0]?.value ??
        null
    );
  }, [clients, effectiveSelectedClient?.value, isOpen]);

  useEffect(() => {
    if (!isOpen || !query.hasNextPage || query.isFetchingNextPage) return;
    const node = loadMoreNodeRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void query.fetchNextPage();
      }
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [isOpen, query]);

  return (
    <ClientSearchComboboxView
      id={resolvedId}
      label={label}
      placeholder={placeholder}
      selectedClient={effectiveSelectedClient}
      clients={clients}
      searchQuery={searchQuery}
      isOpen={isOpen}
      isInitialLoading={query.isLoading}
      isSearching={query.isFetching && !query.isFetchingNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={Boolean(query.hasNextPage)}
      activeClientId={activeClientId}
      errorMessage={query.error instanceof Error ? "Не удалось загрузить клиентов" : null}
      disabled={disabled}
      loadMoreRef={(node) => {
        loadMoreNodeRef.current = node;
      }}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (nextOpen) {
          setSearchQuery("");
        }
      }}
      onSearchChange={setSearchQuery}
      onSelect={(client) => {
        onSelect(client);
        setIsOpen(false);
        setSearchQuery("");
      }}
      onActiveClientChange={setActiveClientId}
      onLoadMore={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
    />
  );
}
