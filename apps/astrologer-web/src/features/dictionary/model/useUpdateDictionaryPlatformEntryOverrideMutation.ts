import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { DictionaryAstrologerEntryResponse } from "@elevenhouse/contracts";
import type { UpdateDictionaryPlatformEntryOverrideInput } from "../api/updateDictionaryPlatformEntryOverride";
import { updateDictionaryPlatformEntryOverrideMutationOptions } from "./dictionaryQueryOptions";

export function useUpdateDictionaryPlatformEntryOverrideMutation(): UseMutationResult<
  DictionaryAstrologerEntryResponse,
  Error,
  UpdateDictionaryPlatformEntryOverrideInput
> {
  const queryClient = useQueryClient();

  return useMutation(updateDictionaryPlatformEntryOverrideMutationOptions(queryClient));
}
