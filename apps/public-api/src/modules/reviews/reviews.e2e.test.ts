import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReviewReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PublicReviewsController } from "./reviews.controller";
import { PublicReviewsService } from "./reviews.service";
import { PUBLIC_REVIEWS_READ_STORE } from "./reviews.tokens";

const astrologerUserId = "10000000-0000-4000-8000-000000000101";
const reviewId = "10000000-0000-4000-8000-000000000102";
const reviewableInstanceId = "10000000-0000-4000-8000-000000000103";

describe("public reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedQuery: unknown;

  beforeEach(async () => {
    receivedQuery = null;
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicReviewsController],
      providers: [
        PublicReviewsService,
        {
          provide: PUBLIC_REVIEWS_READ_STORE,
          useValue: {
            async listPublicReviews(query) {
              receivedQuery = query;
              return {
                items: [
                  {
                    reviewId,
                    reviewableInstanceId,
                    astrologerUserId,
                    productId: null,
                    title: "Солярная консультация",
                    contextLabel: "60 минут",
                    rating: 5,
                    text: "Очень полезно.",
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
              };
            }
          } satisfies Pick<ReviewReadStore, "listPublicReviews">
        }
      ]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists public reviews for one astrologer without requiring a client session", async () => {
    const response = await fetch(`${baseUrl}/reviews?astrologerUserId=${astrologerUserId}&limit=10`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ reviewId, author: { displayName: "Секретный пользователь" } }],
      nextCursor: null
    });
    expect(receivedQuery).toEqual({
      astrologerUserId,
      productId: undefined,
      limit: 10,
      cursor: null
    });
  });

  it("rejects global review listings", async () => {
    const response = await fetch(`${baseUrl}/reviews`);

    expect(response.status).toBe(400);
    expect(receivedQuery).toBeNull();
  });
});
