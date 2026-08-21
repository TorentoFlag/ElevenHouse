import { describe, expect, it } from "vitest";
import type { ReviewDisputeStatus, ReviewModerationQueueItem } from "@elevenhouse/contracts";
import {
  queueItemLabel,
  caseMessageAuthorLabel,
  caseMessageVisibilityLabel,
  moderationStatusLabel,
  pendingReplyVersion,
  pendingReviewVersion,
  summarizeModerationQueue
} from "./reviewsModerationPresentation";

describe("reviews moderation presentation", () => {
  it("summarizes queue by target kind and disputes", () => {
    expect(
      summarizeModerationQueue([
        queueItem("review_version", "none"),
        queueItem("reply_version", "open"),
        queueItem("moderation_case", "waiting_client")
      ])
    ).toEqual({
      total: 3,
      reviewVersions: 1,
      replyVersions: 1,
      moderationCases: 1,
      disputed: 2
    });
  });

  it("labels queue targets including open disputes", () => {
    expect(queueItemLabel(queueItem("review_version", "none"))).toBe("Отзыв клиента");
    expect(queueItemLabel(queueItem("reply_version", "none"))).toBe("Ответ астролога");
    expect(queueItemLabel(queueItem("moderation_case", "open"))).toBe("Спор по отзыву");
  });

  it("picks pending review and reply targets from detail", () => {
    const detail = {
      versions: [
        { id: "approved", moderationStatus: "approved" },
        { id: "pending-review", moderationStatus: "pending" }
      ],
      replyVersions: [{ id: "pending-reply", moderationStatus: "pending" }]
    } as Parameters<typeof pendingReviewVersion>[0];

    expect(pendingReviewVersion(detail)?.id).toBe("pending-review");
    expect(pendingReplyVersion(detail)?.id).toBe("pending-reply");
  });

  it("labels moderation statuses and case messages for moderators", () => {
    expect(moderationStatusLabel("pending")).toBe("На модерации");
    expect(moderationStatusLabel("approved")).toBe("Одобрено");
    expect(moderationStatusLabel("rejected")).toBe("Отклонено");
    expect(caseMessageAuthorLabel("moderator")).toBe("Модератор");
    expect(caseMessageAuthorLabel("client")).toBe("Клиент");
    expect(caseMessageVisibilityLabel("all_case_participants")).toBe("Клиент и астролог");
    expect(caseMessageVisibilityLabel("moderators_only")).toBe("Только модераторы");
  });
});

function queueItem(
  kind: "review_version" | "reply_version" | "moderation_case",
  disputeStatus: ReviewDisputeStatus
): ReviewModerationQueueItem {
  return {
    kind,
    disputeStatus,
    queueItemId: `${kind}:${disputeStatus}`,
    reviewId: "10000000-0000-4000-8000-000000000001",
    reviewVersionId: kind === "review_version" ? "10000000-0000-4000-8000-000000000002" : null,
    replyVersionId: kind === "reply_version" ? "10000000-0000-4000-8000-000000000003" : null,
    caseId: kind === "moderation_case" ? "10000000-0000-4000-8000-000000000006" : null,
    caseStatus: kind === "moderation_case" ? "open" : null,
    submittedAt: "2026-08-20T10:00:00.000Z",
    client: {
      clientUserId: "10000000-0000-4000-8000-000000000004",
      displayName: "Анна Петрова",
      initials: "АП",
      avatarUrl: null
    },
    publicIdentityMode: "named",
    visibilityStatus: "not_public",
    reviewableInstance: {
      id: "10000000-0000-4000-8000-000000000005",
      kind: "booking",
      status: "review_submitted",
      title: "Солярная консультация",
      contextLabel: "60 минут",
      receivedAt: "2026-08-20T10:00:00.000Z",
      reviewWindowClosesAt: "2026-09-03T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt"
    },
    rating: kind === "review_version" ? 5 : null,
    text: "Текст для модерации"
  };
}
