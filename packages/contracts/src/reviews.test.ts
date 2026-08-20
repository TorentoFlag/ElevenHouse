import { describe, expect, it } from "vitest";

import {
  reviewFirstPublicationFlowEventSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  reviewModerationCaseStatusUpdateSchema,
  reviewModerationQueueResponseSchema,
  reviewModerationReasonCodeSchema,
  reviewAstrologerListResponseSchema,
  reviewPublicListResponseSchema,
  clientReviewableInstanceListResponseSchema,
  reviewPublicAuthorSchema,
  reviewAdminDetailSchema,
  clientReviewDetailSchema,
  reviewPublicIdentityModeSchema,
  reviewPublicItemSchema,
  reviewVersionSubmissionSchema,
  reviewableInstanceKindSchema,
  reviewWindowPolicySchema
} from "./reviews";

describe("Reviews contracts", () => {
  it("accepts current reviewable instance kinds and window policies", () => {
    expect(reviewableInstanceKindSchema.parse("booking")).toBe("booking");
    expect(reviewableInstanceKindSchema.parse("pack_session")).toBe("pack_session");
    expect(reviewableInstanceKindSchema.parse("course_access")).toBe("course_access");
    expect(reviewableInstanceKindSchema.parse("gift_redemption")).toBe("gift_redemption");
    expect(reviewWindowPolicySchema.parse("standard_14_days_after_receipt")).toBe(
      "standard_14_days_after_receipt"
    );
    expect(reviewWindowPolicySchema.parse("active_period_plus_14_days")).toBe(
      "active_period_plus_14_days"
    );
  });

  it("validates submitted review versions by observable content rules", () => {
    expect(
      reviewVersionSubmissionSchema.parse({
        reviewableInstanceId: "10000000-0000-4000-8000-000000000001",
        rating: 5,
        text: "Очень полезная консультация.",
        publicIdentityMode: "named"
      })
    ).toMatchObject({ rating: 5, publicIdentityMode: "named" });

    expect(
      reviewVersionSubmissionSchema.safeParse({
        reviewableInstanceId: "10000000-0000-4000-8000-000000000001",
        rating: 0,
        text: "bad",
        publicIdentityMode: "named"
      }).success
    ).toBe(false);
    expect(
      reviewVersionSubmissionSchema.safeParse({
        reviewableInstanceId: "10000000-0000-4000-8000-000000000001",
        rating: 6,
        text: "bad",
        publicIdentityMode: "named"
      }).success
    ).toBe(false);
    expect(
      reviewVersionSubmissionSchema.safeParse({
        reviewableInstanceId: "10000000-0000-4000-8000-000000000001",
        rating: 5,
        text: "line\u0000break",
        publicIdentityMode: "named"
      }).success
    ).toBe(false);
  });

  it("keeps secret-user public projection free from real identity fields", () => {
    expect(reviewPublicIdentityModeSchema.parse("secret_user")).toBe("secret_user");
    expect(
      reviewPublicAuthorSchema.parse({
        publicIdentityMode: "secret_user",
        displayName: "Секретный пользователь",
        initials: null,
        avatarUrl: null
      })
    ).toMatchObject({ displayName: "Секретный пользователь" });

    expect(
      reviewPublicAuthorSchema.safeParse({
        publicIdentityMode: "secret_user",
        displayName: "Анна Петрова",
        initials: "АП",
        avatarUrl: null
      }).success
    ).toBe(false);
    expect(
      reviewPublicAuthorSchema.safeParse({
        publicIdentityMode: "secret_user",
        displayName: "Секретный пользователь",
        initials: null,
        avatarUrl: null,
        clientUserId: "10000000-0000-4000-8000-000000000002"
      }).success
    ).toBe(false);
  });

  it("names moderation reasons without viewpoint-based rejection", () => {
    expect(reviewModerationReasonCodeSchema.parse("not_service_related")).toBe(
      "not_service_related"
    );
    expect(reviewModerationReasonCodeSchema.safeParse("negative_sentiment").success).toBe(false);
    expect(reviewModerationReasonCodeSchema.safeParse("low_rating").success).toBe(false);
  });

  it("allows Flow only for first public publication event", () => {
    expect(
      reviewFirstPublicationFlowEventSchema.parse({
        eventType: "review_first_published",
        reviewId: "10000000-0000-4000-8000-000000000010",
        reviewableInstanceId: "10000000-0000-4000-8000-000000000011",
        astrologerUserId: "10000000-0000-4000-8000-000000000012",
        clientUserId: "10000000-0000-4000-8000-000000000013",
        firstApprovedVersionId: "10000000-0000-4000-8000-000000000014",
        publishedAt: "2026-08-20T10:00:00.000Z"
      })
    ).toMatchObject({ eventType: "review_first_published" });

    expect(
      reviewFirstPublicationFlowEventSchema.safeParse({
        eventType: "review_received",
        reviewId: "10000000-0000-4000-8000-000000000010",
        reviewableInstanceId: "10000000-0000-4000-8000-000000000011",
        astrologerUserId: "10000000-0000-4000-8000-000000000012",
        clientUserId: "10000000-0000-4000-8000-000000000013",
        firstApprovedVersionId: "10000000-0000-4000-8000-000000000014",
        publishedAt: "2026-08-20T10:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("separates client pending edits from the currently displayed approved version", () => {
    const parsed = clientReviewDetailSchema.parse({
      reviewId: "10000000-0000-4000-8000-000000000020",
      reviewableInstance: {
        id: "10000000-0000-4000-8000-000000000021",
        kind: "booking",
        status: "review_submitted",
        title: "Консультация по соляру",
        contextLabel: "60 минут",
        receivedAt: "2026-08-18T10:00:00.000Z",
        reviewWindowClosesAt: "2026-09-01T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt"
      },
      activePublicVersion: {
        id: "10000000-0000-4000-8000-000000000022",
        versionNumber: 1,
        rating: 5,
        text: "Первый одобренный текст.",
        publicIdentityMode: "named",
        moderationStatus: "approved",
        moderationReasonCode: null,
        submittedAt: "2026-08-18T11:00:00.000Z",
        decidedAt: "2026-08-18T12:00:00.000Z"
      },
      pendingVersion: {
        id: "10000000-0000-4000-8000-000000000023",
        versionNumber: 2,
        rating: 4,
        text: "Отредактированный текст ждет проверки.",
        publicIdentityMode: "named",
        moderationStatus: "pending",
        moderationReasonCode: null,
        submittedAt: "2026-08-19T11:00:00.000Z",
        decidedAt: null
      },
      canSubmitNewVersion: false,
      canEditLatestVersion: true
    });

    expect(parsed.activePublicVersion?.versionNumber).toBe(1);
    expect(parsed.pendingVersion?.moderationStatus).toBe("pending");

    expect(
      clientReviewDetailSchema.safeParse({
        ...parsed,
        activePublicVersion: { ...parsed.pendingVersion, moderationStatus: "pending" }
      }).success
    ).toBe(false);
  });

  it("represents a reviewable client service before the first review is submitted", () => {
    const parsed = clientReviewDetailSchema.parse({
      reviewId: null,
      reviewableInstance: {
        id: "10000000-0000-4000-8000-000000000024",
        kind: "astro_calendar_service_period",
        status: "reviewable",
        title: "Астрокалендарь",
        contextLabel: "Август 2026",
        receivedAt: "2026-08-01T00:00:00.000Z",
        reviewWindowClosesAt: "2026-09-14T00:00:00.000Z",
        windowPolicy: "active_period_plus_14_days"
      },
      activePublicVersion: null,
      pendingVersion: null,
      canSubmitNewVersion: true,
      canEditLatestVersion: false
    });

    expect(parsed.reviewId).toBeNull();
    expect(parsed.canSubmitNewVersion).toBe(true);
  });

  it("lists client-owned reviewable service instances without exposing other clients", () => {
    expect(
      clientReviewableInstanceListResponseSchema.parse({
        items: [
          {
            id: "10000000-0000-4000-8000-000000000025",
            kind: "async_delivery",
            status: "reviewable",
            title: "Письменный разбор",
            contextLabel: "Материал выдан",
            receivedAt: "2026-08-20T10:00:00.000Z",
            reviewWindowClosesAt: "2026-09-03T10:00:00.000Z",
            windowPolicy: "standard_14_days_after_receipt"
          }
        ],
        nextCursor: null
      }).items
    ).toHaveLength(1);
  });

  it("keeps public review lists anonymous and free from admin-only identity fields", () => {
    const parsed = reviewPublicListResponseSchema.parse({
      items: [
        {
          reviewId: "10000000-0000-4000-8000-000000000030",
          reviewableInstanceId: "10000000-0000-4000-8000-000000000031",
          astrologerUserId: "10000000-0000-4000-8000-000000000032",
          productId: null,
          title: "Астрокалендарь",
          contextLabel: "Август 2026",
          rating: 5,
          text: "Точно и полезно.",
          author: {
            publicIdentityMode: "secret_user",
            displayName: "Секретный пользователь",
            initials: null,
            avatarUrl: null
          },
          publishedAt: "2026-08-20T10:00:00.000Z",
          astrologerReply: null
        }
      ],
      nextCursor: null
    });

    expect(parsed.items[0]?.author.displayName).toBe("Секретный пользователь");
    expect(
      reviewPublicItemSchema.safeParse({
        ...parsed.items[0],
        clientUserId: "10000000-0000-4000-8000-000000000033"
      }).success
    ).toBe(false);
  });

  it("lets astrologers list owned reviews without anonymous client identity leakage", () => {
    const parsed = reviewAstrologerListResponseSchema.parse({
      items: [
        {
          reviewId: "10000000-0000-4000-8000-000000000034",
          visibilityStatus: "temporarily_hidden_by_dispute",
          disputeStatus: "open",
          reviewableInstance: {
            id: "10000000-0000-4000-8000-000000000035",
            kind: "booking",
            status: "review_submitted",
            title: "Солярная консультация",
            contextLabel: "60 минут",
            receivedAt: "2026-08-19T10:00:00.000Z",
            reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
            windowPolicy: "standard_14_days_after_receipt"
          },
          author: {
            publicIdentityMode: "secret_user",
            displayName: "Секретный пользователь",
            initials: null,
            avatarUrl: null
          },
          activePublicVersion: {
            id: "10000000-0000-4000-8000-000000000036",
            versionNumber: 1,
            rating: 5,
            text: "Одобренный текст.",
            publicIdentityMode: "secret_user",
            moderationStatus: "approved",
            moderationReasonCode: null,
            submittedAt: "2026-08-20T10:00:00.000Z",
            decidedAt: "2026-08-20T11:00:00.000Z"
          },
          activePublicReplyVersion: null,
          pendingReplyVersion: null,
          moderationCase: {
            caseId: "10000000-0000-4000-8000-000000000037",
            status: "open",
            openedAt: "2026-08-20T12:00:00.000Z",
            closedAt: null,
            reasonCode: "fraud_or_conflict"
          }
        }
      ],
      nextCursor: null
    });

    expect(parsed.items[0]?.author.displayName).toBe("Секретный пользователь");
    expect(JSON.stringify(parsed)).not.toContain("clientUserId");
  });

  it("lets admin projections include real client identity and full moderation context", () => {
    const parsed = reviewAdminDetailSchema.parse({
      reviewId: "10000000-0000-4000-8000-000000000040",
      client: {
        clientUserId: "10000000-0000-4000-8000-000000000041",
        displayName: "Анна Петрова",
        initials: "АП",
        avatarUrl: null
      },
      publicIdentityMode: "secret_user",
      visibilityStatus: "temporarily_hidden_by_dispute",
      disputeStatus: "open",
      reviewableInstance: {
        id: "10000000-0000-4000-8000-000000000042",
        kind: "astro_calendar_service_period",
        status: "review_submitted",
        title: "Астрокалендарь",
        contextLabel: "01.08-31.08",
        receivedAt: "2026-08-01T00:00:00.000Z",
        reviewWindowClosesAt: "2026-09-14T00:00:00.000Z",
        windowPolicy: "active_period_plus_14_days"
      },
      versions: [],
      replyVersions: [
        {
          id: "10000000-0000-4000-8000-000000000044",
          versionNumber: 1,
          text: "Спасибо за отзыв.",
          moderationStatus: "pending",
          moderationReasonCode: null,
          submittedAt: "2026-08-20T10:30:00.000Z",
          decidedAt: null
        }
      ],
      moderationCase: {
        caseId: "10000000-0000-4000-8000-000000000043",
        status: "open",
        openedAt: "2026-08-20T10:00:00.000Z",
        closedAt: null,
        reasonCode: "other"
      },
      auditCursor: "audit:1"
    });

    expect(parsed.client.displayName).toBe("Анна Петрова");
    expect(parsed.visibilityStatus).toBe("temporarily_hidden_by_dispute");
    expect(parsed.replyVersions[0]?.moderationStatus).toBe("pending");
  });

  it("models the admin moderation queue with explicit review or reply targets", () => {
    const parsed = reviewModerationQueueResponseSchema.parse({
      items: [
        {
          queueItemId: "review_version:10000000-0000-4000-8000-000000000061",
          kind: "review_version",
          reviewId: "10000000-0000-4000-8000-000000000060",
          reviewVersionId: "10000000-0000-4000-8000-000000000061",
          replyVersionId: null,
          submittedAt: "2026-08-20T10:00:00.000Z",
          client: {
            clientUserId: "10000000-0000-4000-8000-000000000062",
            displayName: "Анна Петрова",
            initials: "АП",
            avatarUrl: null
          },
          publicIdentityMode: "secret_user",
          visibilityStatus: "visible",
          disputeStatus: "none",
          reviewableInstance: {
            id: "10000000-0000-4000-8000-000000000063",
            kind: "booking",
            status: "review_submitted",
            title: "Консультация",
            contextLabel: "60 минут",
            receivedAt: "2026-08-19T10:00:00.000Z",
            reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
            windowPolicy: "standard_14_days_after_receipt"
          },
          rating: 5,
          text: "Текст отзыва на модерации."
        },
        {
          queueItemId: "reply_version:10000000-0000-4000-8000-000000000064",
          kind: "reply_version",
          reviewId: "10000000-0000-4000-8000-000000000060",
          reviewVersionId: null,
          replyVersionId: "10000000-0000-4000-8000-000000000064",
          submittedAt: "2026-08-20T11:00:00.000Z",
          client: {
            clientUserId: "10000000-0000-4000-8000-000000000062",
            displayName: "Анна Петрова",
            initials: "АП",
            avatarUrl: null
          },
          publicIdentityMode: "secret_user",
          visibilityStatus: "visible",
          disputeStatus: "none",
          reviewableInstance: {
            id: "10000000-0000-4000-8000-000000000063",
            kind: "booking",
            status: "review_submitted",
            title: "Консультация",
            contextLabel: "60 минут",
            receivedAt: "2026-08-19T10:00:00.000Z",
            reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
            windowPolicy: "standard_14_days_after_receipt"
          },
          rating: null,
          text: "Ответ астролога на модерации."
        }
      ],
      nextCursor: null
    });

    expect(parsed.items.map((item) => item.kind)).toEqual(["review_version", "reply_version"]);
    expect(
      reviewModerationQueueResponseSchema.safeParse({
        items: [
          {
            ...parsed.items[0],
            replyVersionId: "10000000-0000-4000-8000-000000000064"
          }
        ],
        nextCursor: null
      }).success
    ).toBe(false);
  });

  it("models moderation case communication visibility without leaking private threads", () => {
    const caseDetail = reviewModerationCaseDetailSchema.parse({
      caseId: "10000000-0000-4000-8000-000000000050",
      reviewId: "10000000-0000-4000-8000-000000000051",
      status: "waiting_client",
      openedAt: "2026-08-20T10:00:00.000Z",
      closedAt: null,
      serviceContext: {
        title: "Консультация",
        contextLabel: "Заказ #42"
      },
      messages: [
        {
          messageId: "10000000-0000-4000-8000-000000000052",
          authorRole: "moderator",
          visibility: "client_and_moderators",
          body: "Уточните, пожалуйста, что именно произошло.",
          createdAt: "2026-08-20T10:05:00.000Z"
        },
        {
          messageId: "10000000-0000-4000-8000-000000000053",
          authorRole: "client",
          visibility: "all_case_participants",
          body: "Готова обсудить решение.",
          createdAt: "2026-08-20T10:10:00.000Z"
        }
      ]
    });

    expect(caseDetail.messages.map((message) => message.visibility)).toEqual([
      "client_and_moderators",
      "all_case_participants"
    ]);

    expect(
      reviewModerationCaseMessageCreateSchema.parse({
        visibility: "astrologer_and_moderators",
        body: "Нужен ваш комментарий."
      })
    ).toMatchObject({ visibility: "astrologer_and_moderators" });
    expect(
      reviewModerationCaseMessageSchema.safeParse({
        messageId: "10000000-0000-4000-8000-000000000054",
        authorRole: "client",
        visibility: "moderators_only",
        body: "hidden",
        createdAt: "2026-08-20T10:20:00.000Z"
      }).success
    ).toBe(false);
  });

  it("allows moderators to move open review cases without using status update as a closing decision", () => {
    expect(reviewModerationCaseStatusUpdateSchema.parse({ status: "waiting_client" })).toEqual({
      status: "waiting_client"
    });
    expect(reviewModerationCaseStatusUpdateSchema.parse({ status: "consensus_reached" })).toEqual({
      status: "consensus_reached"
    });
    expect(reviewModerationCaseStatusUpdateSchema.safeParse({ status: "closed" }).success).toBe(
      false
    );
  });
});
