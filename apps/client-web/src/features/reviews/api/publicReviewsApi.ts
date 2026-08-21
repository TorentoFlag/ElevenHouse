import {
  reviewPublicListQuerySchema,
  reviewPublicListResponseSchema,
  type ReviewPublicListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listPublicReviews(input: {
  readonly astrologerUserId: string;
  readonly productId?: string;
  readonly limit?: number;
  readonly cursor?: string | null;
}): Promise<ReviewPublicListResponse> {
  const query = reviewPublicListQuerySchema.parse(input);
  if (!query.astrologerUserId) {
    throw new Error("Public reviews require astrologerUserId");
  }

  const search = new URLSearchParams();
  search.set("astrologerUserId", query.astrologerUserId);
  if (query.productId) search.set("productId", query.productId);
  search.set("limit", String(query.limit));
  if (query.cursor) search.set("cursor", query.cursor);

  return reviewPublicListResponseSchema.parse(await application.http.get(`/reviews?${search}`));
}
