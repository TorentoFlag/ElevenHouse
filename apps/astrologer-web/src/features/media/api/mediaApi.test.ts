import type { MediaAssetResponse, MediaUploadIntentResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { uploadMediaFile } from "./uploadMediaFile";

const mediaId = "33333333-3333-4333-8333-333333333333";
const uploadIntent = {
  mediaId,
  status: "uploading",
  upload: {
    method: "PUT",
    url: "http://localhost:9000/elevenhouse-local-media/product-cover.webp?signature=abc",
    headers: {
      "content-type": "image/webp"
    },
    expiresAt: "2026-07-04T10:15:00.000Z"
  }
} satisfies MediaUploadIntentResponse;
const mediaAsset = {
  id: mediaId,
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  purpose: "product_cover",
  status: "ready",
  visibility: "public",
  originalFileName: "product-cover.webp",
  mimeType: "image/webp",
  sizeBytes: 128000,
  width: 1600,
  height: 900,
  altText: null,
  url: "https://cdn.example/product-cover.webp",
  variants: [],
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:01.000Z"
} satisfies MediaAssetResponse;

describe("media API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a file through a backend-issued presigned target and completes the asset", async () => {
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(uploadIntent)
      .mockResolvedValueOnce(mediaAsset);
    const fetcher = vi.fn(async () => new Response(undefined, { status: 200 }));
    const file = new File(["image"], " product-cover.webp ", { type: "image/webp" });

    await expect(
      uploadMediaFile({
        purpose: "product_cover",
        file,
        fetcher
      })
    ).resolves.toEqual(mediaAsset);

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/media/upload-intents",
      {
        purpose: "product_cover",
        fileName: "product-cover.webp",
        mimeType: "image/webp",
        sizeBytes: file.size
      },
      { csrf: true }
    );
    expect(fetcher).toHaveBeenCalledWith(uploadIntent.upload.url, {
      method: "PUT",
      headers: uploadIntent.upload.headers,
      body: file
    });
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/media/${mediaId}/complete`,
      {},
      { csrf: true }
    );
  });

  it("rejects failed direct uploads before completing the media asset", async () => {
    vi.spyOn(application.http, "post").mockResolvedValueOnce(uploadIntent);
    const fetcher = vi.fn(async () => new Response("failed", { status: 403 }));
    const file = new File(["image"], "cover.webp", { type: "image/webp" });

    await expect(
      uploadMediaFile({
        purpose: "product_cover",
        file,
        fetcher
      })
    ).rejects.toThrow("Media object upload failed with status 403");
  });
});
