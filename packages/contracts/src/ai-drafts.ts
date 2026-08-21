import { nonEmptyStringSchema, z } from "@elevenhouse/validation";
import {
  dictionaryContentMaxLength,
  dictionaryLocaleSchema,
  dictionaryTitleMaxLength
} from "./dictionary";

const uuidSchema = z.string().uuid();
const dictionaryAiDraftTitleRequestSchema = nonEmptyStringSchema.max(dictionaryTitleMaxLength);

export const aiDraftProviderSchema = z.literal("openai");
export type AiDraftProvider = z.infer<typeof aiDraftProviderSchema>;

export const aiDraftModelSchema = z.enum(["gpt-5.4-mini", "gpt-5.5"]);
export type AiDraftModel = z.infer<typeof aiDraftModelSchema>;

export const aiDraftFinishReasonSchema = z.enum([
  "completed",
  "incomplete",
  "content_filter",
  "refusal",
  "failed"
]);
export type AiDraftFinishReason = z.infer<typeof aiDraftFinishReasonSchema>;

export const createDictionaryAiDraftRequestSchema = z
  .object({
    categoryId: uuidSchema,
    locale: dictionaryLocaleSchema,
    title: dictionaryAiDraftTitleRequestSchema
  })
  .strict();
export type CreateDictionaryAiDraftRequest = z.infer<typeof createDictionaryAiDraftRequestSchema>;

export const aiDraftUsageSchema = z
  .object({
    promptTokens: z.number().int().min(0),
    completionTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0)
  })
  .strict();
export type AiDraftUsage = z.infer<typeof aiDraftUsageSchema>;

export const createDictionaryAiDraftResponseSchema = z
  .object({
    content: nonEmptyStringSchema.max(dictionaryContentMaxLength),
    provider: aiDraftProviderSchema,
    model: aiDraftModelSchema,
    promptId: z.literal("dictionary.entryDraft"),
    promptVersion: z.literal(1),
    finishReason: aiDraftFinishReasonSchema,
    usage: aiDraftUsageSchema.optional()
  })
  .strict();
export type CreateDictionaryAiDraftResponse = z.infer<typeof createDictionaryAiDraftResponseSchema>;

export const createReviewReplyAiDraftRequestSchema = z
  .object({
    locale: dictionaryLocaleSchema.default("ru")
  })
  .strict();
export type CreateReviewReplyAiDraftRequest = z.infer<typeof createReviewReplyAiDraftRequestSchema>;

export const createReviewReplyAiDraftResponseSchema = z
  .object({
    draftId: uuidSchema,
    attemptId: uuidSchema,
    draftText: nonEmptyStringSchema.max(4_000)
  })
  .strict();
export type CreateReviewReplyAiDraftResponse = z.infer<
  typeof createReviewReplyAiDraftResponseSchema
>;
