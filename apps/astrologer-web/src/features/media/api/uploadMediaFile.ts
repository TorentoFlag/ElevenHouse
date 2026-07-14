import {
  mediaMimeTypeSchema,
  type MediaAssetResponse,
  type MediaUploadPurpose
} from "@elevenhouse/contracts";
import { completeMediaUpload } from "./completeMediaUpload";
import { createMediaUploadIntent } from "./createMediaUploadIntent";

export type UploadMediaFileInput = {
  readonly purpose: MediaUploadPurpose;
  readonly file: File;
  readonly fetcher?: typeof fetch;
};

export async function uploadMediaFile(input: UploadMediaFileInput): Promise<MediaAssetResponse> {
  const uploadIntent = await createMediaUploadIntent({
    purpose: input.purpose,
    fileName: input.file.name.trim(),
    mimeType: mediaMimeTypeSchema.parse(input.file.type),
    sizeBytes: input.file.size
  });
  const response = await (input.fetcher ?? globalThis.fetch)(uploadIntent.upload.url, {
    method: uploadIntent.upload.method,
    headers: uploadIntent.upload.headers,
    body: input.file
  });

  if (!response.ok) {
    throw new Error(`Media object upload failed with status ${response.status}`);
  }

  return completeMediaUpload({
    mediaId: uploadIntent.mediaId,
    body: {}
  });
}
