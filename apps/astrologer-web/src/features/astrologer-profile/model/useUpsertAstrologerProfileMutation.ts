import type {
  AstrologerProfileResponse,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { upsertAstrologerProfileMutationOptions } from "./astrologerProfileQueryOptions";

export function useUpsertAstrologerProfileMutation(): UseMutationResult<
  AstrologerProfileResponse,
  Error,
  UpsertAstrologerProfileRequest
> {
  const queryClient = useQueryClient();

  return useMutation(upsertAstrologerProfileMutationOptions(queryClient));
}
