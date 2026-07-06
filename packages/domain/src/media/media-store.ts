import type {
  MediaAsset,
  MediaMimeType,
  MediaPurpose,
  MediaVisibility
} from "./media-types";

export type MediaAssetStoreCreateInput = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly purpose: MediaPurpose;
  readonly visibility: MediaVisibility;
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly originalFileName: string;
  readonly mimeType: MediaMimeType;
  readonly sizeBytes: number;
  readonly now: string;
};

export type MediaAssetStore = {
  readonly createUploadingAsset: (input: MediaAssetStoreCreateInput) => Promise<MediaAsset>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly mediaId: string;
  }) => Promise<MediaAsset | null>;
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
  }) => Promise<MediaAsset | null>;
};
