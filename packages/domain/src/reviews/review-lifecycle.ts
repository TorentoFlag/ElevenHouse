import {
  reviewFirstPublicationFlowEventSchema,
  type ReviewFirstPublicationFlowEvent,
  type ReviewModerationCaseMessageAuthorRole,
  type ReviewModerationCaseMessageVisibility,
  type ReviewModerationCaseStatus,
  type ReviewModerationReasonCode,
  type ReviewModerationStatus,
  type ReviewPublicAuthor,
  type ReviewPublicIdentityMode,
  type ReviewVisibilityStatus,
  type ReviewableInstanceStatus
} from "@elevenhouse/contracts";

export type ReviewableInstanceLifecycleState = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly status: ReviewableInstanceStatus;
  readonly receivedAt: string;
  readonly reviewWindowClosesAt: string;
};

export type ReviewVersionLifecycleState = {
  readonly id: string;
  readonly versionNumber: number;
  readonly rating: number;
  readonly text: string;
  readonly publicIdentityMode: ReviewPublicIdentityMode;
  readonly moderationStatus: ReviewModerationStatus;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
};

export type ReviewReplyVersionLifecycleState = {
  readonly id: string;
  readonly versionNumber: number;
  readonly text: string;
  readonly moderationStatus: ReviewModerationStatus;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
};

export type ReviewLifecycleState = {
  readonly id: string;
  readonly reviewableInstanceId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly revision: number;
  readonly publicIdentityMode: ReviewPublicIdentityMode;
  readonly visibilityStatus: ReviewVisibilityStatus;
  readonly disputeStatus:
    | "none"
    | "open"
    | "under_review"
    | "waiting_client"
    | "waiting_astrologer"
    | "resolved_closed";
  readonly firstPublishedAt: string | null;
  readonly activePublicVersion: ReviewVersionLifecycleState | null;
  readonly pendingVersion: ReviewVersionLifecycleState | null;
  readonly activePublicReplyVersion: ReviewReplyVersionLifecycleState | null;
  readonly pendingReplyVersion: ReviewReplyVersionLifecycleState | null;
};

export type ReviewSubmissionLifecycleInput = {
  readonly rating: number;
  readonly text: string;
  readonly publicIdentityMode: ReviewPublicIdentityMode;
};

export type SubmitReviewVersionResult =
  | {
      readonly kind: "create_review";
      readonly review: ReviewLifecycleState;
      readonly version: ReviewVersionLifecycleState;
    }
  | {
      readonly kind: "create_pending_version";
      readonly reviewId: string;
      readonly expectedReviewRevision: number;
      readonly keepActivePublicVersionId: string | null;
      readonly version: ReviewVersionLifecycleState;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "not_review_author"
        | "source_not_reviewable"
        | "review_window_closed"
        | "pending_version_exists";
    };

export type ApproveReviewVersionResult =
  | {
      readonly kind: "approved";
      readonly review: ReviewLifecycleState;
      readonly version: ReviewVersionLifecycleState;
      readonly flowEvent: ReviewFirstPublicationFlowEvent | null;
    }
  | {
      readonly kind: "already_approved";
      readonly review: ReviewLifecycleState;
      readonly version: ReviewVersionLifecycleState;
      readonly flowEvent: null;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "version_already_decided" | "not_review_version";
    };

export type RejectReviewVersionResult =
  | {
      readonly kind: "rejected";
      readonly review: ReviewLifecycleState;
      readonly version: ReviewRejectedVersionLifecycleState;
    }
  | {
      readonly kind: "already_rejected";
      readonly review: ReviewLifecycleState;
      readonly version: ReviewVersionLifecycleState;
    }
  | {
      readonly kind: "not_rejected";
      readonly reason: "version_already_decided" | "not_review_version";
    };

export type ReviewRejectedVersionLifecycleState = ReviewVersionLifecycleState & {
  readonly moderationStatus: "rejected";
  readonly moderationReasonCode: ReviewModerationReasonCode;
  readonly moderationNote: string | null;
  readonly decidedByUserId: string;
};

export type ReviewRejectedReplyVersionLifecycleState = ReviewReplyVersionLifecycleState & {
  readonly moderationStatus: "rejected";
  readonly moderationReasonCode: ReviewModerationReasonCode;
  readonly moderationNote: string | null;
  readonly decidedByUserId: string;
};

export type SubmitReviewReplyVersionResult =
  | {
      readonly kind: "create_pending_reply_version";
      readonly reviewId: string;
      readonly expectedReviewRevision: number;
      readonly keepActivePublicReplyVersionId: string | null;
      readonly replyVersion: ReviewReplyVersionLifecycleState;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "not_review_astrologer" | "review_not_public" | "pending_reply_exists";
    };

export type ApproveReviewReplyVersionResult =
  | {
      readonly kind: "approved";
      readonly review: ReviewLifecycleState;
      readonly replyVersion: ReviewReplyVersionLifecycleState;
    }
  | {
      readonly kind: "already_approved";
      readonly review: ReviewLifecycleState;
      readonly replyVersion: ReviewReplyVersionLifecycleState;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "reply_already_decided" | "not_review_reply_version";
    };

export type RejectReviewReplyVersionResult =
  | {
      readonly kind: "rejected";
      readonly review: ReviewLifecycleState;
      readonly replyVersion: ReviewRejectedReplyVersionLifecycleState;
    }
  | {
      readonly kind: "already_rejected";
      readonly review: ReviewLifecycleState;
      readonly replyVersion: ReviewReplyVersionLifecycleState;
    }
  | {
      readonly kind: "not_rejected";
      readonly reason: "reply_already_decided" | "not_review_reply_version";
    };

export type OpenReviewDisputeResult =
  | {
      readonly kind: "opened";
      readonly review: ReviewLifecycleState;
      readonly moderationCase: ReviewModerationCaseLifecycleState;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "not_review_astrologer" | "active_dispute_exists" | "review_not_public";
    };

export type RestoreReviewAfterDisputeResult =
  | {
      readonly kind: "restored";
      readonly review: ReviewLifecycleState;
      readonly flowEvent: null;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "review_not_public" | "no_active_dispute";
    };

export type HideReviewByModerationResult =
  | {
      readonly kind: "hidden";
      readonly review: ReviewLifecycleState;
      readonly moderationCase: ReviewModerationCaseLifecycleState;
      readonly noteMessage: ReviewCaseMessageLifecycleState | null;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "review_not_public" | "already_hidden_by_moderation";
    };

export type ReviewModerationCaseOpenStatus = Exclude<ReviewModerationCaseStatus, "closed">;

export type UpdateReviewModerationCaseStatusResult =
  | {
      readonly kind: "updated";
      readonly review: ReviewLifecycleState;
      readonly moderationCase: ReviewModerationCaseLifecycleState;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "case_closed" | "not_review_case" | "review_not_in_dispute";
    };

export type ReviewModerationCaseLifecycleState = {
  readonly caseId: string;
  readonly reviewId: string;
  readonly status: ReviewModerationCaseStatus;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly reasonCode: ReviewModerationReasonCode;
};

export type ReviewCaseMessageLifecycleState = {
  readonly messageId: string;
  readonly caseId: string;
  readonly authorUserId: string | null;
  readonly authorRole: ReviewModerationCaseMessageAuthorRole;
  readonly visibility: ReviewModerationCaseMessageVisibility;
  readonly body: string;
  readonly createdAt: string;
};

export type CreateReviewCaseMessageResult =
  | {
      readonly kind: "created";
      readonly message: ReviewCaseMessageLifecycleState;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "visibility_not_allowed_for_author" | "case_closed" | "not_review_case";
    };

export function planSubmitReviewVersion(input: {
  readonly actorUserId: string;
  readonly now: string;
  readonly reviewableInstance: ReviewableInstanceLifecycleState;
  readonly existingReview: ReviewLifecycleState | null;
  readonly nextReviewId: string;
  readonly nextVersionId: string;
  readonly submission: ReviewSubmissionLifecycleInput;
}): SubmitReviewVersionResult {
  if (input.actorUserId !== input.reviewableInstance.clientUserId) {
    return { kind: "rejected", reason: "not_review_author" };
  }
  if (!isReviewableSourceStatus(input.reviewableInstance.status, input.existingReview)) {
    return { kind: "rejected", reason: "source_not_reviewable" };
  }
  if (!isWithinReviewWindow(input.now, input.reviewableInstance)) {
    return { kind: "rejected", reason: "review_window_closed" };
  }

  const version = createPendingReviewVersion({
    id: input.nextVersionId,
    versionNumber: nextReviewVersionNumber(input.existingReview),
    now: input.now,
    submission: input.submission
  });

  if (!input.existingReview) {
    const review: ReviewLifecycleState = {
      id: input.nextReviewId,
      reviewableInstanceId: input.reviewableInstance.id,
      clientUserId: input.reviewableInstance.clientUserId,
      astrologerUserId: input.reviewableInstance.astrologerUserId,
      revision: 1,
      publicIdentityMode: input.submission.publicIdentityMode,
      visibilityStatus: "not_public",
      disputeStatus: "none",
      firstPublishedAt: null,
      activePublicVersion: null,
      pendingVersion: version,
      activePublicReplyVersion: null,
      pendingReplyVersion: null
    };
    return { kind: "create_review", review, version };
  }

  if (input.existingReview.pendingVersion) {
    return { kind: "rejected", reason: "pending_version_exists" };
  }

  return {
    kind: "create_pending_version",
    reviewId: input.existingReview.id,
    expectedReviewRevision: input.existingReview.revision,
    keepActivePublicVersionId: input.existingReview.activePublicVersion?.id ?? null,
    version
  };
}

export function approveReviewVersion(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly review: ReviewLifecycleState;
  readonly version: ReviewVersionLifecycleState;
}): ApproveReviewVersionResult {
  if (input.version.moderationStatus === "approved") {
    if (input.review.activePublicVersion?.id !== input.version.id) {
      return { kind: "rejected", reason: "not_review_version" };
    }
    return {
      kind: "already_approved",
      review: input.review,
      version: input.version,
      flowEvent: null
    };
  }
  if (input.version.moderationStatus !== "pending") {
    return { kind: "rejected", reason: "version_already_decided" };
  }
  const knownVersionIds = [
    input.review.activePublicVersion?.id ?? null,
    input.review.pendingVersion?.id ?? null
  ];
  if (input.review.pendingVersion && input.review.pendingVersion.id !== input.version.id) {
    return { kind: "rejected", reason: "not_review_version" };
  }
  if (!input.review.pendingVersion && knownVersionIds.every((id) => id !== input.version.id)) {
    return { kind: "rejected", reason: "not_review_version" };
  }

  const approvedVersion: ReviewVersionLifecycleState = {
    ...input.version,
    moderationStatus: "approved",
    decidedAt: input.now
  };
  const isFirstPublication = input.review.firstPublishedAt === null;
  const review: ReviewLifecycleState = {
    ...input.review,
    revision: input.review.revision + 1,
    publicIdentityMode: approvedVersion.publicIdentityMode,
    visibilityStatus:
      input.review.visibilityStatus === "temporarily_hidden_by_dispute"
        ? "temporarily_hidden_by_dispute"
        : "visible",
    firstPublishedAt: input.review.firstPublishedAt ?? input.now,
    activePublicVersion: approvedVersion,
    pendingVersion:
      input.review.pendingVersion?.id === approvedVersion.id ? null : input.review.pendingVersion
  };

  return {
    kind: "approved",
    review,
    version: approvedVersion,
    flowEvent: isFirstPublication
      ? createReviewFirstPublishedFlowEvent({
          reviewId: review.id,
          reviewableInstanceId: review.reviewableInstanceId,
          astrologerUserId: review.astrologerUserId,
          clientUserId: review.clientUserId,
          firstApprovedVersionId: approvedVersion.id,
          publishedAt: input.now
        })
      : null
  };
}

export function rejectReviewVersion(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly reasonCode: ReviewModerationReasonCode;
  readonly note: string | null;
  readonly review: ReviewLifecycleState;
  readonly version: ReviewVersionLifecycleState;
}): RejectReviewVersionResult {
  if (input.version.moderationStatus === "rejected") {
    return { kind: "already_rejected", review: input.review, version: input.version };
  }
  if (input.version.moderationStatus !== "pending") {
    return { kind: "not_rejected", reason: "version_already_decided" };
  }
  if (!input.review.pendingVersion || input.review.pendingVersion.id !== input.version.id) {
    return { kind: "not_rejected", reason: "not_review_version" };
  }

  return {
    kind: "rejected",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      pendingVersion: null
    },
    version: {
      ...input.version,
      moderationStatus: "rejected",
      moderationReasonCode: input.reasonCode,
      moderationNote: input.note,
      decidedAt: input.now,
      decidedByUserId: input.moderatorUserId
    }
  };
}

export function planSubmitReviewReplyVersion(input: {
  readonly actorUserId: string;
  readonly now: string;
  readonly review: ReviewLifecycleState;
  readonly nextReplyVersionId: string;
  readonly text: string;
}): SubmitReviewReplyVersionResult {
  if (input.actorUserId !== input.review.astrologerUserId) {
    return { kind: "rejected", reason: "not_review_astrologer" };
  }
  if (!input.review.activePublicVersion) {
    return { kind: "rejected", reason: "review_not_public" };
  }
  if (input.review.pendingReplyVersion) {
    return { kind: "rejected", reason: "pending_reply_exists" };
  }

  const replyVersion: ReviewReplyVersionLifecycleState = {
    id: input.nextReplyVersionId,
    versionNumber: nextReplyVersionNumber(input.review),
    text: input.text,
    moderationStatus: "pending",
    submittedAt: input.now,
    decidedAt: null
  };

  return {
    kind: "create_pending_reply_version",
    reviewId: input.review.id,
    expectedReviewRevision: input.review.revision,
    keepActivePublicReplyVersionId: input.review.activePublicReplyVersion?.id ?? null,
    replyVersion
  };
}

export function approveReviewReplyVersion(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly review: ReviewLifecycleState;
  readonly replyVersion: ReviewReplyVersionLifecycleState;
}): ApproveReviewReplyVersionResult {
  if (input.replyVersion.moderationStatus === "approved") {
    if (input.review.activePublicReplyVersion?.id !== input.replyVersion.id) {
      return { kind: "rejected", reason: "not_review_reply_version" };
    }
    return { kind: "already_approved", review: input.review, replyVersion: input.replyVersion };
  }
  if (input.replyVersion.moderationStatus !== "pending") {
    return { kind: "rejected", reason: "reply_already_decided" };
  }
  if (
    input.review.pendingReplyVersion &&
    input.review.pendingReplyVersion.id !== input.replyVersion.id
  ) {
    return { kind: "rejected", reason: "not_review_reply_version" };
  }
  if (
    !input.review.pendingReplyVersion &&
    input.review.activePublicReplyVersion?.id !== input.replyVersion.id
  ) {
    return { kind: "rejected", reason: "not_review_reply_version" };
  }

  const approvedReplyVersion: ReviewReplyVersionLifecycleState = {
    ...input.replyVersion,
    moderationStatus: "approved",
    decidedAt: input.now
  };

  return {
    kind: "approved",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      activePublicReplyVersion: approvedReplyVersion,
      pendingReplyVersion:
        input.review.pendingReplyVersion?.id === approvedReplyVersion.id
          ? null
          : input.review.pendingReplyVersion
    },
    replyVersion: approvedReplyVersion
  };
}

export function rejectReviewReplyVersion(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly reasonCode: ReviewModerationReasonCode;
  readonly note: string | null;
  readonly review: ReviewLifecycleState;
  readonly replyVersion: ReviewReplyVersionLifecycleState;
}): RejectReviewReplyVersionResult {
  if (input.replyVersion.moderationStatus === "rejected") {
    return { kind: "already_rejected", review: input.review, replyVersion: input.replyVersion };
  }
  if (input.replyVersion.moderationStatus !== "pending") {
    return { kind: "not_rejected", reason: "reply_already_decided" };
  }
  if (
    !input.review.pendingReplyVersion ||
    input.review.pendingReplyVersion.id !== input.replyVersion.id
  ) {
    return { kind: "not_rejected", reason: "not_review_reply_version" };
  }

  return {
    kind: "rejected",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      pendingReplyVersion: null
    },
    replyVersion: {
      ...input.replyVersion,
      moderationStatus: "rejected",
      moderationReasonCode: input.reasonCode,
      moderationNote: input.note,
      decidedAt: input.now,
      decidedByUserId: input.moderatorUserId
    }
  };
}

export function openReviewDispute(input: {
  readonly actorUserId: string;
  readonly now: string;
  readonly nextCaseId: string;
  readonly review: ReviewLifecycleState;
  readonly reasonCode: ReviewModerationReasonCode;
}): OpenReviewDisputeResult {
  if (input.actorUserId !== input.review.astrologerUserId) {
    return { kind: "rejected", reason: "not_review_astrologer" };
  }
  if (
    ["open", "under_review", "waiting_client", "waiting_astrologer"].includes(
      input.review.disputeStatus
    )
  ) {
    return { kind: "rejected", reason: "active_dispute_exists" };
  }
  if (!input.review.activePublicVersion) {
    return { kind: "rejected", reason: "review_not_public" };
  }

  return {
    kind: "opened",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      visibilityStatus: "temporarily_hidden_by_dispute",
      disputeStatus: "open"
    },
    moderationCase: {
      caseId: input.nextCaseId,
      reviewId: input.review.id,
      status: "open",
      openedAt: input.now,
      closedAt: null,
      reasonCode: input.reasonCode
    }
  };
}

export function restoreReviewAfterDispute(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly review: ReviewLifecycleState;
}): RestoreReviewAfterDisputeResult {
  if (!input.review.activePublicVersion) return { kind: "rejected", reason: "review_not_public" };
  if (
    !["open", "under_review", "waiting_client", "waiting_astrologer"].includes(
      input.review.disputeStatus
    )
  ) {
    return { kind: "rejected", reason: "no_active_dispute" };
  }

  return {
    kind: "restored",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      visibilityStatus: "visible",
      disputeStatus: "resolved_closed"
    },
    flowEvent: null
  };
}

export function hideReviewByModeration(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly review: ReviewLifecycleState;
  readonly nextCaseId: string;
  readonly nextCaseMessageId: string | null;
  readonly reasonCode: ReviewModerationReasonCode;
  readonly note: string | null;
}): HideReviewByModerationResult {
  if (!input.review.activePublicVersion) return { kind: "rejected", reason: "review_not_public" };
  if (input.review.visibilityStatus === "hidden_by_moderation") {
    return { kind: "rejected", reason: "already_hidden_by_moderation" };
  }
  if (
    input.review.visibilityStatus !== "visible" &&
    input.review.visibilityStatus !== "temporarily_hidden_by_dispute"
  ) {
    return { kind: "rejected", reason: "review_not_public" };
  }

  return {
    kind: "hidden",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      visibilityStatus: "hidden_by_moderation",
      disputeStatus: isActiveDisputeStatus(input.review.disputeStatus)
        ? "resolved_closed"
        : input.review.disputeStatus
    },
    moderationCase: {
      caseId: input.nextCaseId,
      reviewId: input.review.id,
      status: "closed",
      openedAt: input.now,
      closedAt: input.now,
      reasonCode: input.reasonCode
    },
    noteMessage:
      input.note && input.nextCaseMessageId
        ? {
            messageId: input.nextCaseMessageId,
            caseId: input.nextCaseId,
            authorUserId: input.moderatorUserId,
            authorRole: "moderator",
            visibility: "moderators_only",
            body: input.note,
            createdAt: input.now
          }
        : null
  };
}

export function updateReviewModerationCaseStatus(input: {
  readonly now: string;
  readonly moderatorUserId: string;
  readonly targetStatus: ReviewModerationCaseOpenStatus;
  readonly review: ReviewLifecycleState;
  readonly moderationCase: ReviewModerationCaseLifecycleState;
}): UpdateReviewModerationCaseStatusResult {
  void input.now;
  void input.moderatorUserId;
  if (input.moderationCase.reviewId !== input.review.id) {
    return { kind: "rejected", reason: "not_review_case" };
  }
  if (input.moderationCase.status === "closed") {
    return { kind: "rejected", reason: "case_closed" };
  }
  if (
    input.review.visibilityStatus !== "temporarily_hidden_by_dispute" ||
    !isActiveDisputeStatus(input.review.disputeStatus)
  ) {
    return { kind: "rejected", reason: "review_not_in_dispute" };
  }

  return {
    kind: "updated",
    review: {
      ...input.review,
      revision: input.review.revision + 1,
      disputeStatus: mapCaseStatusToDisputeStatus(input.targetStatus),
      visibilityStatus: "temporarily_hidden_by_dispute"
    },
    moderationCase: {
      ...input.moderationCase,
      status: input.targetStatus,
      closedAt: null
    }
  };
}

export function createReviewCaseMessage(input: {
  readonly messageId: string;
  readonly caseId: string;
  readonly moderationCase?: ReviewModerationCaseLifecycleState;
  readonly authorUserId: string | null;
  readonly authorRole: ReviewModerationCaseMessageAuthorRole;
  readonly visibility: ReviewModerationCaseMessageVisibility;
  readonly body: string;
  readonly createdAt: string;
}): CreateReviewCaseMessageResult {
  if (input.moderationCase) {
    if (input.moderationCase.caseId !== input.caseId) {
      return { kind: "rejected", reason: "not_review_case" };
    }
    if (input.moderationCase.status === "closed") {
      return { kind: "rejected", reason: "case_closed" };
    }
  }
  if (!isCaseMessageVisibilityAllowed(input.authorRole, input.visibility)) {
    return { kind: "rejected", reason: "visibility_not_allowed_for_author" };
  }
  return {
    kind: "created",
    message: {
      messageId: input.messageId,
      caseId: input.caseId,
      authorUserId: input.authorUserId,
      authorRole: input.authorRole,
      visibility: input.visibility,
      body: input.body,
      createdAt: input.createdAt
    }
  };
}

export function buildReviewPublicAuthor(input: {
  readonly publicIdentityMode: ReviewPublicIdentityMode;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly avatarUrl: string | null;
}): ReviewPublicAuthor {
  if (input.publicIdentityMode === "secret_user") {
    return {
      publicIdentityMode: "secret_user",
      displayName: "Секретный пользователь",
      initials: null,
      avatarUrl: null
    };
  }

  const firstName = normalizeNamePart(input.firstName);
  const lastName = normalizeNamePart(input.lastName ?? "");
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  return {
    publicIdentityMode: "named",
    displayName,
    initials: buildInitials(firstName, lastName),
    avatarUrl: input.avatarUrl
  };
}

export function createReviewFirstPublishedFlowEvent(
  input: Omit<ReviewFirstPublicationFlowEvent, "eventType">
): ReviewFirstPublicationFlowEvent {
  return reviewFirstPublicationFlowEventSchema.parse({
    eventType: "review_first_published",
    ...input
  });
}

function createPendingReviewVersion(input: {
  readonly id: string;
  readonly versionNumber: number;
  readonly now: string;
  readonly submission: ReviewSubmissionLifecycleInput;
}): ReviewVersionLifecycleState {
  return {
    id: input.id,
    versionNumber: input.versionNumber,
    rating: input.submission.rating,
    text: input.submission.text,
    publicIdentityMode: input.submission.publicIdentityMode,
    moderationStatus: "pending",
    submittedAt: input.now,
    decidedAt: null
  };
}

function isReviewableSourceStatus(
  status: ReviewableInstanceStatus,
  existingReview: ReviewLifecycleState | null
): boolean {
  return status === "reviewable" || (status === "review_submitted" && existingReview !== null);
}

function isWithinReviewWindow(
  now: string,
  reviewableInstance: ReviewableInstanceLifecycleState
): boolean {
  const nowMs = Date.parse(now);
  return (
    nowMs >= Date.parse(reviewableInstance.receivedAt) &&
    nowMs < Date.parse(reviewableInstance.reviewWindowClosesAt)
  );
}

function nextReviewVersionNumber(review: ReviewLifecycleState | null): number {
  if (!review) return 1;
  return (
    Math.max(
      review.activePublicVersion?.versionNumber ?? 0,
      review.pendingVersion?.versionNumber ?? 0
    ) + 1
  );
}

function nextReplyVersionNumber(review: ReviewLifecycleState): number {
  return (
    Math.max(
      review.activePublicReplyVersion?.versionNumber ?? 0,
      review.pendingReplyVersion?.versionNumber ?? 0
    ) + 1
  );
}

function isCaseMessageVisibilityAllowed(
  authorRole: ReviewModerationCaseMessageAuthorRole,
  visibility: ReviewModerationCaseMessageVisibility
): boolean {
  if (authorRole === "moderator") return true;
  if (authorRole === "client") {
    return visibility === "client_and_moderators";
  }
  if (authorRole === "astrologer") {
    return visibility === "astrologer_and_moderators";
  }
  return visibility === "all_case_participants" || visibility === "moderators_only";
}

function normalizeNamePart(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildInitials(firstName: string, lastName: string): string {
  if (lastName) return `${firstName.slice(0, 1)}${lastName.slice(0, 1)}`.toUpperCase();
  return firstName.slice(0, 2).toUpperCase();
}

function isActiveDisputeStatus(status: ReviewLifecycleState["disputeStatus"]): boolean {
  return ["open", "under_review", "waiting_client", "waiting_astrologer"].includes(status);
}

function mapCaseStatusToDisputeStatus(
  status: ReviewModerationCaseOpenStatus
): ReviewLifecycleState["disputeStatus"] {
  if (status === "consensus_reached") return "under_review";
  return status;
}
