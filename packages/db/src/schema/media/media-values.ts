export {
  mediaImageMimeTypeValues,
  mediaMimeTypeValues,
  mediaPurposeValues,
  mediaStatusValues,
  mediaVariantValues,
  mediaVisibilityValues
} from "@elevenhouse/validation/media";

export function formatMediaSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
