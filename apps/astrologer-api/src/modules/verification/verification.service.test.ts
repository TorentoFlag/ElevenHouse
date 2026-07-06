import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  MediaNotFoundError,
  type AstrologerVerificationApplication,
  type MediaAsset,
  type MediaAssetStore,
  type VerificationApplicationStore
} from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const identityMediaId = "33333333-3333-4333-8333-333333333333";
const qualificationMediaId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-06T10:00:00.000Z");

describe("VerificationService", () => {
  it("returns the current astrologer verification state with upload requirements", async () => {
    const service = createService(createStore({ latest: application }));

    await expect(service.getCurrentVerification(createAuthenticatedRequest())).resolves.toEqual({
      status: "pending",
      application: {
        id: application.id,
        ownerUserId,
        status: "pending",
        rejectionReason: null,
        submittedAt: now.toISOString(),
        reviewedAt: null,
        documents: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            applicationId: application.id,
            kind: "identity",
            mediaId: identityMediaId,
            originalFileName: "passport.pdf",
            mimeType: "application/pdf",
            sizeBytes: 500_000,
            createdAt: now.toISOString()
          }
        ],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      requirements: {
        maxQualificationDocuments: 5,
        allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
        maxSizeBytes: 20_000_000
      }
    });
  });

  it("submits a pending application after checking private verification media", async () => {
    const store = createStore();
    const mediaStore = createMediaStore();
    const service = createService(store, mediaStore);

    await expect(
      service.submitApplication(
        {
          identityDocumentMediaId: identityMediaId,
          qualificationDocumentMediaIds: [qualificationMediaId]
        },
        createAuthenticatedRequest()
      )
    ).resolves.toMatchObject({
      status: "pending",
      documents: [
        { kind: "identity", mediaId: identityMediaId },
        { kind: "qualification", mediaId: qualificationMediaId }
      ]
    });

    expect(mediaStore.findByOwnerAndId).toHaveBeenCalledWith({
      ownerUserId,
      mediaId: identityMediaId
    });
    expect(mediaStore.findByOwnerAndId).toHaveBeenCalledWith({
      ownerUserId,
      mediaId: qualificationMediaId
    });
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        documents: [
          expect.objectContaining({ kind: "identity", mediaId: identityMediaId }),
          expect.objectContaining({ kind: "qualification", mediaId: qualificationMediaId })
        ],
        now: now.toISOString()
      })
    );
  });

  it("maps invalid requests, unauthenticated requests and unusable media to HTTP errors", async () => {
    const service = createService(
      createStore(),
      createMediaStore({
        findByOwnerAndId: vi.fn(async () => {
          throw new MediaNotFoundError();
        })
      })
    );

    await expect(service.getCurrentVerification({ headers: {} })).rejects.toThrow(
      UnauthorizedException
    );
    await expect(
      service.submitApplication(
        {
          identityDocumentMediaId: "bad",
          qualificationDocumentMediaIds: [qualificationMediaId]
        },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.submitApplication(
        {
          identityDocumentMediaId: identityMediaId,
          qualificationDocumentMediaIds: [qualificationMediaId]
        },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);
  });
});

describe("VerificationController", () => {
  it("marks verification submission as CSRF-protected", () => {
    expect(
      Reflect.getMetadata(
        csrfRequiredMetadataKey,
        VerificationController.prototype.submitApplication
      )
    ).toBe(true);
  });
});

function createService(
  store: VerificationApplicationStore,
  mediaStore: MediaAssetStore = createMediaStore()
): VerificationService {
  return new VerificationService(store, mediaStore, createClock(), createIdGenerator());
}

function createClock(): SystemClock {
  return {
    now: () => now
  };
}

function createStore(
  input: { latest?: AstrologerVerificationApplication | null } = {}
): VerificationApplicationStore {
  let latest = input.latest ?? null;
  const store: VerificationApplicationStore = {
    findLatestByOwner: vi.fn(async () => latest),
    create: vi.fn(async (createInput: Parameters<VerificationApplicationStore["create"]>[0]) => {
      latest = {
        id: createInput.id,
        ownerUserId: createInput.ownerUserId,
        status: "pending",
        rejectionReason: null,
        submittedAt: createInput.now,
        reviewedAt: null,
        reviewerUserId: null,
        documents: createInput.documents.map((document) => ({
          id: document.id,
          applicationId: createInput.id,
          kind: document.kind,
          mediaId: document.mediaId,
          originalFileName: `${document.kind}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 500_000,
          createdAt: createInput.now
        })),
        createdAt: createInput.now,
        updatedAt: createInput.now
      };
      return latest;
    })
  };
  return store;
}

function createMediaStore(overrides: Partial<MediaAssetStore> = {}): MediaAssetStore {
  return {
    createUploadingAsset: vi.fn(async () => raise("Unexpected media create call")),
    findByOwnerAndId: vi.fn(async (input) => {
      if (input.mediaId === identityMediaId) {
        return createMediaAsset("verification_identity_document", identityMediaId);
      }
      if (input.mediaId === qualificationMediaId) {
        return createMediaAsset("verification_qualification_document", qualificationMediaId);
      }
      return null;
    }),
    markReady: vi.fn(async () => raise("Unexpected media ready call")),
    markFailed: vi.fn(async () => raise("Unexpected media failed call")),
    ...overrides
  };
}

function createMediaAsset(purpose: MediaAsset["purpose"], id: string): MediaAsset {
  return {
    id,
    ownerUserId,
    purpose,
    status: "ready",
    visibility: "private",
    storageBucket: "elevenhouse-media",
    storageKey: `${ownerUserId}/${purpose}/${id}/document.pdf`,
    originalFileName: "document.pdf",
    mimeType: "application/pdf",
    sizeBytes: 500_000,
    checksumSha256: null,
    width: null,
    height: null,
    altText: null,
    failureReason: null,
    variants: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createAuthenticatedRequest(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}

function createIdGenerator() {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666"
  ];
  return () => ids.shift() ?? "77777777-7777-4777-8777-777777777777";
}

function raise(message: string): never {
  throw new Error(message);
}

const application: AstrologerVerificationApplication = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId,
  status: "pending",
  rejectionReason: null,
  submittedAt: now.toISOString(),
  reviewedAt: null,
  reviewerUserId: null,
  documents: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      applicationId: "11111111-1111-4111-8111-111111111111",
      kind: "identity",
      mediaId: identityMediaId,
      originalFileName: "passport.pdf",
      mimeType: "application/pdf",
      sizeBytes: 500_000,
      createdAt: now.toISOString()
    }
  ],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};
