import {
  completeMediaUploadRequestSchema,
  mediaAssetResponseSchema,
  type CompleteMediaUploadRequest,
  type MediaAssetResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function completeMediaUpload(input: {
  readonly mediaId: string;
  readonly body?: CompleteMediaUploadRequest;
}): Promise<MediaAssetResponse> {
  const normalizedBody = completeMediaUploadRequestSchema.parse(input.body ?? {});

  return mediaAssetResponseSchema.parse(
    await application.http.post(`/media/${input.mediaId}/complete`, normalizedBody, { csrf: true })
  );
}
