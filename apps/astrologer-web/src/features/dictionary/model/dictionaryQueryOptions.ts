import type {
  CreateDictionaryCustomEntryRequest,
  DictionaryEntriesQuery,
  ListDictionaryCategoriesQuery
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { createDictionaryCustomEntry } from "../api/createDictionaryCustomEntry";
import { deleteDictionaryEntry } from "../api/deleteDictionaryEntry";
import { listDictionaryCategories } from "../api/listDictionaryCategories";
import { listDictionaryEntries } from "../api/listDictionaryEntries";
import { resetDictionaryEntries } from "../api/resetDictionaryEntries";
import {
  updateDictionaryCustomEntry,
  type UpdateDictionaryCustomEntryInput
} from "../api/updateDictionaryCustomEntry";
import {
  updateDictionaryPlatformEntryOverride,
  type UpdateDictionaryPlatformEntryOverrideInput
} from "../api/updateDictionaryPlatformEntryOverride";
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

export function updateDictionaryCustomEntryMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: UpdateDictionaryCustomEntryInput) => updateDictionaryCustomEntry(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}

export function updateDictionaryPlatformEntryOverrideMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: UpdateDictionaryPlatformEntryOverrideInput) =>
      updateDictionaryPlatformEntryOverride(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}

export function resetDictionaryEntriesMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: () => resetDictionaryEntries(),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}

export function deleteDictionaryEntryMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (entryId: string) => deleteDictionaryEntry(entryId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}
