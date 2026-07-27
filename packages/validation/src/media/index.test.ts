import { describe, expect, it } from "vitest";
import {
  mediaAudioMimeTypeValues,
  mediaImageMimeTypeValues,
  mediaPurposeUploadLimits,
  mediaPurposeStorageLimits,
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
      "calculation_report_pdf",
      "messaging_attachment"
    ]);
    expect(mediaStatusValues).toEqual(["uploading", "processing", "ready", "failed", "deleted"]);
    expect(mediaVisibilityValues).toEqual(["public", "private"]);
    expect(mediaImageMimeTypeValues).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif"
    ]);
    expect(mediaAudioMimeTypeValues).toEqual(["audio/ogg", "audio/mpeg", "audio/mp4"]);
  });

  it("keeps generated worker media out of the browser-upload vocabulary", () => {
    expect(mediaUploadPurposeValues).not.toContain("calculation_report_pdf");
    expect(mediaUploadPurposeValues).not.toContain("messaging_attachment");
    expect(mediaPurposeValues).toContain("calculation_report_pdf");
    expect(mediaPurposeValues).toContain("messaging_attachment");
    expect(mediaPurposeValues).not.toContain("legacy_report_pdf");
    expect(mediaPurposeUploadLimits).not.toHaveProperty("calculation_report_pdf");
    expect(mediaPurposeUploadLimits).not.toHaveProperty("messaging_attachment");
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

  it("keeps messaging attachments private and bounded to expected audio files", () => {
    expect(mediaPurposeStorageLimits.messaging_attachment).toEqual({
      maxSizeBytes: 20_000_000,
      allowedMimeTypes: [...mediaAudioMimeTypeValues, ...mediaImageMimeTypeValues, "video/mp4"],
      visibility: "private"
    });
  });
});
