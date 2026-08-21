import type {
  AstrologerClientCrmListQuery,
  AstrologerClientCrmManualClientCreateRequest,
  ClientBirthDataUpsertRequest,
  ClientRelatedBirthProfileUpsertRequest
} from "@elevenhouse/contracts";
import { astrologerClientCrmListQuerySchema } from "@elevenhouse/contracts";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import {
  createManualClientCrmClient,
  getAstrologerClientCrmDetail,
  getAstrologerClientCrmFirstActivityPage,
  listAstrologerClientCrm,
  updateAstrologerClientCrmPrivateProfile
} from "../api/clientsCrmApi";
import {
  createClientRelatedBirthProfile,
  updateClientBirthData,
  updateClientRelatedBirthProfile
} from "../api/clientsApi";
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

export function updateClientBirthDataMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries" | "setQueryData">,
  clientUserId: string | undefined
) {
  return {
    mutationFn: (input: ClientBirthDataUpsertRequest) =>
      updateClientBirthData(clientUserId ?? "", input),
    onSuccess: (response: Awaited<ReturnType<typeof updateClientBirthData>>) => {
      queryClient.setQueryData<AstrologerClientCrmDetailResponse>(
        clientsCrmQueryKeys.detail(clientUserId),
        (current) =>
          current
            ? {
                client: {
                  ...current.client,
                  birthData: response.client.birthData,
                  readiness: {
                    ...current.client.readiness,
                    birthData: response.client.birthData ? "ready" : "missing"
                  }
                }
              }
            : current
      );
      return queryClient.invalidateQueries({ queryKey: ["clients", "crm", "list"] });
    }
  };
}

export function createClientRelatedBirthProfileMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries" | "setQueryData">,
  clientUserId: string | undefined
) {
  return {
    mutationFn: (input: ClientRelatedBirthProfileUpsertRequest) =>
      createClientRelatedBirthProfile(clientUserId ?? "", input),
    onSuccess: (profile: Awaited<ReturnType<typeof createClientRelatedBirthProfile>>) => {
      queryClient.setQueryData<AstrologerClientCrmDetailResponse>(
        clientsCrmQueryKeys.detail(clientUserId),
        (current) =>
          current
            ? {
                client: {
                  ...current.client,
                  relatedBirthProfiles: [...current.client.relatedBirthProfiles, profile],
                  readiness: { ...current.client.readiness, relatedProfiles: "ready" }
                }
              }
            : current
      );
      return queryClient.invalidateQueries({ queryKey: ["clients", "crm", "list"] });
    }
  };
}

export function updateClientRelatedBirthProfileMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries" | "setQueryData">,
  clientUserId: string | undefined
) {
  return {
    mutationFn: ({
      relatedProfileId,
      input
    }: {
      readonly relatedProfileId: string;
      readonly input: ClientRelatedBirthProfileUpsertRequest;
    }) => updateClientRelatedBirthProfile(clientUserId ?? "", relatedProfileId, input),
    onSuccess: (profile: Awaited<ReturnType<typeof updateClientRelatedBirthProfile>>) => {
      queryClient.setQueryData<AstrologerClientCrmDetailResponse>(
        clientsCrmQueryKeys.detail(clientUserId),
        (current) =>
          current
            ? {
                client: {
                  ...current.client,
                  relatedBirthProfiles: current.client.relatedBirthProfiles.map((item) =>
                    item.id === profile.id ? profile : item
                  )
                }
              }
            : current
      );
      return queryClient.invalidateQueries({ queryKey: ["clients", "crm", "list"] });
    }
  };
}

export function createManualClientCrmClientMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries" | "setQueryData">
) {
  return {
    mutationFn: (input: AstrologerClientCrmManualClientCreateRequest) =>
      createManualClientCrmClient(input),
    onSuccess: (response: Awaited<ReturnType<typeof createManualClientCrmClient>>) => {
      queryClient.setQueryData<AstrologerClientCrmDetailResponse>(
        clientsCrmQueryKeys.detail(response.client.clientUserId),
        response
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

export function useUpdateClientBirthDataMutation(clientUserId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation(updateClientBirthDataMutationOptions(queryClient, clientUserId));
}

export function useCreateClientRelatedBirthProfileMutation(clientUserId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation(createClientRelatedBirthProfileMutationOptions(queryClient, clientUserId));
}

export function useUpdateClientRelatedBirthProfileMutation(clientUserId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation(updateClientRelatedBirthProfileMutationOptions(queryClient, clientUserId));
}

export function useCreateManualClientCrmClientMutation() {
  const queryClient = useQueryClient();

  return useMutation(createManualClientCrmClientMutationOptions(queryClient));
}
