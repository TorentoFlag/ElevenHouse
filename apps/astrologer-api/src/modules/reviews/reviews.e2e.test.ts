import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReviewReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SystemClock } from "../clock/system-clock.service";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { AstrologerReviewsController } from "./reviews.controller";
import { AstrologerReviewsService } from "./reviews.service";
import { ASTROLOGER_REVIEWS_COMMAND_STORE, ASTROLOGER_REVIEWS_READ_STORE } from "./reviews.tokens";

const astrologerUserId = "10000000-0000-4000-8000-000000000301";
const reviewId = "10000000-0000-4000-8000-000000000302";
const caseId = "10000000-0000-4000-8000-000000000303";

describe("astrologer reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedCaseRead: unknown;
  let receivedMessageCommand: unknown;
  let receivedReplyCommand: unknown;

  beforeEach(async () => {
    receivedCaseRead = null;
    receivedMessageCommand = null;
    receivedReplyCommand = null;
    const builder = Test.createTestingModule({
      controllers: [AstrologerReviewsController],
      providers: [
        AstrologerReviewsService,
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-20T13:00:00.000Z") } },
        {
          provide: ASTROLOGER_REVIEWS_READ_STORE,
          useValue: {
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
                        messageId: "10000000-0000-4000-8000-000000000304",
                        authorRole: "moderator",
                        visibility: "astrologer_and_moderators",
                        body: "Астрологу: уточните формат услуги.",
                        createdAt: "2026-08-20T10:01:00.000Z"
                      }
                    ]
                  }
                : null;
            }
          } satisfies Pick<ReviewReadStore, "getModerationCaseDetail">
        },
        {
          provide: ASTROLOGER_REVIEWS_COMMAND_STORE,
          useValue: {
            async submitReviewReplyVersion(command: {
              readonly actorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly nextReplyVersionId: string;
              readonly text: string;
            }) {
              receivedReplyCommand = command;
              return {
                kind: "create_pending_reply_version",
                reviewId: command.reviewId,
                expectedReviewRevision: 2,
                keepActivePublicReplyVersionId: null,
                replyVersion: {
                  id: command.nextReplyVersionId,
                  versionNumber: 1,
                  text: command.text,
                  moderationStatus: "pending",
                  submittedAt: command.now,
                  decidedAt: null
                }
              };
            },
            async createReviewCaseMessage(command: {
              readonly messageId: string;
              readonly caseId: string;
              readonly authorUserId: string | null;
              readonly authorRole: "astrologer";
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
    builder.overrideGuard(AstrologerSessionAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
        context.switchToHttp().getRequest().currentAstrologerAccount = {
          account: {
            id: astrologerUserId,
            status: "active",
            roles: ["astrologer"]
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

  it("submits astrologer review reply versions for moderation", async () => {
    const response = await fetch(`${baseUrl}/reviews/${reviewId}/reply-versions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-reply-version-astrologer-1"
      },
      body: JSON.stringify({
        text: "Спасибо за отзыв. Рад, что консультация была полезной."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      versionNumber: 1,
      text: "Спасибо за отзыв. Рад, что консультация была полезной.",
      moderationStatus: "pending",
      moderationReasonCode: null,
      submittedAt: "2026-08-20T13:00:00.000Z",
      decidedAt: null
    });
    expect(receivedReplyCommand).toMatchObject({
      actorUserId: astrologerUserId,
      now: "2026-08-20T13:00:00.000Z",
      reviewId,
      text: "Спасибо за отзыв. Рад, что консультация была полезной."
    });
    expect(receivedReplyCommand).toHaveProperty("nextReplyVersionId", expect.any(String));
  });

  it("reads moderation case detail for the current astrologer", async () => {
    const response = await fetch(`${baseUrl}/reviews/moderation-cases/${caseId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      caseId,
      status: "open",
      messages: [{ visibility: "astrologer_and_moderators" }]
    });
    expect(receivedCaseRead).toEqual({
      caseId,
      actorUserId: astrologerUserId,
      actorRole: "astrologer"
    });
  });

  it("creates astrologer case messages", async () => {
    const response = await fetch(`${baseUrl}/reviews/moderation-cases/${caseId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-case-message-astrologer-1"
      },
      body: JSON.stringify({
        visibility: "all_case_participants",
        body: "Готов обсудить и приложить детали консультации."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      authorRole: "astrologer",
      visibility: "all_case_participants",
      body: "Готов обсудить и приложить детали консультации.",
      createdAt: "2026-08-20T13:00:00.000Z"
    });
    expect(receivedMessageCommand).toMatchObject({
      caseId,
      authorUserId: astrologerUserId,
      authorRole: "astrologer",
      visibility: "all_case_participants",
      body: "Готов обсудить и приложить детали консультации.",
      now: "2026-08-20T13:00:00.000Z"
    });
    expect(receivedMessageCommand).toHaveProperty("messageId", expect.any(String));
  });

  it("rejects astrologer messages that target client-only visibility", async () => {
    const response = await fetch(`${baseUrl}/reviews/moderation-cases/${caseId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-case-message-astrologer-2"
      },
      body: JSON.stringify({
        visibility: "client_and_moderators",
        body: "Нельзя отправить только клиенту."
      })
    });

    expect(response.status).toBe(400);
    expect(receivedMessageCommand).toBeNull();
  });
});
