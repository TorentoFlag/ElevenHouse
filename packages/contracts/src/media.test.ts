import { describe, expect, it } from "vitest";
import {
  completeMediaUploadRequestSchema,
  createMediaUploadIntentRequestSchema,
  mediaAssetResponseSchema,
  mediaUploadIntentResponseSchema
} from "./media";

const mediaId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const now = "2026-07-04T12:00:00.000Z";

describe("media contracts", () => {
  it("accepts product cover upload intents with bounded image metadata", () => {
    expect(
      createMediaUploadIntentRequestSchema.parse({
        purpose: "product_cover",
        fileName: " Astro Cartography Cover.JPG ",
        mimeType: "image/jpeg",
        sizeBytes: 1_250_000
      })
    ).toEqual({
      purpose: "product_cover",
      fileName: "Astro Cartography Cover.JPG",
      mimeType: "image/jpeg",
      sizeBytes: 1_250_000
    });
  });

  it("rejects unsupported upload purposes, mime types and oversized files", () => {
    expect(() =>
      createMediaUploadIntentRequestSchema.parse({
        purpose: "session_recording",
        fileName: "recording.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1_000_000
      })
    ).toThrow();

    expect(() =>
      createMediaUploadIntentRequestSchema.parse({
        purpose: "product_cover",
        fileName: "cover.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 10_000
      })
    ).toThrow();

    expect(() =>
      createMediaUploadIntentRequestSchema.parse({
        purpose: "product_cover",
        fileName: "cover.png",
        mimeType: "image/png",
        sizeBytes: 15_000_001
      })
    ).toThrow();
  });

  it("accepts private verification document upload intents for PDF files", () => {
    expect(
      createMediaUploadIntentRequestSchema.parse({
        purpose: "verification_identity_document",
        fileName: " passport.pdf ",
        mimeType: "application/pdf",
        sizeBytes: 900_000
      })
    ).toEqual({
      purpose: "verification_identity_document",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      sizeBytes: 900_000
    });
  });

  it("rejects direct browser uploads for generated calculation report artifacts", () => {
    expect(() =>
      createMediaUploadIntentRequestSchema.parse({
        purpose: "calculation_report_pdf",
        fileName: "calculation.pdf",
        mimeType: "application/pdf",
        sizeBytes: 900_000
      })
    ).toThrow();
  });

  it("describes a direct browser upload target without exposing storage secrets", () => {
    expect(
      mediaUploadIntentResponseSchema.parse({
        mediaId,
        status: "uploading",
        upload: {
          method: "PUT",
          url: "http://localhost:9000/elevenhouse-media/products/cover.jpg?signature=abc",
          headers: {
            "content-type": "image/jpeg"
          },
          expiresAt: now
        }
      })
    ).toEqual({
      mediaId,
      status: "uploading",
      upload: {
        method: "PUT",
        url: "http://localhost:9000/elevenhouse-media/products/cover.jpg?signature=abc",
        headers: {
          "content-type": "image/jpeg"
        },
        expiresAt: now
      }
    });
  });

  it("accepts a completion command with optional checksum", () => {
    expect(
      completeMediaUploadRequestSchema.parse({
        checksumSha256: "a".repeat(64)
      })
    ).toEqual({
      checksumSha256: "a".repeat(64)
    });

    expect(completeMediaUploadRequestSchema.parse({})).toEqual({});
    expect(() => completeMediaUploadRequestSchema.parse({ checksumSha256: "short" })).toThrow();
  });

  it("returns media assets with renderable variants", () => {
    expect(
      mediaAssetResponseSchema.parse({
        id: mediaId,
        ownerUserId,
        purpose: "product_cover",
        status: "ready",
        visibility: "public",
        originalFileName: "cover.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1_250_000,
        width: 1600,
        height: 900,
        altText: "Обложка продукта",
        url: "https://cdn.example/media/original.jpg",
        variants: [
          {
            variant: "card",
            url: "https://cdn.example/media/card.webp",
            mimeType: "image/webp",
            width: 960,
            height: 540,
            sizeBytes: 180_000
          }
        ],
        createdAt: now,
        updatedAt: now
      })
    ).toMatchObject({
      id: mediaId,
      purpose: "product_cover",
      status: "ready",
      url: "https://cdn.example/media/original.jpg",
      variants: [
        {
          variant: "card",
          url: "https://cdn.example/media/card.webp"
        }
      ]
    });
  });
});
