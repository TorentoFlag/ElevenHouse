import { randomUUID } from "node:crypto";
import {
  mediaMimeTypeValues,
  mediaPurposeUploadLimits,
  mediaUploadPurposeValues,
  type MediaMimeTypeValue,
  type MediaPurposeValue,
  type MediaUploadPurposeValue
} from "@elevenhouse/validation/media";
import { normalizeRequiredString } from "../shared";
import {
  MediaNotFoundError,
  MediaStorageObjectMissingError,
  MediaValidationError
} from "./media-errors";
import type { MediaAssetStore } from "./media-store";
import type { ObjectStoragePort } from "./object-storage";
import type {
  CompleteMediaUploadInput,
  CreateMediaUploadIntentInput,
  MediaAsset,
  MediaUploadIntent
} from "./media-types";

const checksumSha256Pattern = /^[a-f0-9]{64}$/;

export async function createMediaUploadIntent(input: {
  readonly store: MediaAssetStore;
  readonly storage: ObjectStoragePort;
  readonly ownerUserId: string;
  readonly input: CreateMediaUploadIntentInput;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<MediaUploadIntent> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Media owner user id is required");
  const purpose = parseMediaPurpose(input.input.purpose);
  const mimeType = parseMediaMimeType(input.input.mimeType);
  const limit = mediaPurposeUploadLimits[purpose];

  if (!(limit.allowedMimeTypes as readonly string[]).includes(mimeType)) {
    throw new MediaValidationError("Unsupported media MIME type for purpose");
  }
  if (!Number.isSafeInteger(input.input.sizeBytes) || input.input.sizeBytes <= 0) {
    throw new MediaValidationError("Media file size must be a positive integer");
  }
  if (input.input.sizeBytes > limit.maxSizeBytes) {
    throw new MediaValidationError("Media file exceeds purpose upload limit");
  }

  const mediaId = input.idGenerator?.() ?? randomUUID();
  const originalFileName = normalizeRequiredString(
    input.input.fileName,
    "Media original file name is required"
  );
  const storageKey = buildStorageKey({
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
  const now = input.now.toISOString();
  const asset = await input.store.createUploadingAsset({
    id: mediaId,
    ownerUserId,
    purpose,
    visibility: limit.visibility,
    storageBucket: upload.bucket,
    storageKey,
    originalFileName,
    mimeType,
    sizeBytes: input.input.sizeBytes,
    now
  });

  return {
    mediaId: asset.id,
    status: "uploading",
    upload: {
      method: upload.method,
      url: upload.url,
      headers: upload.headers,
      expiresAt: upload.expiresAt
    }
  };
}

export async function completeMediaUpload(input: {
  readonly store: MediaAssetStore;
  readonly storage: ObjectStoragePort;
  readonly ownerUserId: string;
  readonly mediaId: string;
  readonly input: CompleteMediaUploadInput;
  readonly now: Date;
}): Promise<MediaAsset> {
  const asset = await findOwnedAsset(input.store, input.ownerUserId, input.mediaId);
  const now = input.now.toISOString();

  if (asset.status !== "uploading") {
    throw new MediaValidationError("Only uploading media assets can be completed");
  }
  if (
    input.input.checksumSha256 !== undefined &&
    !checksumSha256Pattern.test(input.input.checksumSha256)
  ) {
    throw new MediaValidationError("Invalid media checksum");
  }

  const metadata = await input.storage.readUploadedObjectMetadata({
    storageBucket: asset.storageBucket,
    storageKey: asset.storageKey
  });
  if (!metadata) {
    await input.store.markFailed({
      mediaId: asset.id,
      reason: "Uploaded object is missing",
      now
    });
    throw new MediaStorageObjectMissingError();
  }

  const failureReason = getMetadataFailureReason({
    asset,
    checksumSha256: input.input.checksumSha256,
    metadata
  });
  if (failureReason) {
    await input.store.markFailed({
      mediaId: asset.id,
      reason: failureReason,
      now
    });
    throw new MediaValidationError(failureReason);
  }

  const completed = await input.store.markReady({
    mediaId: asset.id,
    checksumSha256: metadata.checksumSha256,
    width: metadata.width,
    height: metadata.height,
    now
  });
  if (!completed) {
    throw new MediaNotFoundError();
  }

  return completed;
}

export async function assertUsableMediaForOwner(input: {
  readonly store: MediaAssetStore;
  readonly ownerUserId: string;
  readonly mediaId: string;
  readonly purpose: MediaPurposeValue;
}): Promise<MediaAsset> {
  const asset = await findOwnedAsset(input.store, input.ownerUserId, input.mediaId);

  if (asset.purpose !== input.purpose) {
    throw new MediaValidationError("Media asset purpose does not match requested use");
  }
  if (asset.status !== "ready") {
    throw new MediaValidationError("Media asset is not ready");
  }

  return asset;
}

function parseMediaPurpose(value: string): MediaUploadPurposeValue {
  const normalized = normalizeRequiredString(value, "Media purpose is required");
  if (!isOneOf(mediaUploadPurposeValues, normalized)) {
    throw new MediaValidationError("Unsupported media purpose");
  }
  return normalized;
}

function parseMediaMimeType(value: string): MediaMimeTypeValue {
  const normalized = normalizeRequiredString(value, "Media MIME type is required").toLowerCase();
  if (!isOneOf(mediaMimeTypeValues, normalized)) {
    throw new MediaValidationError("Unsupported media MIME type");
  }
  return normalized;
}

function buildStorageKey(input: {
  readonly ownerUserId: string;
  readonly purpose: MediaUploadPurposeValue;
  readonly mediaId: string;
  readonly fileName: string;
  readonly mimeType: MediaMimeTypeValue;
}): string {
  return `${input.ownerUserId}/${input.purpose}/${input.mediaId}/${toStorageFileName(
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
  const extension = extensionForMimeType(mimeType);
  const withoutExtension = normalizedName.replace(/\.[a-z0-9]+$/, "") || "media";

  return `${withoutExtension}.${extension}`;
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
    й: "j",
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
    я: "ya",
    ъ: "",
    ь: ""
  };

  return Array.from(value)
    .map((char) => map[char.toLowerCase()] ?? char)
    .join("");
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
  }
}

async function findOwnedAsset(
  store: MediaAssetStore,
  ownerUserId: string,
  mediaId: string
): Promise<MediaAsset> {
  const asset = await store.findByOwnerAndId({
    ownerUserId: normalizeRequiredString(ownerUserId, "Media owner user id is required"),
    mediaId: normalizeRequiredString(mediaId, "Media id is required")
  });
  if (!asset) {
    throw new MediaNotFoundError();
  }

  return asset;
}

function getMetadataFailureReason(input: {
  readonly asset: MediaAsset;
  readonly checksumSha256: string | undefined;
  readonly metadata: {
    readonly sizeBytes: number;
    readonly mimeType: string;
    readonly checksumSha256: string | null;
  };
}): string | null {
  if (input.metadata.sizeBytes !== input.asset.sizeBytes) {
    return "Uploaded media size does not match the upload intent";
  }
  if (input.metadata.mimeType.toLowerCase() !== input.asset.mimeType) {
    return "Uploaded media MIME type does not match the upload intent";
  }
  if (
    input.checksumSha256 &&
    input.metadata.checksumSha256 &&
    input.metadata.checksumSha256 !== input.checksumSha256
  ) {
    return "Uploaded media checksum does not match the completion request";
  }

  return null;
}

function isOneOf<const TValue extends string>(
  values: readonly TValue[],
  value: string
): value is TValue {
  return values.includes(value as TValue);
}
