import { keepPreviousData } from "@tanstack/react-query";
import type {
  AstrologerClientListQuery,
  AstrologerClientResponseItem,
  ClientBirthDataResponse
} from "@elevenhouse/contracts";
import { listAstrologerClients } from "../api/clientsApi";

export type ClientSelectOption = {
  readonly value: string;
  readonly label: string;
  readonly subtitle: string;
  readonly hasBirthDate: boolean;
  readonly birthData: ClientBirthDataResponse | null;
};

const defaultClientQuery = { query: "", limit: 100, offset: 0 } as const;

export const astrologerClientsQueryKeys = {
  all: () => ["clients"] as const,
  list: (query: AstrologerClientListQuery) => ["clients", "list", query] as const
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

export function toClientSelectOptions(
  clients: readonly AstrologerClientResponseItem[]
): readonly ClientSelectOption[] {
  return clients.map((client) => {
    const birthDate = client.birthData?.birthDate ?? null;
    const birthPlace = client.birthData?.birthPlaceText ?? client.birthData?.birthCity ?? null;

    return {
      value: client.clientUserId,
      label: client.displayName?.trim() || `Клиент ${client.clientUserId.slice(0, 8)}`,
      subtitle: [birthDate, birthPlace].filter(Boolean).join(" · ") || "Дата рождения не заполнена",
      hasBirthDate: Boolean(birthDate),
      birthData: client.birthData
    };
  });
}

export function findClientSelectOption(
  options: readonly ClientSelectOption[],
  value: string
): ClientSelectOption | null {
  return options.find((option) => option.value === value) ?? null;
}
