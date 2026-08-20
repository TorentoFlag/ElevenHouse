import type { AstrologerClientCrmListQuery } from "@elevenhouse/contracts";
import { astrologerClientCrmListQuerySchema } from "@elevenhouse/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getAstrologerClientCrmDetail,
  getAstrologerClientCrmFirstActivityPage,
  listAstrologerClientCrm
} from "../api/clientsCrmApi";

export const clientsCrmQueryKeys = {
  all: () => ["clients", "crm"] as const,
  list: (query: Partial<AstrologerClientCrmListQuery> = {}) => [
    "clients",
    "crm",
    "list",
    astrologerClientCrmListQuerySchema.parse(query)
  ] as const,
  detail: (clientUserId: string | undefined) => ["clients", "crm", "detail", clientUserId] as const,
  activity: (clientUserId: string | undefined) =>
    ["clients", "crm", "activity", clientUserId] as const
};

export function clientsCrmListQueryOptions(query: Partial<AstrologerClientCrmListQuery> = {}) {
  const parsedQuery = astrologerClientCrmListQuerySchema.parse(query);

  return {
    queryKey: clientsCrmQueryKeys.list(parsedQuery),
    queryFn: () => listAstrologerClientCrm(parsedQuery),
    placeholderData: keepPreviousData
  };
}

export function clientsCrmDetailQueryOptions(clientUserId: string | undefined) {
  return {
    queryKey: clientsCrmQueryKeys.detail(clientUserId),
    queryFn: () => getAstrologerClientCrmDetail(clientUserId ?? ""),
    enabled: Boolean(clientUserId)
  };
}

export function clientsCrmActivityQueryOptions(clientUserId: string | undefined) {
  return {
    queryKey: clientsCrmQueryKeys.activity(clientUserId),
    queryFn: () => getAstrologerClientCrmFirstActivityPage(clientUserId ?? ""),
    enabled: Boolean(clientUserId)
  };
}

export function useClientsCrmListQuery(query: Partial<AstrologerClientCrmListQuery> = {}) {
  return useQuery(clientsCrmListQueryOptions(query));
}

export function useClientsCrmDetailQuery(clientUserId: string | undefined) {
  return useQuery(clientsCrmDetailQueryOptions(clientUserId));
}

export function useClientsCrmActivityQuery(clientUserId: string | undefined) {
  return useQuery(clientsCrmActivityQueryOptions(clientUserId));
}
