import {
  dictionaryAstrologerEntryResponseSchema,
  dictionaryPlatformEntryIdParamSchema,
  updateDictionaryPlatformEntryOverrideRequestSchema,
  type DictionaryAstrologerEntryResponse,
  type UpdateDictionaryPlatformEntryOverrideRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateDictionaryPlatformEntryOverrideInput =
  UpdateDictionaryPlatformEntryOverrideRequest & {
    readonly platformEntryId: string;
  };

export async function updateDictionaryPlatformEntryOverride(
  input: UpdateDictionaryPlatformEntryOverrideInput
): Promise<DictionaryAstrologerEntryResponse> {
  const { platformEntryId } = dictionaryPlatformEntryIdParamSchema.parse({
    platformEntryId: input.platformEntryId
  });
  const body = updateDictionaryPlatformEntryOverrideRequestSchema.parse({
    title: input.title,
    content: input.content
  });

  return dictionaryAstrologerEntryResponseSchema.parse(
    await application.http.put(
      `/dictionary/platform-entries/${platformEntryId}/override`,
      body,
      { csrf: true }
    )
  );
}
