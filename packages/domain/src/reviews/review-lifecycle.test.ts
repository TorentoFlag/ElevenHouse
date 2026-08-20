import { describe, expect, it } from "vitest";

import {
  approveReviewVersion,
  approveReviewReplyVersion,
  buildReviewPublicAuthor,
  createReviewCaseMessage,
  createReviewFirstPublishedFlowEvent,
  hideReviewByModeration,
  openReviewDispute,
  planSubmitReviewVersion,
  rejectReviewReplyVersion,
  rejectReviewVersion,
  restoreReviewAfterDispute,
  planSubmitReviewReplyVersion,
  updateReviewModerationCaseStatus,
  type ReviewLifecycleState,
  type ReviewableInstanceLifecycleState
} from "./review-lifecycle";

const ids = {
  reviewableInstanceId: "10000000-0000-4000-8000-000000000001",
  reviewId: "10000000-0000-4000-8000-000000000002",
  clientUserId: "10000000-0000-4000-8000-000000000003",
  astrologerUserId: "10000000-0000-4000-8000-000000000004",
  versionId: "10000000-0000-4000-8000-000000000005",
  pendingVersionId: "10000000-0000-4000-8000-000000000006",
  moderatorUserId: "10000000-0000-4000-8000-000000000007",
  caseId: "10000000-0000-4000-8000-000000000008",
  messageId: "10000000-0000-4000-8000-000000000009",
  moderationHideCaseId: "10000000-0000-4000-8000-000000000010",
  replyVersionId: "10000000-0000-4000-8000-000000000011",
  pendingReplyVersionId: "10000000-0000-4000-8000-000000000012",
  moderationHideMessageId: "10000000-0000-4000-8000-000000000013"
} as const;

const reviewableInstance = (
  overrides: Partial<ReviewableInstanceLifecycleState> = {}
): ReviewableInstanceLifecycleState => ({
  id: ids.reviewableInstanceId,
  clientUserId: ids.clientUserId,
  astrologerUserId: ids.astrologerUserId,
  status: "reviewable",
  receivedAt: "2026-08-10T10:00:00.000Z",
  reviewWindowClosesAt: "2026-08-24T10:00:00.000Z",
  ...overrides
});

const approvedReview = (overrides: Partial<ReviewLifecycleState> = {}): ReviewLifecycleState => ({
  id: ids.reviewId,
  reviewableInstanceId: ids.reviewableInstanceId,
  clientUserId: ids.clientUserId,
  astrologerUserId: ids.astrologerUserId,
  revision: 3,
  publicIdentityMode: "named",
  visibilityStatus: "visible",
  disputeStatus: "none",
  firstPublishedAt: "2026-08-12T10:00:00.000Z",
  activePublicVersion: {
    id: ids.versionId,
    versionNumber: 1,
    rating: 5,
    text: "Одобренный текст остается публичным.",
    publicIdentityMode: "named",
    moderationStatus: "approved",
    submittedAt: "2026-08-11T10:00:00.000Z",
    decidedAt: "2026-08-12T10:00:00.000Z"
  },
  pendingVersion: null,
  activePublicReplyVersion: null,
  pendingReplyVersion: null,
  ...overrides
});

describe("Review lifecycle domain policy", () => {
  it("creates a pending first review version only for the client within the open review window", () => {
    const planned = planSubmitReviewVersion({
      actorUserId: ids.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstance: reviewableInstance(),
      existingReview: null,
      nextReviewId: ids.reviewId,
      nextVersionId: ids.versionId,
      submission: {
        rating: 5,
        text: "Очень точная консультация.",
        publicIdentityMode: "secret_user"
      }
    });

    expect(planned).toMatchObject({
      kind: "create_review",
      review: {
        id: ids.reviewId,
        visibilityStatus: "not_public",
        publicIdentityMode: "secret_user"
      },
      version: {
        id: ids.versionId,
        versionNumber: 1,
        moderationStatus: "pending",
        publicIdentityMode: "secret_user"
      }
    });

    expect(
      planSubmitReviewVersion({
        actorUserId: ids.astrologerUserId,
        now: "2026-08-20T10:00:00.000Z",
        reviewableInstance: reviewableInstance(),
        existingReview: null,
        nextReviewId: ids.reviewId,
        nextVersionId: ids.versionId,
        submission: {
          rating: 5,
          text: "Чужой отзыв.",
          publicIdentityMode: "named"
        }
      })
    ).toMatchObject({ kind: "rejected", reason: "not_review_author" });

    expect(
      planSubmitReviewVersion({
        actorUserId: ids.clientUserId,
        now: "2026-08-24T10:00:00.000Z",
        reviewableInstance: reviewableInstance(),
        existingReview: null,
        nextReviewId: ids.reviewId,
        nextVersionId: ids.versionId,
        submission: {
          rating: 5,
          text: "Поздний отзыв.",
          publicIdentityMode: "named"
        }
      })
    ).toMatchObject({ kind: "rejected", reason: "review_window_closed" });
  });

  it("creates a pending edit while keeping the old approved version public", () => {
    const planned = planSubmitReviewVersion({
      actorUserId: ids.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstance: reviewableInstance({ status: "review_submitted" }),
      existingReview: approvedReview(),
      nextReviewId: ids.reviewId,
      nextVersionId: ids.pendingVersionId,
      submission: {
        rating: 4,
        text: "Обновленный текст ждет модерации.",
        publicIdentityMode: "named"
      }
    });

    expect(planned).toMatchObject({
      kind: "create_pending_version",
      keepActivePublicVersionId: ids.versionId,
      version: {
        id: ids.pendingVersionId,
        versionNumber: 2,
        moderationStatus: "pending"
      }
    });

    expect(
      planSubmitReviewVersion({
        actorUserId: ids.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        reviewableInstance: reviewableInstance({ status: "review_submitted" }),
        existingReview: approvedReview({
          pendingVersion: {
            id: ids.pendingVersionId,
            versionNumber: 2,
            rating: 4,
            text: "Уже есть pending.",
            publicIdentityMode: "named",
            moderationStatus: "pending",
            submittedAt: "2026-08-19T10:00:00.000Z",
            decidedAt: null
          }
        }),
        nextReviewId: ids.reviewId,
        nextVersionId: "10000000-0000-4000-8000-000000000010",
        submission: {
          rating: 3,
          text: "Дубликат pending.",
          publicIdentityMode: "named"
        }
      })
    ).toMatchObject({ kind: "rejected", reason: "pending_version_exists" });
  });

  it("publishes first approval once and does not fire Flow for later edits", () => {
    const firstApproval = approveReviewVersion({
      now: "2026-08-20T10:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      review: approvedReview({
        visibilityStatus: "not_public",
        firstPublishedAt: null,
        activePublicVersion: null,
        revision: 1,
        pendingVersion: {
          id: ids.versionId,
          versionNumber: 1,
          rating: 5,
          text: "Первый публичный отзыв.",
          publicIdentityMode: "named",
          moderationStatus: "pending",
          submittedAt: "2026-08-19T10:00:00.000Z",
          decidedAt: null
        }
      }),
      version: {
        id: ids.versionId,
        versionNumber: 1,
        rating: 5,
        text: "Первый публичный отзыв.",
        publicIdentityMode: "named",
        moderationStatus: "pending",
        submittedAt: "2026-08-19T10:00:00.000Z",
        decidedAt: null
      }
    });

    expect(firstApproval).toMatchObject({
      kind: "approved",
      review: {
        visibilityStatus: "visible",
        firstPublishedAt: "2026-08-20T10:00:00.000Z",
        activePublicVersion: { id: ids.versionId }
      },
      flowEvent: {
        eventType: "review_first_published",
        firstApprovedVersionId: ids.versionId
      }
    });

    const editApproval = approveReviewVersion({
      now: "2026-08-21T10:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      review: approvedReview({
        pendingVersion: {
          id: ids.pendingVersionId,
          versionNumber: 2,
          rating: 4,
          text: "Новая версия.",
          publicIdentityMode: "named",
          moderationStatus: "pending",
          submittedAt: "2026-08-20T12:00:00.000Z",
          decidedAt: null
        }
      }),
      version: {
        id: ids.pendingVersionId,
        versionNumber: 2,
        rating: 4,
        text: "Новая версия.",
        publicIdentityMode: "named",
        moderationStatus: "pending",
        submittedAt: "2026-08-20T12:00:00.000Z",
        decidedAt: null
      }
    });

    expect(editApproval).toMatchObject({
      kind: "approved",
      review: { activePublicVersion: { id: ids.pendingVersionId } },
      flowEvent: null
    });
  });

  it("rejects a pending review edit without replacing the old public version", () => {
    const result = rejectReviewVersion({
      now: "2026-08-21T10:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      reasonCode: "off_topic",
      note: "Не относится к услуге.",
      review: approvedReview({
        pendingVersion: {
          id: ids.pendingVersionId,
          versionNumber: 2,
          rating: 3,
          text: "Новая версия не пройдет.",
          publicIdentityMode: "named",
          moderationStatus: "pending",
          submittedAt: "2026-08-20T10:00:00.000Z",
          decidedAt: null
        }
      }),
      version: {
        id: ids.pendingVersionId,
        versionNumber: 2,
        rating: 3,
        text: "Новая версия не пройдет.",
        publicIdentityMode: "named",
        moderationStatus: "pending",
        submittedAt: "2026-08-20T10:00:00.000Z",
        decidedAt: null
      }
    });

    expect(result).toMatchObject({
      kind: "rejected",
      review: {
        activePublicVersion: { id: ids.versionId },
        pendingVersion: null,
        visibilityStatus: "visible"
      },
      version: {
        id: ids.pendingVersionId,
        moderationStatus: "rejected",
        moderationReasonCode: "off_topic"
      }
    });
  });

  it("keeps astrologer replies moderated and preserves the old approved reply on edit rejection", () => {
    const planned = planSubmitReviewReplyVersion({
      actorUserId: ids.astrologerUserId,
      now: "2026-08-20T10:00:00.000Z",
      review: approvedReview(),
      nextReplyVersionId: ids.replyVersionId,
      text: "Спасибо за отзыв."
    });

    expect(planned).toMatchObject({
      kind: "create_pending_reply_version",
      replyVersion: {
        id: ids.replyVersionId,
        versionNumber: 1,
        moderationStatus: "pending"
      }
    });

    const approvedReply = approveReviewReplyVersion({
      now: "2026-08-20T11:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      review: approvedReview({
        pendingReplyVersion: {
          id: ids.replyVersionId,
          versionNumber: 1,
          text: "Спасибо за отзыв.",
          moderationStatus: "pending",
          submittedAt: "2026-08-20T10:00:00.000Z",
          decidedAt: null
        }
      }),
      replyVersion: {
        id: ids.replyVersionId,
        versionNumber: 1,
        text: "Спасибо за отзыв.",
        moderationStatus: "pending",
        submittedAt: "2026-08-20T10:00:00.000Z",
        decidedAt: null
      }
    });

    expect(approvedReply).toMatchObject({
      kind: "approved",
      review: {
        activePublicReplyVersion: { id: ids.replyVersionId },
        pendingReplyVersion: null
      }
    });

    const rejectedEdit = rejectReviewReplyVersion({
      now: "2026-08-21T10:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      reasonCode: "abuse_or_hate",
      note: null,
      review: approvedReview({
        activePublicReplyVersion: {
          id: ids.replyVersionId,
          versionNumber: 1,
          text: "Спасибо за отзыв.",
          moderationStatus: "approved",
          submittedAt: "2026-08-20T10:00:00.000Z",
          decidedAt: "2026-08-20T11:00:00.000Z"
        },
        pendingReplyVersion: {
          id: ids.pendingReplyVersionId,
          versionNumber: 2,
          text: "Новая версия ответа.",
          moderationStatus: "pending",
          submittedAt: "2026-08-21T09:00:00.000Z",
          decidedAt: null
        }
      }),
      replyVersion: {
        id: ids.pendingReplyVersionId,
        versionNumber: 2,
        text: "Новая версия ответа.",
        moderationStatus: "pending",
        submittedAt: "2026-08-21T09:00:00.000Z",
        decidedAt: null
      }
    });

    expect(rejectedEdit).toMatchObject({
      kind: "rejected",
      review: {
        activePublicReplyVersion: { id: ids.replyVersionId },
        pendingReplyVersion: null
      },
      replyVersion: {
        id: ids.pendingReplyVersionId,
        moderationStatus: "rejected",
        moderationReasonCode: "abuse_or_hate"
      }
    });
  });

  it("opens a dispute by hiding the review and creating a case command", () => {
    const planned = openReviewDispute({
      actorUserId: ids.astrologerUserId,
      now: "2026-08-20T10:00:00.000Z",
      nextCaseId: ids.caseId,
      review: approvedReview(),
      reasonCode: "other"
    });

    expect(planned).toMatchObject({
      kind: "opened",
      review: {
        visibilityStatus: "temporarily_hidden_by_dispute",
        disputeStatus: "open"
      },
      moderationCase: {
        caseId: ids.caseId,
        status: "open",
        reasonCode: "other"
      }
    });

    expect(
      openReviewDispute({
        actorUserId: ids.astrologerUserId,
        now: "2026-08-20T10:00:00.000Z",
        nextCaseId: ids.caseId,
        review: approvedReview({ disputeStatus: "open" }),
        reasonCode: "other"
      })
    ).toMatchObject({ kind: "rejected", reason: "active_dispute_exists" });
  });

  it("restores a disputed review only through moderator decision and without creating a Flow event", () => {
    const result = restoreReviewAfterDispute({
      now: "2026-08-22T10:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      review: approvedReview({
        visibilityStatus: "temporarily_hidden_by_dispute",
        disputeStatus: "under_review"
      })
    });

    expect(result).toMatchObject({
      kind: "restored",
      review: {
        visibilityStatus: "visible",
        disputeStatus: "resolved_closed",
        activePublicVersion: { id: ids.versionId }
      },
      flowEvent: null
    });
  });

  it("hides public or disputed reviews by moderator decision with a closed audit case", () => {
    const visibleResult = hideReviewByModeration({
      now: "2026-08-22T11:00:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      review: approvedReview(),
      nextCaseId: ids.moderationHideCaseId,
      nextCaseMessageId: ids.moderationHideMessageId,
      reasonCode: "legal_risk",
      note: "Нужно снять публикацию по юридическому риску."
    });

    expect(visibleResult).toMatchObject({
      kind: "hidden",
      review: {
        revision: 4,
        visibilityStatus: "hidden_by_moderation",
        disputeStatus: "none",
        activePublicVersion: { id: ids.versionId }
      },
      moderationCase: {
        caseId: ids.moderationHideCaseId,
        reviewId: ids.reviewId,
        status: "closed",
        openedAt: "2026-08-22T11:00:00.000Z",
        closedAt: "2026-08-22T11:00:00.000Z",
        reasonCode: "legal_risk"
      },
      noteMessage: {
        messageId: ids.moderationHideMessageId,
        authorUserId: ids.moderatorUserId,
        authorRole: "moderator",
        visibility: "moderators_only",
        body: "Нужно снять публикацию по юридическому риску."
      }
    });

    expect(
      hideReviewByModeration({
        now: "2026-08-22T12:00:00.000Z",
        moderatorUserId: ids.moderatorUserId,
        review: approvedReview({
          visibilityStatus: "temporarily_hidden_by_dispute",
          disputeStatus: "open"
        }),
        nextCaseId: ids.moderationHideCaseId,
        nextCaseMessageId: null,
        reasonCode: "fraud_or_conflict",
        note: null
      })
    ).toMatchObject({
      kind: "hidden",
      review: {
        visibilityStatus: "hidden_by_moderation",
        disputeStatus: "resolved_closed"
      },
      noteMessage: null
    });
  });

  it("moves open moderation cases while keeping the disputed review hidden", () => {
    const result = updateReviewModerationCaseStatus({
      now: "2026-08-22T12:30:00.000Z",
      moderatorUserId: ids.moderatorUserId,
      targetStatus: "waiting_client",
      review: approvedReview({
        visibilityStatus: "temporarily_hidden_by_dispute",
        disputeStatus: "open"
      }),
      moderationCase: {
        caseId: ids.caseId,
        reviewId: ids.reviewId,
        status: "open",
        openedAt: "2026-08-20T10:00:00.000Z",
        closedAt: null,
        reasonCode: "other"
      }
    });

    expect(result).toMatchObject({
      kind: "updated",
      review: {
        visibilityStatus: "temporarily_hidden_by_dispute",
        disputeStatus: "waiting_client"
      },
      moderationCase: {
        caseId: ids.caseId,
        status: "waiting_client",
        closedAt: null
      }
    });

    expect(
      updateReviewModerationCaseStatus({
        now: "2026-08-22T12:30:00.000Z",
        moderatorUserId: ids.moderatorUserId,
        targetStatus: "waiting_client",
        review: approvedReview({
          visibilityStatus: "temporarily_hidden_by_dispute",
          disputeStatus: "resolved_closed"
        }),
        moderationCase: {
          caseId: ids.caseId,
          reviewId: ids.reviewId,
          status: "closed",
          openedAt: "2026-08-20T10:00:00.000Z",
          closedAt: "2026-08-21T10:00:00.000Z",
          reasonCode: "other"
        }
      })
    ).toMatchObject({ kind: "rejected", reason: "case_closed" });
  });

  it("keeps moderation case message visibility party-safe", () => {
    expect(
      createReviewCaseMessage({
        authorRole: "moderator",
        authorUserId: ids.moderatorUserId,
        body: "Клиенту отдельный вопрос.",
        caseId: ids.caseId,
        createdAt: "2026-08-20T10:00:00.000Z",
        messageId: ids.messageId,
        visibility: "client_and_moderators"
      })
    ).toMatchObject({ kind: "created", message: { visibility: "client_and_moderators" } });

    expect(
      createReviewCaseMessage({
        authorRole: "client",
        authorUserId: ids.clientUserId,
        body: "Скрыто только для модераторов нельзя.",
        caseId: ids.caseId,
        createdAt: "2026-08-20T10:00:00.000Z",
        messageId: ids.messageId,
        visibility: "moderators_only"
      })
    ).toMatchObject({ kind: "rejected", reason: "visibility_not_allowed_for_author" });
  });

  it("projects secret public authors and validates the first published Flow payload", () => {
    expect(
      buildReviewPublicAuthor({
        publicIdentityMode: "secret_user",
        firstName: "Анна",
        lastName: "Петрова",
        avatarUrl: "https://example.com/avatar.png"
      })
    ).toEqual({
      publicIdentityMode: "secret_user",
      displayName: "Секретный пользователь",
      initials: null,
      avatarUrl: null
    });

    expect(
      createReviewFirstPublishedFlowEvent({
        reviewId: ids.reviewId,
        reviewableInstanceId: ids.reviewableInstanceId,
        astrologerUserId: ids.astrologerUserId,
        clientUserId: ids.clientUserId,
        firstApprovedVersionId: ids.versionId,
        publishedAt: "2026-08-20T10:00:00.000Z"
      })
    ).toMatchObject({ eventType: "review_first_published" });
  });
});
