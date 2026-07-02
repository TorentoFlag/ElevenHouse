import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type {
  CreateDictionaryCustomEntryRequest,
  DictionaryAstrologerEntryResponse
} from "@elevenhouse/contracts";
import { createDictionaryCustomEntryMutationOptions } from "./dictionaryQueryOptions";

export function useCreateDictionaryCustomEntryMutation(): UseMutationResult<
  DictionaryAstrologerEntryResponse,
  Error,
  CreateDictionaryCustomEntryRequest
> {
  const queryClient = useQueryClient();

  return useMutation(createDictionaryCustomEntryMutationOptions(queryClient));
}
