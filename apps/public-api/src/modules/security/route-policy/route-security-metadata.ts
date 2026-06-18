export const csrfRequiredMetadataKey = "elevenhouse:security:csrfRequired";
export const idempotencyRequiredMetadataKey = "elevenhouse:security:idempotencyRequired";

export type IdempotencyRequirement = {
  readonly scope: string;
};
