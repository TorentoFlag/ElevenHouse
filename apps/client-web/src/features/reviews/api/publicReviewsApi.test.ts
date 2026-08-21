import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPublicReviews } from "./publicReviewsApi";

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../../Application", () => ({ application: { http } }));

describe("publicReviewsApi", () => {
  beforeEach(() => {
    http.get.mockReset();
  });

  it("lists public reviews for one astrologer only", async () => {
    http.get.mockResolvedValueOnce({ items: [publicReview], nextCursor: null });

    await expect(
      listPublicReviews({ astrologerUserId, limit: 6, cursor: null })
    ).resolves.toEqual({
      items: [publicReview],
      nextCursor: null
    });

    expect(http.get).toHaveBeenCalledWith(`/reviews?astrologerUserId=${astrologerUserId}&limit=6`);
  });
});

const astrologerUserId = "10000000-0000-4000-8000-000000000032";

const publicReview = {
  reviewId: "10000000-0000-4000-8000-000000000030",
  reviewableInstanceId: "10000000-0000-4000-8000-000000000031",
  astrologerUserId,
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
};
