import {
  dictionaryAstrologerEntryIdParamSchema,
  dictionaryAstrologerEntryResponseSchema,
  updateDictionaryCustomEntryRequestSchema,
  type DictionaryAstrologerEntryResponse,
  type UpdateDictionaryCustomEntryRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateDictionaryCustomEntryInput = UpdateDictionaryCustomEntryRequest & {
  readonly entryId: string;
};

export async function updateDictionaryCustomEntry(
  input: UpdateDictionaryCustomEntryInput
): Promise<DictionaryAstrologerEntryResponse> {
  const { entryId } = dictionaryAstrologerEntryIdParamSchema.parse({ entryId: input.entryId });
  const body = updateDictionaryCustomEntryRequestSchema.parse({
    categoryId: input.categoryId,
    title: input.title,
    content: input.content
  });

  return dictionaryAstrologerEntryResponseSchema.parse(
    await application.http.put(`/dictionary/custom-entries/${entryId}`, body, { csrf: true })
  );
}
