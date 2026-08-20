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

export const reviewWindowPolicyValues = [
  "standard_14_days_after_receipt",
  "active_period_plus_14_days"
] as const;

export const reviewableInstanceStatusValues = [
  "not_yet_received",
  "reviewable",
  "window_closed",
  "blocked",
  "review_submitted"
] as const;

export const reviewSourceReceiptStatusValues = ["received", "revoked"] as const;

export const reviewPublicIdentityModeValues = ["named", "secret_user"] as const;

export const reviewModerationStatusValues = ["pending", "approved", "rejected"] as const;

export const reviewVisibilityStatusValues = [
  "not_public",
  "visible",
  "temporarily_hidden_by_dispute",
  "hidden_by_moderation"
] as const;

export const reviewDisputeStatusValues = [
  "none",
  "open",
  "under_review",
  "waiting_client",
  "waiting_astrologer",
  "resolved_closed"
] as const;

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

export const reviewModerationCaseStatusValues = [
  "open",
  "waiting_client",
  "waiting_astrologer",
  "consensus_reached",
  "closed"
] as const;

export const reviewModerationCaseMessageAuthorRoleValues = [
  "moderator",
  "client",
  "astrologer",
  "system"
] as const;

export const reviewModerationCaseMessageVisibilityValues = [
  "all_case_participants",
  "client_and_moderators",
  "astrologer_and_moderators",
  "moderators_only"
] as const;

export const reviewRatingAggregateScopeValues = ["astrologer", "product"] as const;

export const reviewAiReplyDraftStatusValues = [
  "pending",
  "succeeded",
  "failed",
  "superseded"
] as const;

export function formatReviewsSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
