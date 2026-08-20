import { describe, expect, it } from "vitest";

import {
  AstroDiaryMediaAuthorizationError,
  completeAstroDiaryPrivateMediaUpload,
  createAstroDiaryPrivateMediaUploadIntent,
  type AstroDiaryMediaUploadStore
} from "./astro-diary-media-upload";
import type { ObjectStoragePort } from "../media";

const context = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  relationship: {
    id: "00000000-0000-4000-8000-000000000002",
    clientUserId: "00000000-0000-4000-8000-000000000001",
    astrologerUserId: "00000000-0000-4000-8000-000000000003",
    state: "active" as const
  },
  journal: {
    id: "00000000-0000-4000-8000-000000000004",
    relationshipId: "00000000-0000-4000-8000-000000000002",
    clientUserId: "00000000-0000-4000-8000-000000000001",
    astrologerUserId: "00000000-0000-4000-8000-000000000003",
    state: "active" as const
  }
};

describe("AstroDiary private media upload", () => {
  it("creates a private journal-scoped upload authority together with the generic asset", async () => {
    const store = createStore();
    const storage = createStorage();

    const intent = await createAstroDiaryPrivateMediaUploadIntent({
      store,
      storage,
      authority: context,
      ownerUserId: context.actorUserId,
      input: {
        purpose: "astro_diary_attachment",
        fileName: "Дневник.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024
      },
      idGenerator: () => "00000000-0000-4000-8000-000000000005",
      now: new Date("2026-08-20T10:00:00.000Z")
    });

    expect(intent).toEqual({
      mediaId: "00000000-0000-4000-8000-000000000005",
      status: "uploading",
      upload: {
        method: "PUT",
        url: "https://storage.example/upload",
        headers: { "content-type": "application/pdf" },
        expiresAt: "2026-08-20T10:15:00.000Z"
      }
    });
    expect(store.created).toMatchObject({
      mediaId: "00000000-0000-4000-8000-000000000005",
      journalId: context.journal.id,
      ownerUserId: context.actorUserId,
      purpose: "astro_diary_attachment",
      visibility: "private",
      storageBucket: "private-diary",
      originalFileName: "Дневник.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      now: "2026-08-20T10:00:00.000Z"
    });
    expect(store.created?.storageKey).toBe(
      "astro-diary/00000000-0000-4000-8000-000000000004/00000000-0000-4000-8000-000000000001/astro_diary_attachment/00000000-0000-4000-8000-000000000005/dnevnik.pdf"
    );
  });

  it("rejects upload when the actor is not the owner participant", async () => {
    await expect(
      createAstroDiaryPrivateMediaUploadIntent({
        store: createStore(),
        storage: createStorage(),
        authority: context,
        ownerUserId: "00000000-0000-4000-8000-000000000003",
        input: {
          purpose: "astro_diary_attachment",
          fileName: "entry.png",
          mimeType: "image/png",
          sizeBytes: 1024
        },
        idGenerator: () => "00000000-0000-4000-8000-000000000005",
        now: new Date("2026-08-20T10:00:00.000Z")
      })
    ).rejects.toMatchObject({
      code: "ASTRO_DIARY_MEDIA_AUTHORIZATION_DENIED",
      reason: "media_owner_conflict"
    });
  });

  it("completes only the pending private journal authority and marks both records ready", async () => {
    const store = createStore();
    store.pending = {
      asset: {
        id: "00000000-0000-4000-8000-000000000005",
        ownerUserId: context.actorUserId,
        purpose: "astro_diary_attachment",
        status: "uploading",
        visibility: "private",
        storageBucket: "private-diary",
        storageKey: "astro-diary/file.pdf",
        originalFileName: "file.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        checksumSha256: null,
        width: null,
        height: null,
        altText: null,
        failureReason: null,
        variants: [],
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z"
      },
      media: {
        id: "00000000-0000-4000-8000-000000000005",
        ownerUserId: context.actorUserId,
        journalId: context.journal.id,
        purpose: "astro_diary_attachment",
        visibility: "private",
        status: "uploading",
        boundItemId: null,
        accessRevoked: false
      }
    };

    const completed = await completeAstroDiaryPrivateMediaUpload({
      store,
      storage: createStorage(),
      authority: context,
      ownerUserId: context.actorUserId,
      mediaId: "00000000-0000-4000-8000-000000000005",
      input: {
        checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      },
      now: new Date("2026-08-20T10:02:00.000Z")
    });

    expect(completed.status).toBe("ready");
    expect(store.ready).toMatchObject({
      mediaId: "00000000-0000-4000-8000-000000000005",
      checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      now: "2026-08-20T10:02:00.000Z"
    });
  });

  it("fails and records failed state when the private object is missing", async () => {
    const store = createStore();
    store.pending = {
      asset: {
        id: "00000000-0000-4000-8000-000000000005",
        ownerUserId: context.actorUserId,
        purpose: "astro_diary_voice",
        status: "uploading",
        visibility: "private",
        storageBucket: "private-diary",
        storageKey: "astro-diary/voice.ogg",
        originalFileName: "voice.ogg",
        mimeType: "audio/ogg",
        sizeBytes: 1024,
        checksumSha256: null,
        width: null,
        height: null,
        altText: null,
        failureReason: null,
        variants: [],
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z"
      },
      media: {
        id: "00000000-0000-4000-8000-000000000005",
        ownerUserId: context.actorUserId,
        journalId: context.journal.id,
        purpose: "astro_diary_voice",
        visibility: "private",
        status: "uploading",
        boundItemId: null,
        accessRevoked: false
      }
    };

    await expect(
      completeAstroDiaryPrivateMediaUpload({
        store,
        storage: createStorage({ missing: true }),
        authority: context,
        ownerUserId: context.actorUserId,
        mediaId: "00000000-0000-4000-8000-000000000005",
        input: {},
        now: new Date("2026-08-20T10:02:00.000Z")
      })
    ).rejects.toThrow("Uploaded media object is missing");

    expect(store.failed).toEqual({
      mediaId: "00000000-0000-4000-8000-000000000005",
      reason: "Uploaded object is missing",
      now: "2026-08-20T10:02:00.000Z"
    });
  });
});

function createStorage(options: { missing?: boolean } = {}): ObjectStoragePort {
  return {
    createPresignedUpload: async () => ({
      bucket: "private-diary",
      method: "PUT",
      url: "https://storage.example/upload",
      headers: { "content-type": "application/pdf" },
      expiresAt: "2026-08-20T10:15:00.000Z"
    }),
    readUploadedObjectMetadata: async () =>
      options.missing
        ? null
        : {
            sizeBytes: 1024,
            mimeType: "application/pdf",
            checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            width: null,
            height: null
          }
  };
}

function createStore(): AstroDiaryMediaUploadStore & {
  created: Parameters<AstroDiaryMediaUploadStore["createPendingUpload"]>[0] | null;
  pending: Awaited<ReturnType<AstroDiaryMediaUploadStore["findPendingUpload"]>> | null;
  ready: Parameters<AstroDiaryMediaUploadStore["markReady"]>[0] | null;
  failed: Parameters<AstroDiaryMediaUploadStore["markFailed"]>[0] | null;
} {
  return {
    created: null,
    pending: null,
    ready: null,
    failed: null,
    createPendingUpload: async function (input) {
      this.created = input;
    },
    findPendingUpload: async function () {
      return this.pending;
    },
    markReady: async function (input) {
      this.ready = input;
      if (!this.pending) return null;
      return {
        ...this.pending.asset,
        status: "ready",
        checksumSha256: input.checksumSha256,
        width: input.width,
        height: input.height,
        updatedAt: input.now
      };
    },
    markFailed: async function (input) {
      this.failed = input;
    }
  };
}

expect(new AstroDiaryMediaAuthorizationError("relationship_denied")).toBeInstanceOf(Error);
