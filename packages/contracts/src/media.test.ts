import { describe, expect, it } from "vitest";

import { astroDiaryMediaUploadCompletionResponseSchema } from "./media";

describe("AstroDiary media contracts", () => {
  it("returns completion metadata without exposing a public media URL", () => {
    const parsed = astroDiaryMediaUploadCompletionResponseSchema.parse({
      mediaId: "00000000-0000-4000-8000-000000000001",
      status: "ready",
      purpose: "astro_diary_attachment",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      checksumSha256: null,
      width: null,
      height: null
    });

    expect(parsed).not.toHaveProperty("url");
  });
});
