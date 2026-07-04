import { describe, expect, it } from "vitest";
import {
  assertUsableMediaForOwner,
  completeMediaUpload,
  createMediaUploadIntent,
  MediaNotFoundError,
  MediaStorageObjectMissingError,
  MediaValidationError,
  type MediaAsset,
  type MediaAssetStore,
  type ObjectStoragePort
} from "./index";

const now = new Date("2026-07-04T10:00:00.000Z");
const ownerUserId = "550e8400-e29b-41d4-a716-446655440000";
const mediaId = "550e8400-e29b-41d4-a716-446655440010";

class InMemoryMediaStore implements MediaAssetStore {
  readonly assets = new Map<string, MediaAsset>();

  async createUploadingAsset(input: Parameters<MediaAssetStore["createUploadingAsset"]>[0]) {
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
    this.assets.set(asset.id, asset);
    return asset;
  }

  async findByOwnerAndId(input: Parameters<MediaAssetStore["findByOwnerAndId"]>[0]) {
    const asset = this.assets.get(input.mediaId);
    if (!asset || asset.ownerUserId !== input.ownerUserId) return null;
    return asset;
  }

  async markReady(input: Parameters<MediaAssetStore["markReady"]>[0]) {
    const current = this.assets.get(input.mediaId);
    if (!current) return null;
    const next: MediaAsset = {
      ...current,
      status: "ready",
      checksumSha256: input.checksumSha256 ?? current.checksumSha256,
      width: input.width ?? current.width,
      height: input.height ?? current.height,
      failureReason: null,
      updatedAt: input.now
    };
    this.assets.set(next.id, next);
    return next;
  }

  async markFailed(input: Parameters<MediaAssetStore["markFailed"]>[0]) {
    const current = this.assets.get(input.mediaId);
    if (!current) return null;
    const next: MediaAsset = {
      ...current,
      status: "failed",
      failureReason: input.reason,
      updatedAt: input.now
    };
    this.assets.set(next.id, next);
    return next;
  }
}

class FakeObjectStorage implements ObjectStoragePort {
  readonly uploads: Parameters<ObjectStoragePort["createPresignedUpload"]>[0][] = [];
  metadata: Awaited<ReturnType<ObjectStoragePort["readUploadedObjectMetadata"]>> = {
    sizeBytes: 1_250_000,
    mimeType: "image/webp",
    checksumSha256: "a".repeat(64),
    width: 1600,
    height: 900
  };

  async createPresignedUpload(input: Parameters<ObjectStoragePort["createPresignedUpload"]>[0]) {
    this.uploads.push(input);
    return {
      bucket: "elevenhouse-local-media",
      method: "PUT" as const,
      url: `http://localhost:9000/elevenhouse-local-media/${input.storageKey}`,
      headers: {
        "content-type": input.mimeType
      },
      expiresAt: "2026-07-04T10:15:00.000Z"
    };
  }

  async readUploadedObjectMetadata() {
    return this.metadata;
  }
}

describe("media use cases", () => {
  it("creates an uploading asset and returns a presigned PUT target", async () => {
    const store = new InMemoryMediaStore();
    const storage = new FakeObjectStorage();

    const result = await createMediaUploadIntent({
      store,
      storage,
      ownerUserId,
      input: {
        purpose: "product_cover",
        fileName: "  Натальный разбор.webp  ",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      idGenerator: () => mediaId,
      now
    });

    expect(result.mediaId).toBe(mediaId);
    expect(result.status).toBe("uploading");
    expect(result.upload.method).toBe("PUT");
    expect(result.upload.headers["content-type"]).toBe("image/webp");
    expect(storage.uploads[0]?.storageKey).toBe(
      `${ownerUserId}/product_cover/${mediaId}/natalnyj-razbor.webp`
    );
    expect(store.assets.get(mediaId)).toMatchObject({
      ownerUserId,
      purpose: "product_cover",
      status: "uploading",
      visibility: "public",
      originalFileName: "Натальный разбор.webp",
      storageBucket: "elevenhouse-local-media"
    });
  });

  it("rejects invalid files before creating storage objects", async () => {
    const store = new InMemoryMediaStore();
    const storage = new FakeObjectStorage();

    await expect(
      createMediaUploadIntent({
        store,
        storage,
        ownerUserId,
        input: {
          purpose: "product_cover",
          fileName: "cover.gif",
          mimeType: "image/gif",
          sizeBytes: 1_250_000
        },
        idGenerator: () => mediaId,
        now
      })
    ).rejects.toBeInstanceOf(MediaValidationError);

    expect(storage.uploads).toHaveLength(0);
    expect(store.assets.size).toBe(0);
  });

  it("marks an uploaded asset ready after storage metadata matches the intent", async () => {
    const store = new InMemoryMediaStore();
    const storage = new FakeObjectStorage();
    await createMediaUploadIntent({
      store,
      storage,
      ownerUserId,
      input: {
        purpose: "product_cover",
        fileName: "cover.webp",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      idGenerator: () => mediaId,
      now
    });

    const asset = await completeMediaUpload({
      store,
      storage,
      ownerUserId,
      mediaId,
      input: { checksumSha256: "a".repeat(64) },
      now: new Date("2026-07-04T10:02:00.000Z")
    });

    expect(asset).toMatchObject({
      id: mediaId,
      status: "ready",
      checksumSha256: "a".repeat(64),
      width: 1600,
      height: 900,
      updatedAt: "2026-07-04T10:02:00.000Z"
    });
  });

  it("fails completion when the uploaded object is missing", async () => {
    const store = new InMemoryMediaStore();
    const storage = new FakeObjectStorage();
    storage.metadata = null;
    await createMediaUploadIntent({
      store,
      storage,
      ownerUserId,
      input: {
        purpose: "product_cover",
        fileName: "cover.webp",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      idGenerator: () => mediaId,
      now
    });

    await expect(
      completeMediaUpload({
        store,
        storage,
        ownerUserId,
        mediaId,
        input: {},
        now: new Date("2026-07-04T10:02:00.000Z")
      })
    ).rejects.toBeInstanceOf(MediaStorageObjectMissingError);

    expect(store.assets.get(mediaId)?.status).toBe("failed");
  });

  it("allows product flows to use only ready assets owned by the astrologer for that purpose", async () => {
    const store = new InMemoryMediaStore();
    const storage = new FakeObjectStorage();
    await createMediaUploadIntent({
      store,
      storage,
      ownerUserId,
      input: {
        purpose: "product_cover",
        fileName: "cover.webp",
        mimeType: "image/webp",
        sizeBytes: 1_250_000
      },
      idGenerator: () => mediaId,
      now
    });

    await expect(
      assertUsableMediaForOwner({
        store,
        ownerUserId,
        mediaId,
        purpose: "product_cover"
      })
    ).rejects.toBeInstanceOf(MediaValidationError);

    await completeMediaUpload({
      store,
      storage,
      ownerUserId,
      mediaId,
      input: { checksumSha256: "a".repeat(64) },
      now: new Date("2026-07-04T10:02:00.000Z")
    });

    await expect(
      assertUsableMediaForOwner({
        store,
        ownerUserId: "550e8400-e29b-41d4-a716-446655440099",
        mediaId,
        purpose: "product_cover"
      })
    ).rejects.toBeInstanceOf(MediaNotFoundError);

    await expect(
      assertUsableMediaForOwner({
        store,
        ownerUserId,
        mediaId,
        purpose: "profile_avatar"
      })
    ).rejects.toBeInstanceOf(MediaValidationError);

    await expect(
      assertUsableMediaForOwner({
        store,
        ownerUserId,
        mediaId,
        purpose: "product_cover"
      })
    ).resolves.toMatchObject({ id: mediaId, status: "ready" });
  });
});
