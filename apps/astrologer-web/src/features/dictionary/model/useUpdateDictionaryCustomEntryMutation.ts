import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { DictionaryAstrologerEntryResponse } from "@elevenhouse/contracts";
import type { UpdateDictionaryCustomEntryInput } from "../api/updateDictionaryCustomEntry";
import { updateDictionaryCustomEntryMutationOptions } from "./dictionaryQueryOptions";

export function useUpdateDictionaryCustomEntryMutation(): UseMutationResult<
  DictionaryAstrologerEntryResponse,
  Error,
  UpdateDictionaryCustomEntryInput
> {
  const queryClient = useQueryClient();

  return useMutation(updateDictionaryCustomEntryMutationOptions(queryClient));
}
