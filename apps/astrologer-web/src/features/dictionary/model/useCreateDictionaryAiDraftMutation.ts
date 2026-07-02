import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type {
  CreateDictionaryAiDraftRequest,
  CreateDictionaryAiDraftResponse
} from "@elevenhouse/contracts";
import { createDictionaryAiDraft } from "../api/createDictionaryAiDraft";

export function useCreateDictionaryAiDraftMutation(): UseMutationResult<
  CreateDictionaryAiDraftResponse,
  Error,
  CreateDictionaryAiDraftRequest
> {
  return useMutation({ mutationFn: createDictionaryAiDraft });
}
