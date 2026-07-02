import {
  createDictionaryAiDraftRequestSchema,
  createDictionaryAiDraftResponseSchema,
  type CreateDictionaryAiDraftRequest,
  type CreateDictionaryAiDraftResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createDictionaryAiDraft(
  input: CreateDictionaryAiDraftRequest
): Promise<CreateDictionaryAiDraftResponse> {
  const body = createDictionaryAiDraftRequestSchema.parse(input);

  return createDictionaryAiDraftResponseSchema.parse(
    await application.http.post("/dictionary/ai-draft", body, { csrf: true })
  );
}
