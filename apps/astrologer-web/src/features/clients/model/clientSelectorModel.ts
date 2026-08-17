import { keepPreviousData } from "@tanstack/react-query";
import type {
  AstrologerClientListQuery,
  AstrologerClientResponseItem,
  ClientBirthDataResponse,
  ClientRelatedBirthProfileResponse
} from "@elevenhouse/contracts";
import { listAstrologerClients } from "../api/clientsApi";

export type ClientSelectOption = {
  readonly value: string;
  readonly label: string;
  readonly initials: string;
  readonly subtitle: string;
  readonly birthDateDisplay: string;
  readonly hasBirthDate: boolean;
  readonly birthData: ClientBirthDataResponse | null;
  readonly relatedBirthProfiles?: readonly ClientRelatedBirthProfileResponse[];
};

export type ClientSearchComboboxKeyAction =
  | { readonly kind: "close" }
  | { readonly kind: "activate"; readonly clientId: string | null }
  | { readonly kind: "select"; readonly client: ClientSelectOption }
  | { readonly kind: "load-more" }
  | { readonly kind: "none" }
  | { readonly kind: "ignore" };

const defaultClientQuery = { query: "", limit: 100, offset: 0 } as const;
const defaultInfiniteClientQuery = { query: "", limit: 30 } as const;

export const astrologerClientsQueryKeys = {
  all: () => ["clients"] as const,
  list: (query: AstrologerClientListQuery) => ["clients", "list", query] as const,
  infinite: (query: Pick<AstrologerClientListQuery, "query" | "limit">) =>
    ["clients", "infinite", query] as const
};

export function astrologerClientListQueryOptions(
  query: Partial<AstrologerClientListQuery> = defaultClientQuery
) {
  const normalizedQuery = { ...defaultClientQuery, ...query };

  return {
    queryKey: astrologerClientsQueryKeys.list(normalizedQuery),
    queryFn: () => listAstrologerClients(normalizedQuery),
    placeholderData: keepPreviousData
  };
}

export function astrologerClientInfiniteQueryOptions(
  query: Partial<Pick<AstrologerClientListQuery, "query" | "limit">> = defaultInfiniteClientQuery
) {
  const normalizedQuery = { ...defaultInfiniteClientQuery, ...query };

  return {
    queryKey: astrologerClientsQueryKeys.infinite(normalizedQuery),
    initialPageParam: 0,
    queryFn: ({ pageParam }: { readonly pageParam: number }) =>
      listAstrologerClients({
        query: normalizedQuery.query,
        limit: normalizedQuery.limit,
        offset: pageParam
      }),
    getNextPageParam: (
      lastPage: Awaited<ReturnType<typeof listAstrologerClients>>,
      _pages: readonly Awaited<ReturnType<typeof listAstrologerClients>>[],
      lastPageParam: number
    ) => {
      const nextOffset = lastPageParam + normalizedQuery.limit;

      return nextOffset < lastPage.total ? nextOffset : undefined;
    }
  };
}

export function toClientSelectOptions(
  clients: readonly AstrologerClientResponseItem[]
): readonly ClientSelectOption[] {
  return clients.map((client) => {
    const birthDate = client.birthData?.birthDate ?? null;
    const birthDateDisplay = formatBirthDate(birthDate);
    const birthPlace = client.birthData?.birthPlaceText ?? client.birthData?.birthCity ?? null;
    const label = client.displayName?.trim() || `Клиент ${client.clientUserId.slice(0, 8)}`;

    return {
      value: client.clientUserId,
      label,
      initials: getClientInitials(label),
      subtitle:
        [birthDateDisplay || birthDate, birthPlace].filter(Boolean).join(" · ") ||
        "Дата рождения не заполнена",
      birthDateDisplay: birthDateDisplay || "—",
      hasBirthDate: Boolean(birthDate),
      birthData: client.birthData,
      relatedBirthProfiles: client.relatedBirthProfiles ?? []
    };
  });
}

export function findClientSelectOption(
  options: readonly ClientSelectOption[],
  value: string
): ClientSelectOption | null {
  return options.find((option) => option.value === value) ?? null;
}

export function getAvailableClientSelectOptions(input: {
  readonly options: readonly ClientSelectOption[];
  readonly excludeClientIds: readonly string[];
  readonly currentValue: string;
}): readonly ClientSelectOption[] {
  const excluded = new Set(
    input.excludeClientIds.filter((clientId) => clientId !== input.currentValue)
  );

  return input.options.filter((client) => !excluded.has(client.value));
}

export function getSelectableClientOptions(
  options: readonly ClientSelectOption[],
  requireBirthDate = true
): readonly ClientSelectOption[] {
  return requireBirthDate ? options.filter((client) => client.hasBirthDate) : options;
}

export function resolveSelectedClientOption(
  options: readonly ClientSelectOption[],
  value: string,
  selectedClient: ClientSelectOption | null
): ClientSelectOption | null {
  return (
    findClientSelectOption(options, value) ??
    (selectedClient?.value === value ? selectedClient : null)
  );
}

export function getNextActiveClientId(
  clients: readonly ClientSelectOption[],
  activeClientId: string | null,
  step: 1 | -1
): string | null {
  if (clients.length === 0) return null;
  const activeIndex = clients.findIndex((client) => client.value === activeClientId);
  if (activeIndex < 0) return clients[step === 1 ? 0 : clients.length - 1]!.value;
  const nextIndex = (activeIndex + step + clients.length) % clients.length;

  return clients[nextIndex]!.value;
}

export function getClientSearchComboboxKeyAction(input: {
  readonly key: string;
  readonly clients: readonly ClientSelectOption[];
  readonly activeClientId: string | null;
  readonly hasNextPage: boolean;
  readonly requireBirthDate?: boolean;
}): ClientSearchComboboxKeyAction {
  const enabledClients = getSelectableClientOptions(input.clients, input.requireBirthDate ?? true);
  if (input.key === "Escape") {
    return { kind: "close" };
  }
  if (input.key === "ArrowDown" || input.key === "ArrowUp") {
    return {
      kind: "activate",
      clientId: getNextActiveClientId(
        enabledClients,
        input.activeClientId,
        input.key === "ArrowDown" ? 1 : -1
      )
    };
  }
  if (input.key === "Enter") {
    const activeClient =
      enabledClients.find((client) => client.value === input.activeClientId) ?? enabledClients[0];
    if (activeClient) {
      return { kind: "select", client: activeClient };
    }
    if (input.hasNextPage) {
      return { kind: "load-more" };
    }
  }

  return input.key === "Enter" ? { kind: "none" } : { kind: "ignore" };
}

export function getClientInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "К";
}

export function formatBirthDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return "";

  return `${match[3]}.${match[2]}.${match[1]}`;
}
