import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { resetDictionaryEntriesMutationOptions } from "./dictionaryQueryOptions";

export function useResetDictionaryEntriesMutation(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation(resetDictionaryEntriesMutationOptions(queryClient));
}
