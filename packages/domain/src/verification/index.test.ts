import { describe, expect, it } from "vitest";
import {
  getCurrentAstrologerVerification,
  submitAstrologerVerificationApplication,
  VerificationValidationError,
  type AstrologerVerificationApplication,
  type VerificationApplicationStore
} from "./index";

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const identityMediaId = "33333333-3333-4333-8333-333333333333";
const qualificationMediaId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-06T10:00:00.000Z");

describe("verification use cases", () => {
  it("returns none when an astrologer has not submitted verification", async () => {
    const store = createStore();

    await expect(getCurrentAstrologerVerification({ store, ownerUserId })).resolves.toEqual({
      status: "none",
      application: null
    });
  });

  it("creates a pending application with identity and qualification documents", async () => {
    const store = createStore();

    await expect(
      submitAstrologerVerificationApplication({
        store,
        ownerUserId,
        input: {
          identityDocumentMediaId: identityMediaId,
          qualificationDocumentMediaIds: [qualificationMediaId]
        },
        idGenerator: createSequentialIdGenerator(),
        now
      })
    ).resolves.toMatchObject({
      ownerUserId,
      status: "pending",
      documents: [
        { kind: "identity", mediaId: identityMediaId },
        { kind: "qualification", mediaId: qualificationMediaId }
      ]
    });

    await expect(getCurrentAstrologerVerification({ store, ownerUserId })).resolves.toMatchObject({
      status: "pending"
    });
  });

  it("rejects a second submission while the latest application is pending", async () => {
    const store = createStore({
      latest: createApplication({ status: "pending" })
    });

    await expect(
      submitAstrologerVerificationApplication({
        store,
        ownerUserId,
        input: {
          identityDocumentMediaId: identityMediaId,
          qualificationDocumentMediaIds: [qualificationMediaId]
        },
        idGenerator: createSequentialIdGenerator(),
        now
      })
    ).rejects.toBeInstanceOf(VerificationValidationError);
  });
});

function createStore(input: { latest?: AstrologerVerificationApplication | null } = {}) {
  let latest = input.latest ?? null;
  const store: VerificationApplicationStore = {
    findLatestByOwner: async () => latest,
    create: async (createInput) => {
      latest = {
        id: createInput.id,
        ownerUserId: createInput.ownerUserId,
        status: "pending",
        rejectionReason: null,
        submittedAt: createInput.now,
        reviewedAt: null,
        reviewerUserId: null,
        documents: createInput.documents.map((document) => ({
          ...document,
          id: `${document.kind}-document-id`,
          applicationId: createInput.id,
          originalFileName: `${document.kind}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 1000,
          createdAt: createInput.now
        })),
        createdAt: createInput.now,
        updatedAt: createInput.now
      };
      return latest;
    }
  };
  return store;
}

function createApplication(
  input: Pick<AstrologerVerificationApplication, "status">
): AstrologerVerificationApplication {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId,
    status: input.status,
    rejectionReason: input.status === "rejected" ? "Документ не читается" : null,
    submittedAt: now.toISOString(),
    reviewedAt: input.status === "pending" ? null : now.toISOString(),
    reviewerUserId: null,
    documents: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createSequentialIdGenerator() {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666"
  ];
  return () => ids.shift() ?? "77777777-7777-4777-8777-777777777777";
}
