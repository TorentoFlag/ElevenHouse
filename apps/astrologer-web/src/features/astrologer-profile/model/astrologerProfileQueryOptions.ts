import type {
  AstrologerProfileResponse,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { getCurrentAstrologerProfile } from "../api/getCurrentAstrologerProfile";
import { upsertCurrentAstrologerProfile } from "../api/upsertCurrentAstrologerProfile";

export const astrologerProfileQueryKeys = {
  all: () => ["astrologerProfile"] as const,
  current: () => ["astrologerProfile", "current"] as const
};

export function currentAstrologerProfileQueryOptions() {
  return {
    queryKey: astrologerProfileQueryKeys.current(),
    queryFn: () => getCurrentAstrologerProfile()
  };
}

export function upsertAstrologerProfileMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (body: UpsertAstrologerProfileRequest) => upsertCurrentAstrologerProfile(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: astrologerProfileQueryKeys.all() })
  };
}

export type AstrologerProfileMutationResult = AstrologerProfileResponse;
