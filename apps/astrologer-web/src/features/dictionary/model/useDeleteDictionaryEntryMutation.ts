import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { deleteDictionaryEntryMutationOptions } from "./dictionaryQueryOptions";

export function useDeleteDictionaryEntryMutation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation(deleteDictionaryEntryMutationOptions(queryClient));
}
