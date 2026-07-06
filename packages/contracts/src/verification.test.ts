import { describe, expect, it } from "vitest";
import {
  getAstrologerVerificationResponseSchema,
  submitAstrologerVerificationRequestSchema,
  verificationApplicationResponseSchema
} from "./verification";

const applicationId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const qualificationMediaId = "44444444-4444-4444-8444-444444444444";
const now = "2026-07-06T10:00:00.000Z";

describe("verification contracts", () => {
  it("accepts a current verification response with pending documents", () => {
    expect(
      getAstrologerVerificationResponseSchema.parse({
        status: "pending",
        application: {
          id: applicationId,
          ownerUserId,
          status: "pending",
          rejectionReason: null,
          submittedAt: now,
          reviewedAt: null,
          documents: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              applicationId,
              kind: "identity",
              mediaId,
              originalFileName: "passport.pdf",
              mimeType: "application/pdf",
              sizeBytes: 500_000,
              createdAt: now
            },
            {
              id: "66666666-6666-4666-8666-666666666666",
              applicationId,
              kind: "qualification",
              mediaId: qualificationMediaId,
              originalFileName: "certificate.png",
              mimeType: "image/png",
              sizeBytes: 800_000,
              createdAt: now
            }
          ],
          createdAt: now,
          updatedAt: now
        },
        requirements: {
          maxQualificationDocuments: 5,
          allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
          maxSizeBytes: 20_000_000
        }
      })
    ).toMatchObject({
      status: "pending",
      application: {
        status: "pending",
        documents: [
          { kind: "identity", originalFileName: "passport.pdf" },
          { kind: "qualification", originalFileName: "certificate.png" }
        ]
      }
    });
  });

  it("normalizes submission payloads and rejects caller-controlled status", () => {
    expect(
      submitAstrologerVerificationRequestSchema.parse({
        identityDocumentMediaId: ` ${mediaId} `,
        qualificationDocumentMediaIds: [` ${qualificationMediaId} `]
      })
    ).toEqual({
      identityDocumentMediaId: mediaId,
      qualificationDocumentMediaIds: [qualificationMediaId]
    });

    expect(() =>
      submitAstrologerVerificationRequestSchema.parse({
        identityDocumentMediaId: mediaId,
        qualificationDocumentMediaIds: [qualificationMediaId],
        status: "approved"
      })
    ).toThrow();
  });

  it("requires exactly one identity document and one to five unique qualification documents", () => {
    expect(() =>
      submitAstrologerVerificationRequestSchema.parse({
        identityDocumentMediaId: mediaId,
        qualificationDocumentMediaIds: []
      })
    ).toThrow();

    expect(() =>
      submitAstrologerVerificationRequestSchema.parse({
        identityDocumentMediaId: mediaId,
        qualificationDocumentMediaIds: [
          qualificationMediaId,
          qualificationMediaId,
          "77777777-7777-4777-8777-777777777777",
          "88888888-8888-4888-8888-888888888888",
          "99999999-9999-4999-8999-999999999999",
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        ]
      })
    ).toThrow();
  });

  it("rejects workflow responses without a review reason for rejected applications", () => {
    expect(() =>
      verificationApplicationResponseSchema.parse({
        id: applicationId,
        ownerUserId,
        status: "rejected",
        rejectionReason: null,
        submittedAt: now,
        reviewedAt: now,
        documents: [],
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });
});
