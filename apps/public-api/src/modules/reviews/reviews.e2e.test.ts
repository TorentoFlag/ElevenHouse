import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ClientReviewDetail } from "@elevenhouse/contracts";
import type { ReviewReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { PublicMyReviewsController } from "./reviews.controller";
import { PublicReviewsController } from "./reviews.controller";
import { PublicReviewsService } from "./reviews.service";
import { PUBLIC_REVIEWS_COMMAND_STORE, PUBLIC_REVIEWS_READ_STORE } from "./reviews.tokens";

const astrologerUserId = "10000000-0000-4000-8000-000000000101";
const reviewId = "10000000-0000-4000-8000-000000000102";
const reviewableInstanceId = "10000000-0000-4000-8000-000000000103";
const clientUserId = "10000000-0000-4000-8000-000000000104";
const caseId = "10000000-0000-4000-8000-000000000105";

describe("public reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedQuery: unknown;
  let receivedCaseRead: unknown;
  let receivedMessageCommand: unknown;
  let receivedSubmissionCommand: unknown;
  let reviewSubmitted: boolean;

  beforeEach(async () => {
    receivedQuery = null;
    receivedCaseRead = null;
    receivedMessageCommand = null;
    receivedSubmissionCommand = null;
    reviewSubmitted = true;
    const builder = Test.createTestingModule({
      controllers: [PublicReviewsController, PublicMyReviewsController],
      providers: [
        PublicReviewsService,
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-20T12:00:00.000Z") } },
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
            },
            async getClientReviewDetail(input) {
              return input.clientUserId === clientUserId &&
                input.reviewableInstanceId === reviewableInstanceId &&
                reviewSubmitted
                ? clientReviewDetail()
                : null;
            },
            async getModerationCaseDetail(input) {
              receivedCaseRead = input;
              return input.caseId === caseId
                ? {
                    caseId,
                    reviewId,
                    status: "open",
                    openedAt: "2026-08-20T10:00:00.000Z",
                    closedAt: null,
                    serviceContext: {
                      title: "Солярная консультация",
                      contextLabel: "60 минут"
                    },
                    messages: [
                      {
                        messageId: "10000000-0000-4000-8000-000000000106",
                        authorRole: "moderator",
                        visibility: "client_and_moderators",
                        body: "Уточните дату получения услуги.",
                        createdAt: "2026-08-20T10:01:00.000Z"
                      }
                    ]
                  }
                : null;
            }
          } satisfies Pick<
            ReviewReadStore,
            "listPublicReviews" | "getClientReviewDetail" | "getModerationCaseDetail"
          >
        },
        {
          provide: PUBLIC_REVIEWS_COMMAND_STORE,
          useValue: {
            async submitReviewVersion(command: {
              readonly actorUserId: string;
              readonly now: string;
              readonly reviewableInstanceId: string;
              readonly nextReviewId: string;
              readonly nextVersionId: string;
              readonly submission: {
                readonly rating: number;
                readonly text: string;
                readonly publicIdentityMode: string;
              };
            }) {
              receivedSubmissionCommand = command;
              reviewSubmitted = true;
              return {
                kind: "create_review",
                review: { id: command.nextReviewId },
                version: { id: command.nextVersionId }
              };
            },
            async createReviewCaseMessage(command: {
              readonly messageId: string;
              readonly caseId: string;
              readonly authorUserId: string | null;
              readonly authorRole: "client";
              readonly visibility: string;
              readonly body: string;
              readonly now: string;
            }) {
              receivedMessageCommand = command;
              return {
                kind: "created",
                message: {
                  messageId: command.messageId,
                  caseId: command.caseId,
                  authorUserId: command.authorUserId,
                  authorRole: command.authorRole,
                  visibility: command.visibility,
                  body: command.body,
                  createdAt: command.now
                }
              };
            }
          }
        }
      ]
    });
    builder.overrideGuard(PublicSessionAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
        context.switchToHttp().getRequest().currentCustomerAccount = {
          account: {
            id: clientUserId,
            status: "active",
            roles: ["client"]
          }
        };
        return true;
      }
    });
    builder.overrideGuard(CsrfGuard).useValue({ canActivate: () => true });
    builder.overrideGuard(IdempotencyGuard).useValue({ canActivate: () => true });
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists public reviews for one astrologer without requiring a client session", async () => {
    const response = await fetch(
      `${baseUrl}/reviews?astrologerUserId=${astrologerUserId}&limit=10`
    );

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

  it("reads current client review detail by reviewable instance", async () => {
    const response = await fetch(
      `${baseUrl}/me/reviews/reviewable-instances/${reviewableInstanceId}`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      reviewableInstance: { id: reviewableInstanceId },
      pendingVersion: { moderationStatus: "pending" },
      canSubmitNewVersion: false
    });
  });

  it("submits client review versions and returns refreshed detail", async () => {
    reviewSubmitted = false;
    const response = await fetch(`${baseUrl}/me/reviews/versions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-version-client-1"
      },
      body: JSON.stringify({
        reviewableInstanceId,
        rating: 5,
        text: "Очень полезная консультация.",
        publicIdentityMode: "secret_user"
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      pendingVersion: {
        rating: 5,
        text: "Очень полезная консультация.",
        publicIdentityMode: "secret_user",
        moderationStatus: "pending"
      }
    });
    expect(receivedSubmissionCommand).toMatchObject({
      actorUserId: clientUserId,
      now: "2026-08-20T12:00:00.000Z",
      reviewableInstanceId,
      submission: {
        rating: 5,
        text: "Очень полезная консультация.",
        publicIdentityMode: "secret_user"
      }
    });
    expect(receivedSubmissionCommand).toHaveProperty("nextReviewId", expect.any(String));
    expect(receivedSubmissionCommand).toHaveProperty("nextVersionId", expect.any(String));
  });

  it("replays pending client review submission detail for repeated idempotency keys", async () => {
    const commandStore = app.get(PUBLIC_REVIEWS_COMMAND_STORE) as {
      submitReviewVersion: (command: unknown) => Promise<unknown>;
    };
    commandStore.submitReviewVersion = async (command: unknown) => {
      receivedSubmissionCommand = command;
      return { kind: "rejected", reason: "pending_version_exists" };
    };

    const response = await fetch(`${baseUrl}/me/reviews/versions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-version-client-1"
      },
      body: JSON.stringify({
        reviewableInstanceId,
        rating: 5,
        text: "Очень полезная консультация.",
        publicIdentityMode: "secret_user"
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      pendingVersion: { moderationStatus: "pending" }
    });
    expect(receivedSubmissionCommand).toMatchObject({
      actorUserId: clientUserId,
      reviewableInstanceId
    });
  });

  it("reads moderation case detail for the current client", async () => {
    const response = await fetch(`${baseUrl}/me/reviews/moderation-cases/${caseId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      caseId,
      status: "open",
      messages: [{ visibility: "client_and_moderators" }]
    });
    expect(receivedCaseRead).toEqual({
      caseId,
      actorUserId: clientUserId,
      actorRole: "client"
    });
  });

  it("creates client case messages", async () => {
    const response = await fetch(`${baseUrl}/me/reviews/moderation-cases/${caseId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-case-message-client-1"
      },
      body: JSON.stringify({
        visibility: "all_case_participants",
        body: "Я получил услугу 19 августа, спор готов обсудить."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      authorRole: "client",
      visibility: "all_case_participants",
      body: "Я получил услугу 19 августа, спор готов обсудить.",
      createdAt: "2026-08-20T12:00:00.000Z"
    });
    expect(receivedMessageCommand).toMatchObject({
      caseId,
      authorUserId: clientUserId,
      authorRole: "client",
      visibility: "all_case_participants",
      body: "Я получил услугу 19 августа, спор готов обсудить.",
      now: "2026-08-20T12:00:00.000Z"
    });
    expect(receivedMessageCommand).toHaveProperty("messageId", expect.any(String));
  });

  it("rejects client messages that target astrologer-only visibility", async () => {
    const response = await fetch(`${baseUrl}/me/reviews/moderation-cases/${caseId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-case-message-client-2"
      },
      body: JSON.stringify({
        visibility: "astrologer_and_moderators",
        body: "Нельзя отправить только астрологу."
      })
    });

    expect(response.status).toBe(400);
    expect(receivedMessageCommand).toBeNull();
  });
});

function clientReviewDetail(): ClientReviewDetail {
  return {
    reviewId,
    reviewableInstance: {
      id: reviewableInstanceId,
      kind: "booking",
      status: "review_submitted",
      title: "Солярная консультация",
      contextLabel: "60 минут",
      receivedAt: "2026-08-19T10:00:00.000Z",
      reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt"
    },
    activePublicVersion: null,
    pendingVersion: {
      id: "10000000-0000-4000-8000-000000000107",
      versionNumber: 1,
      rating: 5,
      text: "Очень полезная консультация.",
      publicIdentityMode: "secret_user",
      moderationStatus: "pending",
      moderationReasonCode: null,
      submittedAt: "2026-08-20T12:00:00.000Z",
      decidedAt: null
    },
    canSubmitNewVersion: false,
    canEditLatestVersion: false
  };
}
