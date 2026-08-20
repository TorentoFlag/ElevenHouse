import { describe, expect, it } from "vitest";

import {
  reviewFirstPublicationFlowEventSchema,
  reviewModerationReasonCodeSchema,
  reviewPublicAuthorSchema,
  reviewPublicIdentityModeSchema,
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
});
