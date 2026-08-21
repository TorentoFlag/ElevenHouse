import type { ClientReviewDetail } from "@elevenhouse/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClientReviewDetail,
  getClientReviewModerationCaseDetail,
  listClientReviewableInstances,
  submitClientReviewVersion
} from "./clientReviewsApi";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../Application", () => ({ application: { http } }));

describe("clientReviewsApi", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
  });

  it("lists client reviewable instances through public me reviews", async () => {
    http.get.mockResolvedValueOnce({ items: [reviewDetail.reviewableInstance], nextCursor: null });

    await expect(listClientReviewableInstances({ limit: 10 })).resolves.toEqual({
      items: [reviewDetail.reviewableInstance],
      nextCursor: null
    });
    expect(http.get).toHaveBeenCalledWith("/me/reviews/reviewable-instances?limit=10");
  });

  it("reads detail for one reviewable instance", async () => {
    http.get.mockResolvedValueOnce(reviewDetail);

    await expect(getClientReviewDetail(reviewableInstanceId)).resolves.toEqual(reviewDetail);
    expect(http.get).toHaveBeenCalledWith(
      `/me/reviews/reviewable-instances/${reviewableInstanceId}`
    );
  });

  it("submits review versions with csrf and idempotency", async () => {
    http.post.mockResolvedValueOnce({ ...reviewDetail, pendingVersion: pendingVersion });

    await submitClientReviewVersion(
      {
        reviewableInstanceId,
        rating: 5,
        text: "Очень точная консультация",
        publicIdentityMode: "secret_user"
      },
      "client-review-submit-1"
    );

    expect(http.post).toHaveBeenCalledWith(
      "/me/reviews/versions",
      {
        reviewableInstanceId,
        rating: 5,
        text: "Очень точная консультация",
        publicIdentityMode: "secret_user"
      },
      { csrf: true, idempotencyKey: "client-review-submit-1" }
    );
  });

  it("reads moderation case detail for the current client", async () => {
    http.get.mockResolvedValueOnce(caseDetail);

    await expect(getClientReviewModerationCaseDetail(caseId)).resolves.toEqual(caseDetail);
    expect(http.get).toHaveBeenCalledWith(`/me/reviews/moderation-cases/${caseId}`);
  });
});

const reviewableInstanceId = "10000000-0000-4000-8000-000000000103";
const caseId = "10000000-0000-4000-8000-000000000108";
const pendingVersion = {
  id: "10000000-0000-4000-8000-000000000104",
  versionNumber: 1,
  rating: 5,
  text: "Очень точная консультация",
  publicIdentityMode: "secret_user",
  moderationStatus: "pending",
  moderationReasonCode: null,
  submittedAt: "2026-08-21T09:00:00.000Z",
  decidedAt: null
} satisfies ClientReviewDetail["pendingVersion"];

const reviewDetail = {
  reviewId: null,
  reviewableInstance: {
    id: reviewableInstanceId,
    kind: "booking",
    status: "reviewable",
    title: "Прогностика на месяц",
    contextLabel: "Консультация завершена",
    receivedAt: "2026-08-20T10:00:00.000Z",
    reviewWindowClosesAt: "2026-09-03T10:00:00.000Z",
    windowPolicy: "standard_14_days_after_receipt"
  },
  activePublicVersion: null,
  pendingVersion: null,
  moderationCase: null,
  canSubmitNewVersion: true,
  canEditLatestVersion: false
} satisfies ClientReviewDetail;

const caseDetail = {
  caseId,
  reviewId: "10000000-0000-4000-8000-000000000102",
  status: "waiting_client",
  openedAt: "2026-08-21T09:00:00.000Z",
  closedAt: null,
  serviceContext: {
    title: "Прогностика на месяц",
    contextLabel: "Консультация завершена"
  },
  messages: [
    {
      messageId: "10000000-0000-4000-8000-000000000109",
      authorRole: "moderator",
      visibility: "all_case_participants",
      body: "Уточните контекст консультации.",
      createdAt: "2026-08-21T09:05:00.000Z"
    }
  ]
};
