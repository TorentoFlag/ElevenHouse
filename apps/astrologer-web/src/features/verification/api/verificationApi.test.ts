import type {
  GetAstrologerVerificationResponse,
  VerificationApplicationResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { getCurrentAstrologerVerification } from "./getCurrentAstrologerVerification";
import { submitAstrologerVerificationApplication } from "./submitAstrologerVerificationApplication";

const verification = {
  status: "none",
  application: null,
  requirements: {
    maxQualificationDocuments: 5,
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxSizeBytes: 20_000_000
  }
} satisfies GetAstrologerVerificationResponse;

const applicationResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  status: "pending",
  rejectionReason: null,
  submittedAt: "2026-07-06T10:00:00.000Z",
  reviewedAt: null,
  documents: [],
  createdAt: "2026-07-06T10:00:00.000Z",
  updatedAt: "2026-07-06T10:00:00.000Z"
} satisfies VerificationApplicationResponse;

describe("verification API", () => {
  it("loads current astrologer verification state", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValueOnce(verification);

    await expect(getCurrentAstrologerVerification()).resolves.toEqual(verification);
    expect(get).toHaveBeenCalledWith("/verification/me");
  });

  it("submits verification applications with CSRF protection", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValueOnce(applicationResponse);

    await expect(
      submitAstrologerVerificationApplication({
        identityDocumentMediaId: "33333333-3333-4333-8333-333333333333",
        qualificationDocumentMediaIds: ["44444444-4444-4444-8444-444444444444"]
      })
    ).resolves.toEqual(applicationResponse);
    expect(post).toHaveBeenCalledWith(
      "/verification/applications",
      {
        identityDocumentMediaId: "33333333-3333-4333-8333-333333333333",
        qualificationDocumentMediaIds: ["44444444-4444-4444-8444-444444444444"]
      },
      { csrf: true }
    );
  });
});
