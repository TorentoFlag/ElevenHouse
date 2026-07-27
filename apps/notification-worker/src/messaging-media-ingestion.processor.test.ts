import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrivateObjectStorageWriterPort } from "@elevenhouse/domain";
import { processMessagingMediaIngestionJob } from "./messaging-media-ingestion.processor";
import type { MessagingMediaIngestionJobData } from "./messaging-media-ingestion.queue";
import type {
  MessagingMediaIngestionProcessingStore,
  TelegramBusinessMediaProvider
} from "./messaging-media-ingestion.types";

const now = new Date("2026-07-27T08:00:00.000Z");
const ingestionId = "8e14390f-3db1-4d1c-9344-55679c778427";
const mediaAssetId = "463f34bb-38ec-4cb4-b105-2ed6de91e3cb";

describe("processMessagingMediaIngestionJob", () => {
  it("stores valid Telegram OGG voice bytes as a private messaging attachment", async () => {
    const bytes = new Uint8Array([79, 103, 103, 83, 0, 2, 1, 2]);
    const store = createStore();
    const provider = createProvider({ bytes, mimeType: "audio/ogg" });
    const storage = createStorage();

    await processMessagingMediaIngestionJob({
      job: createJob(),
      store,
      provider,
      storage,
      privateStorageBucket: "elevenhouse-local-private",
      maxBytes: 20_000_000,
      mediaAssetIdGenerator: () => mediaAssetId,
      now
    });

    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(storage.putPrivateObject).toHaveBeenCalledWith({
      storageBucket: "elevenhouse-local-private",
      storageKey: `22222222-2222-4222-8222-222222222222/messaging_attachment/${mediaAssetId}/telegram-voice.ogg`,
      body: bytes,
      mimeType: "audio/ogg",
      checksumSha256
    });
    expect(store.markReady).toHaveBeenCalledWith({
      ingestionId,
      messageId: "message_1",
      mediaAssetId,
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      storageBucket: "elevenhouse-local-private",
      storageKey: `22222222-2222-4222-8222-222222222222/messaging_attachment/${mediaAssetId}/telegram-voice.ogg`,
      originalFileName: "telegram-voice.ogg",
      mimeType: "audio/ogg",
      sizeBytes: bytes.byteLength,
      checksumSha256,
      width: null,
      height: null,
      now
    });
  });

  it("stores Telegram image bytes with image metadata", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const store = createStore({
      workItem: {
        ...workItem(),
        kind: "image",
        providerFileId: "image-file-id",
        providerMimeType: null,
        providerSizeBytes: bytes.byteLength,
        durationSeconds: null,
        width: 1280,
        height: 720
      }
    });
    const provider = createProvider({ bytes, filePath: "photos/file_1.jpg" });
    const storage = createStorage();

    await processMessagingMediaIngestionJob({
      job: createJob(),
      store,
      provider,
      storage,
      privateStorageBucket: "elevenhouse-local-private",
      maxBytes: 20_000_000,
      mediaAssetIdGenerator: () => mediaAssetId,
      now
    });

    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(storage.putPrivateObject).toHaveBeenCalledWith({
      storageBucket: "elevenhouse-local-private",
      storageKey: `22222222-2222-4222-8222-222222222222/messaging_attachment/${mediaAssetId}/telegram-image.jpg`,
      body: bytes,
      mimeType: "image/jpeg",
      checksumSha256
    });
    expect(store.markReady).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFileName: "telegram-image.jpg",
        mimeType: "image/jpeg",
        width: 1280,
        height: 720
      })
    );
  });

  it("stores Telegram video notes as MP4 private messaging attachments", async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
    const store = createStore({
      workItem: {
        ...workItem(),
        kind: "video_note",
        providerFileId: "video-note-file-id",
        providerMimeType: "video/mp4",
        providerSizeBytes: bytes.byteLength,
        durationSeconds: 7,
        width: 384,
        height: 384
      }
    });
    const provider = createProvider({ bytes, mimeType: "video/mp4", filePath: "video_notes/file_1.mp4" });
    const storage = createStorage();

    await processMessagingMediaIngestionJob({
      job: createJob(),
      store,
      provider,
      storage,
      privateStorageBucket: "elevenhouse-local-private",
      maxBytes: 20_000_000,
      mediaAssetIdGenerator: () => mediaAssetId,
      now
    });

    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(storage.putPrivateObject).toHaveBeenCalledWith({
      storageBucket: "elevenhouse-local-private",
      storageKey: `22222222-2222-4222-8222-222222222222/messaging_attachment/${mediaAssetId}/telegram-video-note.mp4`,
      body: bytes,
      mimeType: "video/mp4",
      checksumSha256
    });
    expect(store.markReady).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFileName: "telegram-video-note.mp4",
        mimeType: "video/mp4",
        width: 384,
        height: 384
      })
    );
  });

  it("stores regular Telegram videos as MP4 private messaging attachments", async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
    const store = createStore({
      workItem: {
        ...workItem(),
        kind: "video",
        providerFileId: "video-file-id",
        providerMimeType: "video/mp4",
        providerSizeBytes: bytes.byteLength,
        durationSeconds: 18,
        width: 1280,
        height: 720
      }
    });
    const provider = createProvider({ bytes, mimeType: "video/mp4", filePath: "videos/file_1.mp4" });
    const storage = createStorage();

    await processMessagingMediaIngestionJob({
      job: createJob(),
      store,
      provider,
      storage,
      privateStorageBucket: "elevenhouse-local-private",
      maxBytes: 20_000_000,
      mediaAssetIdGenerator: () => mediaAssetId,
      now
    });

    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    expect(storage.putPrivateObject).toHaveBeenCalledWith({
      storageBucket: "elevenhouse-local-private",
      storageKey: `22222222-2222-4222-8222-222222222222/messaging_attachment/${mediaAssetId}/telegram-video.mp4`,
      body: bytes,
      mimeType: "video/mp4",
      checksumSha256
    });
    expect(store.markReady).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFileName: "telegram-video.mp4",
        mimeType: "video/mp4",
        width: 1280,
        height: 720
      })
    );
  });

  it("marks unsupported MIME as permanent failed without storing bytes", async () => {
    const store = createStore({
      workItem: { ...workItem(), providerMimeType: "application/pdf" }
    });
    const provider = createProvider({
      bytes: new Uint8Array([37, 80, 68, 70]),
      mimeType: "application/pdf"
    });
    const storage = createStorage();

    await processMessagingMediaIngestionJob({
      job: createJob(),
      store,
      provider,
      storage,
      privateStorageBucket: "elevenhouse-local-private",
      maxBytes: 20_000_000,
      mediaAssetIdGenerator: () => mediaAssetId,
      now
    });

    expect(storage.putPrivateObject).not.toHaveBeenCalled();
    expect(store.markPermanentFailed).toHaveBeenCalledWith({
      ingestionId,
      failureCode: "UNSUPPORTED_MIME_TYPE",
      now
    });
  });

  it("records retryable failures and throws for BullMQ retry", async () => {
    const store = createStore();
    const provider = createProvider({ error: new Error("Telegram unavailable") });
    const storage = createStorage();

    await expect(
      processMessagingMediaIngestionJob({
        job: createJob({ attemptsMade: 0, opts: { attempts: 3 } }),
        store,
        provider,
        storage,
        privateStorageBucket: "elevenhouse-local-private",
        maxBytes: 20_000_000,
        mediaAssetIdGenerator: () => mediaAssetId,
        now
      })
    ).rejects.toThrow("Telegram unavailable");

    expect(store.markRetryableFailed).toHaveBeenCalledWith({
      ingestionId,
      failureCode: "MEDIA_INGESTION_RETRYABLE_FAILURE",
      nextRetryAt: now,
      now
    });
  });
});

function createJob(overrides: Partial<Job<MessagingMediaIngestionJobData>> = {}): Job<MessagingMediaIngestionJobData> {
  return {
    data: { ingestionId },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides
  } as Job<MessagingMediaIngestionJobData>;
}

function createStore(input: {
  readonly workItem?: Awaited<ReturnType<MessagingMediaIngestionProcessingStore["claimDueById"]>>;
} = {}): MessagingMediaIngestionProcessingStore {
  return {
    claimDueById: vi.fn(async () => input.workItem === undefined ? workItem() : input.workItem),
    markReady: vi.fn(async () => undefined),
    markRetryableFailed: vi.fn(async () => undefined),
    markPermanentFailed: vi.fn(async () => undefined)
  };
}

function createProvider(input: {
  readonly bytes?: Uint8Array;
  readonly mimeType?: string | null;
  readonly filePath?: string;
  readonly error?: Error;
}): TelegramBusinessMediaProvider {
  return {
    getFile: vi.fn(async () => {
      if (input.error) throw input.error;
      return { filePath: input.filePath ?? "voice/file_1.oga", fileSize: input.bytes?.byteLength ?? null };
    }),
    downloadFile: vi.fn(async () => {
      if (input.error) throw input.error;
      return { bytes: input.bytes ?? new Uint8Array(), mimeType: input.mimeType ?? null };
    })
  };
}

function createStorage(): PrivateObjectStorageWriterPort {
  return {
    putPrivateObject: vi.fn(async () => undefined)
  };
}

function workItem() {
  return {
    ingestionId,
    messageId: "message_1",
    channelConnectionId: "connection_1",
    astrologerUserId: "22222222-2222-4222-8222-222222222222",
    provider: "telegram" as const,
    kind: "voice" as const,
    providerFileId: "voice-file-id",
    providerMimeType: "audio/ogg",
    providerSizeBytes: 8,
    durationSeconds: 12,
    width: null,
    height: null
  };
}
