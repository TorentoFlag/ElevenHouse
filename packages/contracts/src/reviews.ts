import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const textWithoutControlCharsSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), {
    message: "Review text cannot contain control characters"
  });

export const reviewableInstanceKindValues = [
  "booking",
  "astro_diary_period",
  "astro_calendar_service_period",
  "async_delivery",
  "instant_delivery",
  "mini_delivery",
  "course_access",
  "course_completion",
  "pack_session",
  "pack",
  "subscription_period",
  "group_participation",
  "gift_redemption",
  "custom_fulfillment"
] as const;
export const reviewableInstanceKindSchema = z.enum(reviewableInstanceKindValues);
export type ReviewableInstanceKind = z.infer<typeof reviewableInstanceKindSchema>;

export const reviewWindowPolicyValues = [
  "standard_14_days_after_receipt",
  "active_period_plus_14_days"
] as const;
export const reviewWindowPolicySchema = z.enum(reviewWindowPolicyValues);
export type ReviewWindowPolicy = z.infer<typeof reviewWindowPolicySchema>;

export const reviewableInstanceStatusValues = [
  "not_yet_received",
  "reviewable",
  "window_closed",
  "blocked",
  "review_submitted"
] as const;
export const reviewableInstanceStatusSchema = z.enum(reviewableInstanceStatusValues);
export type ReviewableInstanceStatus = z.infer<typeof reviewableInstanceStatusSchema>;

export const reviewPublicIdentityModeValues = ["named", "secret_user"] as const;
export const reviewPublicIdentityModeSchema = z.enum(reviewPublicIdentityModeValues);
export type ReviewPublicIdentityMode = z.infer<typeof reviewPublicIdentityModeSchema>;

export const reviewModerationStatusValues = ["pending", "approved", "rejected"] as const;
export const reviewModerationStatusSchema = z.enum(reviewModerationStatusValues);
export type ReviewModerationStatus = z.infer<typeof reviewModerationStatusSchema>;

export const reviewVisibilityStatusValues = [
  "not_public",
  "visible",
  "temporarily_hidden_by_dispute",
  "hidden_by_moderation"
] as const;
export const reviewVisibilityStatusSchema = z.enum(reviewVisibilityStatusValues);
export type ReviewVisibilityStatus = z.infer<typeof reviewVisibilityStatusSchema>;

export const reviewDisputeStatusValues = [
  "none",
  "open",
  "under_review",
  "waiting_client",
  "waiting_astrologer",
  "resolved_closed"
] as const;
export const reviewDisputeStatusSchema = z.enum(reviewDisputeStatusValues);
export type ReviewDisputeStatus = z.infer<typeof reviewDisputeStatusSchema>;

export const reviewModerationReasonCodeValues = [
  "spam",
  "abuse_or_hate",
  "personal_data_exposure",
  "off_topic",
  "not_service_related",
  "fraud_or_conflict",
  "duplicate",
  "legal_risk",
  "other"
] as const;
export const reviewModerationReasonCodeSchema = z.enum(reviewModerationReasonCodeValues);
export type ReviewModerationReasonCode = z.infer<typeof reviewModerationReasonCodeSchema>;

export const reviewVersionSubmissionSchema = z
  .object({
    reviewableInstanceId: uuidSchema,
    rating: z.number().int().min(1).max(5),
    text: textWithoutControlCharsSchema,
    publicIdentityMode: reviewPublicIdentityModeSchema
  })
  .strict();
export type ReviewVersionSubmission = z.infer<typeof reviewVersionSubmissionSchema>;

export const namedReviewPublicAuthorSchema = z
  .object({
    publicIdentityMode: z.literal("named"),
    displayName: z.string().trim().min(1).max(120),
    initials: z.string().trim().min(1).max(2),
    avatarUrl: z.string().url().nullable()
  })
  .strict();

export const secretReviewPublicAuthorSchema = z
  .object({
    publicIdentityMode: z.literal("secret_user"),
    displayName: z.literal("Секретный пользователь"),
    initials: z.null(),
    avatarUrl: z.null()
  })
  .strict();

export const reviewPublicAuthorSchema = z.discriminatedUnion("publicIdentityMode", [
  namedReviewPublicAuthorSchema,
  secretReviewPublicAuthorSchema
]);
export type ReviewPublicAuthor = z.infer<typeof reviewPublicAuthorSchema>;

export const reviewFirstPublicationFlowEventSchema = z
  .object({
    eventType: z.literal("review_first_published"),
    reviewId: uuidSchema,
    reviewableInstanceId: uuidSchema,
    astrologerUserId: uuidSchema,
    clientUserId: uuidSchema,
    firstApprovedVersionId: uuidSchema,
    publishedAt: instantSchema
  })
  .strict();
export type ReviewFirstPublicationFlowEvent = z.infer<
  typeof reviewFirstPublicationFlowEventSchema
>;
