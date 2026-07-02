import type {
  CreateDictionaryCustomEntryRequest,
  DictionaryEntriesQuery,
  ListDictionaryCategoriesQuery
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { createDictionaryCustomEntry } from "../api/createDictionaryCustomEntry";
import { listDictionaryCategories } from "../api/listDictionaryCategories";
import { listDictionaryEntries } from "../api/listDictionaryEntries";
import { dictionaryQueryKeys } from "./dictionaryQueryKeys";

export function dictionaryCategoriesQueryOptions(query: ListDictionaryCategoriesQuery) {
  return {
    queryKey: dictionaryQueryKeys.categories(query),
    queryFn: () => listDictionaryCategories(query)
  };
}

export function dictionaryEntriesQueryOptions(query: DictionaryEntriesQuery) {
  return {
    queryKey: dictionaryQueryKeys.entries(query),
    queryFn: () => listDictionaryEntries(query),
    placeholderData: keepPreviousData
  };
}

export function createDictionaryCustomEntryMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: CreateDictionaryCustomEntryRequest) => createDictionaryCustomEntry(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}
