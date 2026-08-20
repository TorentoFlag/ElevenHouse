import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  reviewPublicListQuerySchema,
  reviewPublicListResponseSchema,
  type ReviewPublicListResponse
} from "@elevenhouse/contracts";
import type { ReviewReadStore } from "@elevenhouse/domain";

import { PUBLIC_REVIEWS_READ_STORE } from "./reviews.tokens";

@Injectable()
export class PublicReviewsService {
  constructor(
    @Inject(PUBLIC_REVIEWS_READ_STORE)
    private readonly readStore: Pick<ReviewReadStore, "listPublicReviews">
  ) {}

  async listPublicReviews(query: unknown): Promise<ReviewPublicListResponse> {
    const normalized = normalizePublicReviewsQuery(query);
    if (!normalized.astrologerUserId) {
      throw new BadRequestException("astrologerUserId is required");
    }
    return reviewPublicListResponseSchema.parse(
      await this.readStore.listPublicReviews(normalized)
    );
  }
}

function normalizePublicReviewsQuery(query: unknown) {
  if (!isRecord(query)) throw new BadRequestException("Invalid reviews query");
  const parsed = reviewPublicListQuerySchema.safeParse({
    astrologerUserId: optionalString(query.astrologerUserId),
    productId: optionalString(query.productId),
    limit: optionalInteger(query.limit) ?? undefined,
    cursor: optionalString(query.cursor) ?? null
  });
  if (!parsed.success) throw new BadRequestException("Invalid reviews query");
  return parsed.data;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
