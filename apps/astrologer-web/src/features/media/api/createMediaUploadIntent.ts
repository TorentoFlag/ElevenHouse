import {
  createMediaUploadIntentRequestSchema,
  mediaUploadIntentResponseSchema,
  type CreateMediaUploadIntentRequest,
  type MediaUploadIntentResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createMediaUploadIntent(
  body: CreateMediaUploadIntentRequest
): Promise<MediaUploadIntentResponse> {
  const normalizedBody = createMediaUploadIntentRequestSchema.parse(body);

  return mediaUploadIntentResponseSchema.parse(
    await application.http.post("/media/upload-intents", normalizedBody, { csrf: true })
  );
}
