import type { PrivateObjectStorageWriterPort } from "@elevenhouse/domain";

export type MessagingMediaIngestionWorkItem = {
  readonly ingestionId: string;
  readonly messageId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly provider: "telegram";
  readonly kind: "voice" | "image" | "video_note" | "video";
  readonly providerFileId: string;
  readonly providerMimeType: string | null;
  readonly providerSizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
};

export type MessagingMediaIngestionProcessingStore = {
  readonly claimDueById: (input: {
    readonly ingestionId: string;
    readonly now: Date;
  }) => Promise<MessagingMediaIngestionWorkItem | null>;
  readonly markReady: (input: {
    readonly ingestionId: string;
    readonly messageId: string;
    readonly mediaAssetId: string;
    readonly ownerUserId: string;
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly originalFileName: string;
    readonly mimeType: "audio/ogg" | "audio/mpeg" | "audio/mp4" | "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "video/mp4";
    readonly sizeBytes: number;
    readonly checksumSha256: string;
    readonly width: number | null;
    readonly height: number | null;
    readonly now: Date;
  }) => Promise<void>;
  readonly markRetryableFailed: (input: {
    readonly ingestionId: string;
    readonly failureCode: string;
    readonly nextRetryAt: Date;
    readonly now: Date;
  }) => Promise<void>;
  readonly markPermanentFailed: (input: {
    readonly ingestionId: string;
    readonly failureCode: string;
    readonly now: Date;
  }) => Promise<void>;
};

export type TelegramBusinessMediaProvider = {
  readonly getFile: (input: {
    readonly fileId: string;
  }) => Promise<{ readonly filePath: string; readonly fileSize: number | null }>;
  readonly downloadFile: (input: {
    readonly filePath: string;
    readonly maxBytes: number;
  }) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string | null }>;
};

export type MessagingMediaIngestionStorage = PrivateObjectStorageWriterPort;
