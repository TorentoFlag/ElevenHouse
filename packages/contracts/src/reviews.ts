import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const cursorSchema = z.string().trim().min(1).max(240);
const textWithoutControlCharsSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => !containsDisallowedControlCharacter(value), {
    message: "Review text cannot contain control characters"
  });

function containsDisallowedControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c) return true;
    if ((code >= 0x0e && code <= 0x1f) || code === 0x7f) return true;
  }
  return false;
}

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

export const reviewReplyModerationStatusValues = [
  "none",
  "pending",
  "approved",
  "rejected"
] as const;
export const reviewReplyModerationStatusSchema = z.enum(reviewReplyModerationStatusValues);
export type ReviewReplyModerationStatus = z.infer<typeof reviewReplyModerationStatusSchema>;

export const reviewModerationCaseStatusValues = [
  "open",
  "waiting_client",
  "waiting_astrologer",
  "consensus_reached",
  "closed"
] as const;
export const reviewModerationCaseStatusSchema = z.enum(reviewModerationCaseStatusValues);
export type ReviewModerationCaseStatus = z.infer<typeof reviewModerationCaseStatusSchema>;

export const reviewModerationCaseMessageAuthorRoleValues = [
  "moderator",
  "client",
  "astrologer",
  "system"
] as const;
export const reviewModerationCaseMessageAuthorRoleSchema = z.enum(
  reviewModerationCaseMessageAuthorRoleValues
);
export type ReviewModerationCaseMessageAuthorRole = z.infer<
  typeof reviewModerationCaseMessageAuthorRoleSchema
>;

export const reviewModerationCaseMessageVisibilityValues = [
  "all_case_participants",
  "client_and_moderators",
  "astrologer_and_moderators",
  "moderators_only"
] as const;
export const reviewModerationCaseMessageVisibilitySchema = z.enum(
  reviewModerationCaseMessageVisibilityValues
);
export type ReviewModerationCaseMessageVisibility = z.infer<
  typeof reviewModerationCaseMessageVisibilitySchema
>;

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

export const reviewAdminAuthorSchema = z
  .object({
    clientUserId: uuidSchema,
    displayName: z.string().trim().min(1).max(120),
    initials: z.string().trim().min(1).max(2),
    avatarUrl: z.string().url().nullable()
  })
  .strict();
export type ReviewAdminAuthor = z.infer<typeof reviewAdminAuthorSchema>;

export const reviewableInstanceSummarySchema = z
  .object({
    id: uuidSchema,
    kind: reviewableInstanceKindSchema,
    status: reviewableInstanceStatusSchema,
    title: z.string().trim().min(1).max(200),
    contextLabel: z.string().trim().min(1).max(240),
    receivedAt: instantSchema,
    reviewWindowClosesAt: instantSchema,
    windowPolicy: reviewWindowPolicySchema
  })
  .strict();
export type ReviewableInstanceSummary = z.infer<typeof reviewableInstanceSummarySchema>;

export const reviewVersionSchema = z
  .object({
    id: uuidSchema,
    versionNumber: z.number().int().min(1),
    rating: z.number().int().min(1).max(5),
    text: textWithoutControlCharsSchema,
    publicIdentityMode: reviewPublicIdentityModeSchema,
    moderationStatus: reviewModerationStatusSchema,
    moderationReasonCode: reviewModerationReasonCodeSchema.nullable(),
    submittedAt: instantSchema,
    decidedAt: instantSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.moderationStatus === "pending" && value.decidedAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decidedAt"],
        message: "Pending review versions cannot have a moderation decision timestamp"
      });
    }
    if (value.moderationStatus !== "pending" && value.decidedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decidedAt"],
        message: "Decided review versions require a moderation decision timestamp"
      });
    }
  });
export type ReviewVersion = z.infer<typeof reviewVersionSchema>;

export const clientReviewDetailSchema = z
  .object({
    reviewId: uuidSchema,
    reviewableInstance: reviewableInstanceSummarySchema,
    activePublicVersion: reviewVersionSchema.nullable(),
    pendingVersion: reviewVersionSchema.nullable(),
    canSubmitNewVersion: z.boolean(),
    canEditLatestVersion: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.activePublicVersion !== null &&
      value.activePublicVersion.moderationStatus !== "approved"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activePublicVersion", "moderationStatus"],
        message: "Active public review version must be approved"
      });
    }
    if (value.pendingVersion !== null && value.pendingVersion.moderationStatus !== "pending") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pendingVersion", "moderationStatus"],
        message: "Pending review version must still be pending moderation"
      });
    }
  });
export type ClientReviewDetail = z.infer<typeof clientReviewDetailSchema>;

export const reviewReplySubmissionSchema = z
  .object({
    text: textWithoutControlCharsSchema
  })
  .strict();
export type ReviewReplySubmission = z.infer<typeof reviewReplySubmissionSchema>;

export const reviewPublicReplySchema = z
  .object({
    replyId: uuidSchema,
    text: textWithoutControlCharsSchema,
    publishedAt: instantSchema
  })
  .strict();
export type ReviewPublicReply = z.infer<typeof reviewPublicReplySchema>;

export const reviewPublicItemSchema = z
  .object({
    reviewId: uuidSchema,
    reviewableInstanceId: uuidSchema,
    astrologerUserId: uuidSchema,
    productId: uuidSchema.nullable(),
    title: z.string().trim().min(1).max(200),
    contextLabel: z.string().trim().min(1).max(240),
    rating: z.number().int().min(1).max(5),
    text: textWithoutControlCharsSchema,
    author: reviewPublicAuthorSchema,
    publishedAt: instantSchema,
    astrologerReply: reviewPublicReplySchema.nullable()
  })
  .strict();
export type ReviewPublicItem = z.infer<typeof reviewPublicItemSchema>;

export const reviewPublicListQuerySchema = z
  .object({
    astrologerUserId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
    limit: z.number().int().min(1).max(50).optional().default(20),
    cursor: cursorSchema.nullish().default(null)
  })
  .strict();
export type ReviewPublicListQueryInput = z.input<typeof reviewPublicListQuerySchema>;
export type ReviewPublicListQuery = z.infer<typeof reviewPublicListQuerySchema>;

export const reviewPublicListResponseSchema = z
  .object({
    items: z.array(reviewPublicItemSchema).max(50),
    nextCursor: cursorSchema.nullable()
  })
  .strict();
export type ReviewPublicListResponse = z.infer<typeof reviewPublicListResponseSchema>;

export const reviewModerationCaseSummarySchema = z
  .object({
    caseId: uuidSchema,
    status: reviewModerationCaseStatusSchema,
    openedAt: instantSchema,
    closedAt: instantSchema.nullable(),
    reasonCode: reviewModerationReasonCodeSchema
  })
  .strict();
export type ReviewModerationCaseSummary = z.infer<typeof reviewModerationCaseSummarySchema>;

export const reviewAdminDetailSchema = z
  .object({
    reviewId: uuidSchema,
    client: reviewAdminAuthorSchema,
    publicIdentityMode: reviewPublicIdentityModeSchema,
    visibilityStatus: reviewVisibilityStatusSchema,
    disputeStatus: reviewDisputeStatusSchema,
    reviewableInstance: reviewableInstanceSummarySchema,
    versions: z.array(reviewVersionSchema).max(100),
    moderationCase: reviewModerationCaseSummarySchema.nullable(),
    auditCursor: cursorSchema.nullable()
  })
  .strict();
export type ReviewAdminDetail = z.infer<typeof reviewAdminDetailSchema>;

export const reviewModerationDecisionSchema = z
  .object({
    reasonCode: reviewModerationReasonCodeSchema,
    note: z.string().trim().max(2_000).nullable()
  })
  .strict();
export type ReviewModerationDecision = z.infer<typeof reviewModerationDecisionSchema>;

export const reviewModerationCaseMessageCreateSchema = z
  .object({
    visibility: reviewModerationCaseMessageVisibilitySchema,
    body: textWithoutControlCharsSchema
  })
  .strict();
export type ReviewModerationCaseMessageCreate = z.infer<
  typeof reviewModerationCaseMessageCreateSchema
>;

export const reviewModerationCaseMessageSchema = z
  .object({
    messageId: uuidSchema,
    authorRole: reviewModerationCaseMessageAuthorRoleSchema,
    visibility: reviewModerationCaseMessageVisibilitySchema,
    body: textWithoutControlCharsSchema,
    createdAt: instantSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.authorRole === "client" && value.visibility === "astrologer_and_moderators") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility"],
        message: "Client-authored case messages cannot target astrologer-only visibility"
      });
    }
    if (value.authorRole === "astrologer" && value.visibility === "client_and_moderators") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility"],
        message: "Astrologer-authored case messages cannot target client-only visibility"
      });
    }
    if (value.authorRole !== "moderator" && value.visibility === "moderators_only") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility"],
        message: "Only moderators can create moderator-only case messages"
      });
    }
  });
export type ReviewModerationCaseMessage = z.infer<typeof reviewModerationCaseMessageSchema>;

export const reviewModerationCaseDetailSchema = z
  .object({
    caseId: uuidSchema,
    reviewId: uuidSchema,
    status: reviewModerationCaseStatusSchema,
    openedAt: instantSchema,
    closedAt: instantSchema.nullable(),
    serviceContext: z
      .object({
        title: z.string().trim().min(1).max(200),
        contextLabel: z.string().trim().min(1).max(240)
      })
      .strict(),
    messages: z.array(reviewModerationCaseMessageSchema).max(500)
  })
  .strict();
export type ReviewModerationCaseDetail = z.infer<typeof reviewModerationCaseDetailSchema>;

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
export type ReviewFirstPublicationFlowEvent = z.infer<typeof reviewFirstPublicationFlowEventSchema>;
