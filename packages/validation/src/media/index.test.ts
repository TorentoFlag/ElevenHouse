import { describe, expect, it } from "vitest";
import {
  mediaImageMimeTypeValues,
  mediaPurposeUploadLimits,
  mediaPurposeValues,
  mediaStatusValues,
  mediaVisibilityValues
} from "./index";

describe("media validation values", () => {
  it("defines the initial production media lifecycle vocabulary", () => {
    expect(mediaPurposeValues).toEqual(["product_cover", "profile_avatar", "profile_cover"]);
    expect(mediaStatusValues).toEqual(["uploading", "processing", "ready", "failed", "deleted"]);
    expect(mediaVisibilityValues).toEqual(["public", "private"]);
    expect(mediaImageMimeTypeValues).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif"
    ]);
  });

  it("keeps product cover uploads bounded to raster image files", () => {
    expect(mediaPurposeUploadLimits.product_cover).toEqual({
      maxSizeBytes: 15_000_000,
      allowedMimeTypes: mediaImageMimeTypeValues,
      visibility: "public"
    });
  });
});
