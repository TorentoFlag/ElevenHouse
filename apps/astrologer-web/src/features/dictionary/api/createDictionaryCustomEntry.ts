import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryAstrologerEntryResponseSchema,
  type CreateDictionaryCustomEntryRequest,
  type DictionaryAstrologerEntryResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createDictionaryCustomEntry(
  input: CreateDictionaryCustomEntryRequest
): Promise<DictionaryAstrologerEntryResponse> {
  const body = createDictionaryCustomEntryRequestSchema.parse(input);

  return dictionaryAstrologerEntryResponseSchema.parse(
    await application.http.post("/dictionary/custom-entries", body, { csrf: true })
  );
}
