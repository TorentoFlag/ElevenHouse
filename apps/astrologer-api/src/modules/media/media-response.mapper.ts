import type { MediaAsset } from "@elevenhouse/domain";
import type { MediaAssetResponse } from "@elevenhouse/contracts";

export type MediaPublicUrlResolver = {
  readonly getPublicUrl: (input: {
    readonly storageBucket: string;
    readonly storageKey: string;
  }) => string;
};

export function toMediaAssetResponse(
  asset: MediaAsset,
  publicUrlResolver: MediaPublicUrlResolver
): MediaAssetResponse {
  return {
    id: asset.id,
    ownerUserId: asset.ownerUserId,
    purpose: asset.purpose,
    status: asset.status,
    visibility: asset.visibility,
    originalFileName: asset.originalFileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    url: publicUrlResolver.getPublicUrl({
      storageBucket: asset.storageBucket,
      storageKey: asset.storageKey
    }),
    variants: asset.variants.map((variant) => ({
      variant: variant.variant,
      url: publicUrlResolver.getPublicUrl({
        storageBucket: variant.storageBucket,
        storageKey: variant.storageKey
      }),
      mimeType: variant.mimeType,
      width: variant.width,
      height: variant.height,
      sizeBytes: variant.sizeBytes
    })),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt
  };
}
