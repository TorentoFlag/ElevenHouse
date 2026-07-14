export {
  mediaImageMimeTypeValues,
  mediaMimeTypeValues,
  mediaPurposeValues,
  mediaStatusValues,
  mediaUploadPurposeValues,
  mediaVariantValues,
  mediaVisibilityValues
} from "@elevenhouse/validation/media";

export function formatMediaSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
