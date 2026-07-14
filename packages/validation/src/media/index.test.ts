import { describe, expect, it } from "vitest";
import {
  mediaImageMimeTypeValues,
  mediaPurposeUploadLimits,
  mediaPurposeValues,
  mediaUploadPurposeValues,
  mediaStatusValues,
  mediaVisibilityValues
} from "./index";

describe("media validation values", () => {
  it("defines the initial production media lifecycle vocabulary", () => {
    expect(mediaPurposeValues).toEqual([
      "product_cover",
      "profile_avatar",
      "profile_cover",
      "verification_identity_document",
      "verification_qualification_document",
      "matrix_report_pdf"
    ]);
    expect(mediaStatusValues).toEqual(["uploading", "processing", "ready", "failed", "deleted"]);
    expect(mediaVisibilityValues).toEqual(["public", "private"]);
    expect(mediaImageMimeTypeValues).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif"
    ]);
  });

  it("keeps generated Matrix reports out of the browser-upload vocabulary", () => {
    expect(mediaUploadPurposeValues).not.toContain("matrix_report_pdf");
    expect(mediaPurposeValues).toContain("matrix_report_pdf");
    expect(mediaPurposeUploadLimits).not.toHaveProperty("matrix_report_pdf");
  });

  it("keeps product cover uploads bounded to raster image files", () => {
    expect(mediaPurposeUploadLimits.product_cover).toEqual({
      maxSizeBytes: 15_000_000,
      allowedMimeTypes: mediaImageMimeTypeValues,
      visibility: "public"
    });
  });

  it("keeps verification documents private and bounded to image or PDF files", () => {
    expect(mediaPurposeUploadLimits.verification_identity_document).toEqual({
      maxSizeBytes: 20_000_000,
      allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
      visibility: "private"
    });
    expect(mediaPurposeUploadLimits.verification_qualification_document).toEqual({
      maxSizeBytes: 20_000_000,
      allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
      visibility: "private"
    });
  });
});
