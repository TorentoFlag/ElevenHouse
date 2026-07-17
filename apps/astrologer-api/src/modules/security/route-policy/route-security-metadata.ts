export const csrfRequiredMetadataKey = "elevenhouse:astrologer-security:csrfRequired";
export const idempotencyRequiredMetadataKey =
  "elevenhouse:astrologer-security:idempotencyRequired";

export type IdempotencyRequirement = {
  readonly scope: string;
};
