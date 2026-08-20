import type { AstrologerClientCrmListQuery } from "@elevenhouse/contracts";
import { astrologerClientCrmListQuerySchema } from "@elevenhouse/contracts";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import {
  getAstrologerClientCrmDetail,
  getAstrologerClientCrmFirstActivityPage,
  listAstrologerClientCrm,
  updateAstrologerClientCrmPrivateProfile
} from "../api/clientsCrmApi";
import type {
  AstrologerClientCrmDetailResponse,
  AstrologerClientCrmPrivateProfileUpdateRequest
} from "@elevenhouse/contracts";

export const clientsCrmQueryKeys = {
  all: () => ["clients", "crm"] as const,
  list: (query: Partial<AstrologerClientCrmListQuery> = {}) =>
    ["clients", "crm", "list", astrologerClientCrmListQuerySchema.parse(query)] as const,
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

export function updateClientCrmPrivateProfileMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries" | "setQueryData">,
  clientUserId: string | undefined
) {
  return {
    mutationFn: (input: AstrologerClientCrmPrivateProfileUpdateRequest) =>
      updateAstrologerClientCrmPrivateProfile(clientUserId ?? "", input),
    onSuccess: (response: Awaited<ReturnType<typeof updateAstrologerClientCrmPrivateProfile>>) => {
      queryClient.setQueryData<AstrologerClientCrmDetailResponse>(
        clientsCrmQueryKeys.detail(clientUserId),
        (current) =>
          current ? { client: { ...current.client, privateCrm: response.privateCrm } } : current
      );
      return queryClient.invalidateQueries({ queryKey: ["clients", "crm", "list"] });
    }
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

export function useUpdateClientCrmPrivateProfileMutation(clientUserId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation(updateClientCrmPrivateProfileMutationOptions(queryClient, clientUserId));
}
