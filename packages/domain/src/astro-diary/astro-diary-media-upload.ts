import { randomUUID } from "node:crypto";

import {
  astroDiaryMediaPurposeUploadLimits,
  astroDiaryMediaUploadPurposeValues,
  mediaMimeTypeValues,
  type AstroDiaryMediaUploadPurposeValue,
  type MediaMimeTypeValue
} from "@elevenhouse/validation/media";

import {
  authorizeAstroDiaryMediaCompletion,
  authorizeAstroDiaryMediaUpload,
  type AstroDiaryMediaAuthorizationContext,
  type AstroDiaryPrivateMediaAuthority
} from "./astro-diary-media-authorization";
import { normalizeRequiredString } from "../shared";
import {
  MediaNotFoundError,
  MediaStorageObjectMissingError,
  MediaValidationError
} from "../media/media-errors";
import type { ObjectStoragePort } from "../media/object-storage";
import type {
  CompleteMediaUploadInput,
  CreateMediaUploadIntentInput,
  MediaAsset,
  MediaUploadIntent
} from "../media/media-types";

const checksumSha256Pattern = /^[a-f0-9]{64}$/;

export class AstroDiaryMediaAuthorizationError extends Error {
  readonly code = "ASTRO_DIARY_MEDIA_AUTHORIZATION_DENIED" as const;

  constructor(readonly reason: string) {
    super("AstroDiary media operation is not authorized");
    this.name = "AstroDiaryMediaAuthorizationError";
  }
}

export type AstroDiaryMediaPendingUpload = Readonly<{
  asset: MediaAsset;
  media: AstroDiaryPrivateMediaAuthority;
}>;

export type AstroDiaryMediaUploadStore = {
  readonly createPendingUpload: (input: {
    readonly mediaId: string;
    readonly journalId: string;
    readonly ownerUserId: string;
    readonly purpose: AstroDiaryMediaUploadPurposeValue;
    readonly visibility: "private";
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly originalFileName: string;
    readonly mimeType: MediaMimeTypeValue;
    readonly sizeBytes: number;
    readonly now: string;
  }) => Promise<void>;
  readonly findPendingUpload: (input: {
    readonly journalId: string;
    readonly mediaId: string;
    readonly ownerUserId: string;
  }) => Promise<AstroDiaryMediaPendingUpload | null>;
  readonly markReady: (input: {
    readonly mediaId: string;
    readonly checksumSha256: string | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly now: string;
  }) => Promise<MediaAsset | null>;
  readonly markFailed: (input: {
    readonly mediaId: string;
    readonly reason: string;
    readonly now: string;
  }) => Promise<void>;
};

export async function createAstroDiaryPrivateMediaUploadIntent(input: {
  readonly store: AstroDiaryMediaUploadStore;
  readonly storage: ObjectStoragePort;
  readonly authority: AstroDiaryMediaAuthorizationContext;
  readonly ownerUserId: string;
  readonly input: CreateMediaUploadIntentInput;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<MediaUploadIntent> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Media owner user id is required");
  const purpose = parseAstroDiaryPurpose(input.input.purpose);
  const mimeType = parseMimeType(input.input.mimeType);
  const limit = astroDiaryMediaPurposeUploadLimits[purpose];

  if (!(limit.allowedMimeTypes as readonly string[]).includes(mimeType)) {
    throw new MediaValidationError("Unsupported AstroDiary media MIME type for purpose");
  }
  if (!Number.isSafeInteger(input.input.sizeBytes) || input.input.sizeBytes <= 0) {
    throw new MediaValidationError("AstroDiary media file size must be a positive integer");
  }
  if (input.input.sizeBytes > limit.maxSizeBytes) {
    throw new MediaValidationError("AstroDiary media file exceeds purpose upload limit");
  }

  const decision = authorizeAstroDiaryMediaUpload(input.authority, { ownerUserId, purpose });
  if (decision.outcome === "denied") throw new AstroDiaryMediaAuthorizationError(decision.code);

  const mediaId = input.idGenerator?.() ?? randomUUID();
  const originalFileName = normalizeRequiredString(
    input.input.fileName,
    "AstroDiary media original file name is required"
  );
  const storageKey = buildAstroDiaryStorageKey({
    journalId: input.authority.journal.id,
    ownerUserId,
    purpose,
    mediaId,
    fileName: originalFileName,
    mimeType
  });
  const upload = await input.storage.createPresignedUpload({
    storageKey,
    mimeType,
    sizeBytes: input.input.sizeBytes
  });

  await input.store.createPendingUpload({
    mediaId,
    journalId: input.authority.journal.id,
    ownerUserId,
    purpose,
    visibility: "private",
    storageBucket: upload.bucket,
    storageKey,
    originalFileName,
    mimeType,
    sizeBytes: input.input.sizeBytes,
    now: input.now.toISOString()
  });
  return {
    mediaId,
    status: "uploading",
    upload: {
      method: upload.method,
      url: upload.url,
      headers: upload.headers,
      expiresAt: upload.expiresAt
    }
  };
}

export async function completeAstroDiaryPrivateMediaUpload(input: {
  readonly store: AstroDiaryMediaUploadStore;
  readonly storage: ObjectStoragePort;
  readonly authority: AstroDiaryMediaAuthorizationContext;
  readonly ownerUserId: string;
  readonly mediaId: string;
  readonly input: CompleteMediaUploadInput;
  readonly now: Date;
}): Promise<MediaAsset> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Media owner user id is required");
  const pending = await input.store.findPendingUpload({
    journalId: input.authority.journal.id,
    mediaId: input.mediaId,
    ownerUserId
  });
  if (!pending) throw new MediaNotFoundError();

  const decision = authorizeAstroDiaryMediaCompletion(input.authority, pending.media);
  if (decision.outcome === "denied") throw new AstroDiaryMediaAuthorizationError(decision.code);

  if (
    input.input.checksumSha256 !== undefined &&
    !checksumSha256Pattern.test(input.input.checksumSha256)
  ) {
    throw new MediaValidationError("Invalid media checksum");
  }

  const metadata = await input.storage.readUploadedObjectMetadata({
    storageBucket: pending.asset.storageBucket,
    storageKey: pending.asset.storageKey
  });
  const now = input.now.toISOString();
  if (!metadata) {
    await input.store.markFailed({
      mediaId: pending.asset.id,
      reason: "Uploaded object is missing",
      now
    });
    throw new MediaStorageObjectMissingError();
  }

  const failure = metadataFailureReason({
    asset: pending.asset,
    checksumSha256: input.input.checksumSha256,
    metadata
  });
  if (failure) {
    await input.store.markFailed({ mediaId: pending.asset.id, reason: failure, now });
    throw new MediaValidationError(failure);
  }

  const completed = await input.store.markReady({
    mediaId: pending.asset.id,
    checksumSha256: metadata.checksumSha256,
    width: metadata.width,
    height: metadata.height,
    now
  });
  if (!completed) throw new MediaNotFoundError();
  return completed;
}

function parseAstroDiaryPurpose(value: string): AstroDiaryMediaUploadPurposeValue {
  const normalized = normalizeRequiredString(value, "AstroDiary media purpose is required");
  if (!isOneOf(astroDiaryMediaUploadPurposeValues, normalized)) {
    throw new MediaValidationError("Unsupported AstroDiary media purpose");
  }
  return normalized;
}

function parseMimeType(value: string): MediaMimeTypeValue {
  const normalized = normalizeRequiredString(
    value,
    "AstroDiary media MIME type is required"
  ).toLowerCase();
  if (!isOneOf(mediaMimeTypeValues, normalized)) {
    throw new MediaValidationError("Unsupported media MIME type");
  }
  return normalized;
}

function buildAstroDiaryStorageKey(input: {
  readonly journalId: string;
  readonly ownerUserId: string;
  readonly purpose: AstroDiaryMediaUploadPurposeValue;
  readonly mediaId: string;
  readonly fileName: string;
  readonly mimeType: MediaMimeTypeValue;
}): string {
  return `astro-diary/${input.journalId}/${input.ownerUserId}/${input.purpose}/${input.mediaId}/${toStorageFileName(
    input.fileName,
    input.mimeType
  )}`;
}

function toStorageFileName(fileName: string, mimeType: MediaMimeTypeValue): string {
  const normalizedName = transliterate(fileName)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const withoutExtension = normalizedName.replace(/\.[a-z0-9]+$/, "") || "media";
  return `${withoutExtension}.${extensionForMimeType(mimeType)}`;
}

function extensionForMimeType(mimeType: MediaMimeTypeValue): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "application/pdf":
      return "pdf";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
      return "m4a";
    case "video/mp4":
      return "mp4";
  }
}

function metadataFailureReason(input: {
  readonly asset: MediaAsset;
  readonly checksumSha256: string | undefined;
  readonly metadata: {
    readonly sizeBytes: number;
    readonly mimeType: string;
    readonly checksumSha256: string | null;
  };
}): string | null {
  if (input.metadata.sizeBytes !== input.asset.sizeBytes) {
    return "Uploaded object size does not match intent";
  }
  if (input.metadata.mimeType !== input.asset.mimeType) {
    return "Uploaded object MIME type does not match intent";
  }
  if (
    input.checksumSha256 !== undefined &&
    input.metadata.checksumSha256 !== null &&
    input.metadata.checksumSha256 !== input.checksumSha256
  ) {
    return "Uploaded object checksum does not match intent";
  }
  return null;
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return (values as readonly string[]).includes(value);
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya"
  };
  return value
    .normalize("NFKD")
    .replace(/[ъь]/gi, "")
    .replace(/[А-Яа-я]/g, (character) => map[character.toLowerCase()] ?? character)
    .replace(/[\u0300-\u036f]/g, "");
}
