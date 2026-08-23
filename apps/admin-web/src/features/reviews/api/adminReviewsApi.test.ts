import { describe, expect, it, vi } from "vitest";
import { createAdminReviewsApi } from "./adminReviewsApi";

describe("createAdminReviewsApi", () => {
  it("loads moderation queue through the shared contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));
    const api = createAdminReviewsApi({ baseUrl: "https://admin.local", fetcher });

    await expect(api.listModerationQueue({ limit: 20, cursor: "cursor-1" })).resolves.toEqual({
      items: [],
      nextCursor: null
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.local/admin/reviews/moderation-queue?limit=20&cursor=cursor-1",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("sends csrf and idempotency headers for review decisions", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(reviewDetail()));
    const api = createAdminReviewsApi({
      baseUrl: "https://admin.local",
      fetcher,
      csrfTokenReader: () => "csrf-token"
    });

    await api.rejectReviewVersion(
      reviewDetail().reviewId,
      reviewDetail().versions[0]!.id,
      { reasonCode: "off_topic", note: "Не относится к услуге" },
      "decision-key"
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.local/admin/reviews/10000000-0000-4000-8000-000000000100/versions/10000000-0000-4000-8000-000000000101/reject",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "idempotency-key": "decision-key",
          "x-csrf-token": "csrf-token"
        }),
        body: JSON.stringify({ reasonCode: "off_topic", note: "Не относится к услуге" })
      })
    );
  });

  it("reconciles rating aggregates with csrf and idempotency headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        reviewId: reviewDetail().reviewId,
        astrologerUserId: "10000000-0000-4000-8000-000000000104",
        productIds: ["10000000-0000-4000-8000-000000000105"],
        aggregateRowsWritten: 2,
        reconciledAt: "2026-08-20T11:00:00.000Z"
      })
    );
    const api = createAdminReviewsApi({
      baseUrl: "https://admin.local",
      fetcher,
      csrfTokenReader: () => "csrf-token"
    });

    await expect(
      api.reconcileRatingAggregatesForReview(reviewDetail().reviewId, "reconcile-key")
    ).resolves.toMatchObject({
      aggregateRowsWritten: 2
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.local/admin/reviews/10000000-0000-4000-8000-000000000100/rating-aggregates/reconcile",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": "reconcile-key",
          "x-csrf-token": "csrf-token"
        })
      })
    );
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

function reviewDetail() {
  return {
    reviewId: "10000000-0000-4000-8000-000000000100",
    client: {
      clientUserId: "10000000-0000-4000-8000-000000000102",
      displayName: "Анна Петрова",
      initials: "АП",
      avatarUrl: null
    },
    publicIdentityMode: "named",
    visibilityStatus: "not_public",
    disputeStatus: "none",
    reviewableInstance: {
      id: "10000000-0000-4000-8000-000000000103",
      kind: "booking",
      status: "review_submitted",
      title: "Солярная консультация",
      contextLabel: "60 минут",
      receivedAt: "2026-08-19T10:00:00.000Z",
      reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt"
    },
    versions: [
      {
        id: "10000000-0000-4000-8000-000000000101",
        versionNumber: 1,
        rating: 5,
        text: "Очень помогло.",
        publicIdentityMode: "named",
        moderationStatus: "pending",
        moderationReasonCode: null,
        submittedAt: "2026-08-20T10:00:00.000Z",
        decidedAt: null
      }
    ],
    replyVersions: [],
    moderationCase: null,
    auditTrail: [],
    auditCursor: null
  };
}
