import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  MediaNotFoundError,
  MediaStorageObjectMissingError,
  type MediaAsset,
  type MediaAssetStore,
  type ObjectStoragePort
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MediaService } from "./media.service";
import type { MediaPublicUrlResolver } from "./media-response.mapper";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const mediaId = "463f34bb-38ec-4cb4-b105-2ed6de91e3cb";
const now = new Date("2026-07-04T10:00:00.000Z");

describe("MediaService", () => {
  it("creates upload intents for the current astrologer", async () => {
    const store = createStore();
    const storage = createStorage();
    const service = createService(store, storage);

    const response = await service.createUploadIntent(
      {
        purpose: "product_cover",
        fileName: "cover.webp",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      createAuthenticatedRequest()
    );

    expect(response).toEqual({
      mediaId,
      status: "uploading",
      upload: {
        method: "PUT",
        url: `http://localhost:9000/elevenhouse-local-media/${ownerUserId}/product_cover/${mediaId}/cover.webp`,
        headers: {
          "content-type": "image/webp"
        },
        expiresAt: "2026-07-04T10:15:00.000Z"
      }
    });
    expect(store.createUploadingAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mediaId,
        ownerUserId,
        purpose: "product_cover",
        storageBucket: "elevenhouse-local-media"
      })
    );
  });

  it("completes uploads and returns a renderable media asset", async () => {
    const store = createStore();
    const storage = createStorage();
    const service = createService(store, storage);
    await service.createUploadIntent(
      {
        purpose: "product_cover",
        fileName: "cover.webp",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      createAuthenticatedRequest()
    );

    const response = await service.completeUpload(
      mediaId,
      { checksumSha256: "a".repeat(64) },
      createAuthenticatedRequest()
    );

    expect(response).toMatchObject({
      id: mediaId,
      ownerUserId,
      purpose: "product_cover",
      status: "ready",
      url: `https://cdn.example/${ownerUserId}/product_cover/${mediaId}/cover.webp`,
      variants: []
    });
  });

  it("maps invalid input and missing session context to HTTP exceptions", async () => {
    const service = createService(createStore(), createStorage());

    await expect(
      service.createUploadIntent({ purpose: "product_cover" }, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.completeUpload("not-a-uuid", {}, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(service.createUploadIntent({}, { headers: {} })).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("maps domain media errors to HTTP exceptions", async () => {
    const service = createService(
      createStore({
        findByOwnerAndId: vi.fn(async () => {
          throw new MediaNotFoundError();
        })
      }),
      createStorage()
    );
    const missingObjectService = createService(createStore(), {
      ...createStorage(),
      readUploadedObjectMetadata: vi.fn(async () => {
        throw new MediaStorageObjectMissingError();
      })
    });
    await missingObjectService.createUploadIntent(
      {
        purpose: "product_cover",
        fileName: "cover.webp",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      createAuthenticatedRequest()
    );

    await expect(service.completeUpload(mediaId, {}, createAuthenticatedRequest())).rejects.toThrow(
      NotFoundException
    );
    await expect(
      missingObjectService.completeUpload(mediaId, {}, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
  });
});

function createService(store: MediaAssetStore, storage: ObjectStoragePort): MediaService {
  return new MediaService(store, storage, createPublicUrlResolver(), createClock(), () => mediaId);
}

function createClock(): SystemClock {
  return {
    now: () => now
  };
}

function createPublicUrlResolver(): MediaPublicUrlResolver {
  return {
    getPublicUrl: vi.fn((input) => `https://cdn.example/${input.storageKey}`)
  };
}

function createStorage(overrides: Partial<ObjectStoragePort> = {}): ObjectStoragePort {
  return {
    createPresignedUpload: vi.fn(async (input) => ({
      bucket: "elevenhouse-local-media",
      method: "PUT" as const,
      url: `http://localhost:9000/elevenhouse-local-media/${input.storageKey}`,
      headers: {
        "content-type": input.mimeType
      },
      expiresAt: "2026-07-04T10:15:00.000Z"
    })),
    readUploadedObjectMetadata: vi.fn(async () => ({
      sizeBytes: 1_250_000,
      mimeType: "image/webp",
      checksumSha256: "a".repeat(64),
      width: 1600,
      height: 900
    })),
    ...overrides
  };
}

function createStore(overrides: Partial<MediaAssetStore> = {}): MediaAssetStore {
  const assets = new Map<string, MediaAsset>();

  return {
    createUploadingAsset: vi.fn(async (input) => {
      const asset: MediaAsset = {
        id: input.id,
        ownerUserId: input.ownerUserId,
        purpose: input.purpose,
        status: "uploading",
        visibility: input.visibility,
        storageBucket: input.storageBucket,
        storageKey: input.storageKey,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksumSha256: null,
        width: null,
        height: null,
        altText: null,
        failureReason: null,
        variants: [],
        createdAt: input.now,
        updatedAt: input.now
      };
      assets.set(asset.id, asset);
      return asset;
    }),
    findByOwnerAndId: vi.fn(async (input) => {
      const asset = assets.get(input.mediaId);
      if (!asset || asset.ownerUserId !== input.ownerUserId) return null;
      return asset;
    }),
    markReady: vi.fn(async (input) => {
      const asset = assets.get(input.mediaId);
      if (!asset) return null;
      const next: MediaAsset = {
        ...asset,
        status: "ready",
        checksumSha256: input.checksumSha256,
        width: input.width,
        height: input.height,
        updatedAt: input.now
      };
      assets.set(next.id, next);
      return next;
    }),
    markFailed: vi.fn(async (input) => {
      const asset = assets.get(input.mediaId);
      if (!asset) return null;
      const next: MediaAsset = {
        ...asset,
        status: "failed",
        failureReason: input.reason,
        updatedAt: input.now
      };
      assets.set(next.id, next);
      return next;
    }),
    ...overrides
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
  } as AstrologerSessionRequest;
}
