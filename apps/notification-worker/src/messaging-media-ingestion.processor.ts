import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import { mediaPurposeStorageLimits } from "@elevenhouse/validation/media";
import type { MessagingMediaIngestionJobData } from "./messaging-media-ingestion.queue";
import type {
  MessagingMediaIngestionProcessingStore,
  MessagingMediaIngestionStorage,
  TelegramBusinessMediaProvider
} from "./messaging-media-ingestion.types";

type SupportedMediaMimeType =
  | "audio/ogg"
  | "audio/mpeg"
  | "audio/mp4"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif"
  | "video/mp4";

export async function processMessagingMediaIngestionJob(input: {
  readonly job: Job<MessagingMediaIngestionJobData>;
  readonly store: MessagingMediaIngestionProcessingStore;
  readonly provider: TelegramBusinessMediaProvider;
  readonly storage: MessagingMediaIngestionStorage;
  readonly privateStorageBucket: string;
  readonly maxBytes?: number;
  readonly mediaAssetIdGenerator: () => string;
  readonly now: Date;
}): Promise<void> {
  const workItem = await input.store.claimDueById({
    ingestionId: input.job.data.ingestionId,
    now: input.now
  });
  if (!workItem) return;

  const maxBytes = input.maxBytes ?? mediaPurposeStorageLimits.messaging_attachment.maxSizeBytes;

  try {
    const file = await input.provider.getFile({ fileId: workItem.providerFileId });
    if (file.fileSize !== null && file.fileSize > maxBytes) {
      await input.store.markPermanentFailed({
        ingestionId: workItem.ingestionId,
        failureCode: "FILE_TOO_LARGE",
        now: input.now
      });
      return;
    }

    const download = await input.provider.downloadFile({
      filePath: file.filePath,
      maxBytes
    });
    const mimeType =
      detectSupportedMimeType(download.bytes, workItem.kind) ??
      normalizeSupportedMimeType(download.mimeType ?? workItem.providerMimeType, workItem.kind);
    if (!mimeType) {
      await input.store.markPermanentFailed({
        ingestionId: workItem.ingestionId,
        failureCode: "UNSUPPORTED_MIME_TYPE",
        now: input.now
      });
      return;
    }

    const mediaAssetId = input.mediaAssetIdGenerator();
    const checksumSha256 = createHash("sha256").update(download.bytes).digest("hex");
    const originalFileName = `${baseFileNameForKind(workItem.kind)}.${extensionForMimeType(mimeType)}`;
    const storageKey = [
      workItem.astrologerUserId,
      "messaging_attachment",
      mediaAssetId,
      originalFileName
    ].join("/");

    await input.storage.putPrivateObject({
      storageBucket: input.privateStorageBucket,
      storageKey,
      body: download.bytes,
      mimeType,
      checksumSha256
    });

    await input.store.markReady({
      ingestionId: workItem.ingestionId,
      messageId: workItem.messageId,
      mediaAssetId,
      ownerUserId: workItem.astrologerUserId,
      storageBucket: input.privateStorageBucket,
      storageKey,
      originalFileName,
      mimeType,
      sizeBytes: download.bytes.byteLength,
      checksumSha256,
      width: workItem.width,
      height: workItem.height,
      now: input.now
    });
  } catch (error) {
    const failureCode = "MEDIA_INGESTION_RETRYABLE_FAILURE";
    if (isFinalAttempt(input.job)) {
      await input.store.markPermanentFailed({
        ingestionId: workItem.ingestionId,
        failureCode,
        now: input.now
      });
      return;
    }

    await input.store.markRetryableFailed({
      ingestionId: workItem.ingestionId,
      failureCode,
      nextRetryAt: input.now,
      now: input.now
    });
    throw error;
  }
}

function detectSupportedMimeType(
  bytes: Uint8Array,
  kind: "voice" | "image" | "video_note" | "video"
): SupportedMediaMimeType | null {
  if (kind === "voice") {
    if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
    if (bytes.byteLength >= 3 && ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
    if (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "audio/mpeg";
    if (isIsoBaseMediaFile(bytes)) return "audio/mp4";
  }
  if (kind === "image") {
    if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.byteLength >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "image/png";
    if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
      return "image/webp";
    }
    if (isIsoBaseMediaFile(bytes) && ["avif", "avis", "mif1"].includes(ascii(bytes, 8, 12))) {
      return "image/avif";
    }
  }
  if ((kind === "video_note" || kind === "video") && isIsoBaseMediaFile(bytes)) return "video/mp4";
  return null;
}

function normalizeSupportedMimeType(
  value: string | null,
  kind: "voice" | "image" | "video_note" | "video"
): SupportedMediaMimeType | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (
    kind === "voice" &&
    (normalized === "audio/ogg" || normalized === "audio/mpeg" || normalized === "audio/mp4")
  ) {
    return normalized;
  }
  if (
    kind === "image" &&
    (normalized === "image/jpeg" ||
      normalized === "image/png" ||
      normalized === "image/webp" ||
      normalized === "image/avif")
  ) {
    return normalized;
  }
  if ((kind === "video_note" || kind === "video") && normalized === "video/mp4") return normalized;
  return null;
}

function extensionForMimeType(
  mimeType: SupportedMediaMimeType
): "ogg" | "mp3" | "m4a" | "jpg" | "png" | "webp" | "avif" | "mp4" {
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "mp4";
}

function baseFileNameForKind(
  kind: "voice" | "image" | "video_note" | "video"
): "telegram-voice" | "telegram-image" | "telegram-video-note" | "telegram-video" {
  if (kind === "voice") return "telegram-voice";
  if (kind === "image") return "telegram-image";
  if (kind === "video") return "telegram-video";
  return "telegram-video-note";
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function isIsoBaseMediaFile(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && ascii(bytes, 4, 8) === "ftyp";
}

function isFinalAttempt(job: Job<MessagingMediaIngestionJobData>): boolean {
  const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  return job.attemptsMade + 1 >= attempts;
}
