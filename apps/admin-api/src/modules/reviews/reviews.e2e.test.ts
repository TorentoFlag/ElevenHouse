import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReviewAdminDetail } from "@elevenhouse/contracts";
import type { ReviewReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SystemClock } from "../../common/system-clock.js";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { AdminIdempotencyGuard } from "../security/idempotency/admin-idempotency.guard";
import { AdminReviewsController } from "./reviews.controller";
import { AdminReviewsService } from "./reviews.service";
import { ADMIN_REVIEWS_COMMAND_STORE, ADMIN_REVIEWS_READ_STORE } from "./reviews.tokens";

const adminUserId = "10000000-0000-4000-8000-000000000201";
const reviewId = "10000000-0000-4000-8000-000000000202";
const caseId = "10000000-0000-4000-8000-000000000203";
const clientUserId = "10000000-0000-4000-8000-000000000204";
const reviewableInstanceId = "10000000-0000-4000-8000-000000000205";
const reviewVersionId = "10000000-0000-4000-8000-000000000207";
const replyVersionId = "10000000-0000-4000-8000-000000000208";

describe("admin reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedCaseRead: unknown;
  let receivedMessageCommand: unknown;
  let receivedDecisionCommand: unknown;
  let decisionStatus: "pending" | "approved" | "rejected";
  let replyDecisionStatus: "pending" | "approved" | "rejected";

  beforeEach(async () => {
    receivedCaseRead = null;
    receivedMessageCommand = null;
    receivedDecisionCommand = null;
    decisionStatus = "pending";
    replyDecisionStatus = "pending";
    const builder = Test.createTestingModule({
      controllers: [AdminReviewsController],
      providers: [
        AdminReviewsService,
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-20T11:00:00.000Z") } },
        {
          provide: ADMIN_REVIEWS_READ_STORE,
          useValue: {
            async getAdminReviewDetail(input) {
              return input.reviewId === reviewId
                ? adminReviewDetail(decisionStatus, replyDecisionStatus)
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
                        messageId: "10000000-0000-4000-8000-000000000206",
                        authorRole: "moderator",
                        visibility: "moderators_only",
                        body: "Внутренняя заметка.",
                        createdAt: "2026-08-20T10:01:00.000Z"
                      }
                    ]
                  }
                : null;
            }
          } satisfies Pick<ReviewReadStore, "getAdminReviewDetail" | "getModerationCaseDetail">
        },
        {
          provide: ADMIN_REVIEWS_COMMAND_STORE,
          useValue: {
            async createReviewCaseMessage(command: {
              readonly messageId: string;
              readonly caseId: string;
              readonly authorUserId: string | null;
              readonly authorRole: "moderator";
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
            },
            async approveReviewVersion(command: {
              readonly moderatorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly versionId: string;
              readonly nextPublicationEventId: string;
            }) {
              receivedDecisionCommand = command;
              decisionStatus = "approved";
              return {
                kind: "approved",
                review: {},
                version: {},
                flowEvent: {
                  eventType: "review_first_published",
                  reviewId: command.reviewId,
                  reviewableInstanceId,
                  astrologerUserId: "10000000-0000-4000-8000-000000000209",
                  clientUserId,
                  firstApprovedVersionId: command.versionId,
                  publishedAt: command.now
                }
              };
            },
            async rejectReviewVersion(command: {
              readonly moderatorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly versionId: string;
              readonly reasonCode: string;
              readonly note: string | null;
            }) {
              receivedDecisionCommand = command;
              decisionStatus = "rejected";
              return {
                kind: "rejected",
                review: {},
                version: {}
              };
            },
            async approveReviewReplyVersion(command: {
              readonly moderatorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly replyVersionId: string;
            }) {
              receivedDecisionCommand = command;
              replyDecisionStatus = "approved";
              return {
                kind: "approved",
                review: {},
                replyVersion: {}
              };
            },
            async rejectReviewReplyVersion(command: {
              readonly moderatorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly replyVersionId: string;
              readonly reasonCode: string;
              readonly note: string | null;
            }) {
              receivedDecisionCommand = command;
              replyDecisionStatus = "rejected";
              return {
                kind: "rejected",
                review: {},
                replyVersion: {}
              };
            },
            async restoreReviewAfterDispute(command: {
              readonly moderatorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly caseId: string;
            }) {
              receivedDecisionCommand = command;
              return {
                kind: "restored",
                review: {},
                flowEvent: null
              };
            }
          }
        }
      ]
    });
    builder.overrideGuard(AdminSessionAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
        context.switchToHttp().getRequest().currentAdminAccount = {
          id: adminUserId,
          sessionId: "session",
          status: "active",
          roles: ["moderator"]
        };
        return true;
      }
    });
    builder.overrideGuard(CsrfGuard).useValue({ canActivate: () => true });
    builder.overrideGuard(AdminIdempotencyGuard).useValue({ canActivate: () => true });
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns admin review details with real anonymous author identity", async () => {
    const response = await fetch(`${baseUrl}/admin/reviews/${reviewId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      client: {
        clientUserId,
        displayName: "Анна Петрова"
      },
      publicIdentityMode: "secret_user"
    });
  });

  it("reads moderation case detail as moderator", async () => {
    const response = await fetch(`${baseUrl}/admin/reviews/moderation-cases/${caseId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      caseId,
      messages: [{ visibility: "moderators_only" }]
    });
    expect(receivedCaseRead).toEqual({
      caseId,
      actorUserId: adminUserId,
      actorRole: "moderator"
    });
  });

  it("returns 404 for unknown reviews", async () => {
    const response = await fetch(`${baseUrl}/admin/reviews/10000000-0000-4000-8000-000000000299`);

    expect(response.status).toBe(404);
  });

  it("creates moderator case messages", async () => {
    const response = await fetch(`${baseUrl}/admin/reviews/moderation-cases/${caseId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-case-message-1"
      },
      body: JSON.stringify({
        visibility: "client_and_moderators",
        body: "Клиенту: уточните дату получения услуги."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      authorRole: "moderator",
      visibility: "client_and_moderators",
      body: "Клиенту: уточните дату получения услуги.",
      createdAt: "2026-08-20T11:00:00.000Z"
    });
    expect(receivedMessageCommand).toMatchObject({
      caseId,
      authorUserId: adminUserId,
      authorRole: "moderator",
      visibility: "client_and_moderators",
      body: "Клиенту: уточните дату получения услуги.",
      now: "2026-08-20T11:00:00.000Z"
    });
    expect(receivedMessageCommand).toHaveProperty("messageId", expect.any(String));
  });

  it("approves review versions and returns refreshed admin detail", async () => {
    const response = await fetch(
      `${baseUrl}/admin/reviews/${reviewId}/versions/${reviewVersionId}/approve`,
      {
        method: "POST",
        headers: {
          "idempotency-key": "reviews-version-approve-1"
        }
      }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      versions: [{ id: reviewVersionId, moderationStatus: "approved" }]
    });
    expect(receivedDecisionCommand).toMatchObject({
      moderatorUserId: adminUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId,
      versionId: reviewVersionId
    });
    expect(receivedDecisionCommand).toHaveProperty("nextPublicationEventId", expect.any(String));
  });

  it("rejects review versions with a reason and returns refreshed admin detail", async () => {
    const response = await fetch(
      `${baseUrl}/admin/reviews/${reviewId}/versions/${reviewVersionId}/reject`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "reviews-version-reject-1"
        },
        body: JSON.stringify({
          reasonCode: "off_topic",
          note: "Текст не относится к услуге."
        })
      }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      versions: [{ id: reviewVersionId, moderationStatus: "rejected" }]
    });
    expect(receivedDecisionCommand).toMatchObject({
      moderatorUserId: adminUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId,
      versionId: reviewVersionId,
      reasonCode: "off_topic",
      note: "Текст не относится к услуге."
    });
  });

  it("approves review reply versions and returns refreshed admin detail", async () => {
    const response = await fetch(
      `${baseUrl}/admin/reviews/${reviewId}/reply-versions/${replyVersionId}/approve`,
      {
        method: "POST",
        headers: {
          "idempotency-key": "reviews-reply-approve-1"
        }
      }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      replyVersions: [{ id: replyVersionId, moderationStatus: "approved" }]
    });
    expect(receivedDecisionCommand).toMatchObject({
      moderatorUserId: adminUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId,
      replyVersionId
    });
  });

  it("rejects review reply versions with a reason and returns refreshed admin detail", async () => {
    const response = await fetch(
      `${baseUrl}/admin/reviews/${reviewId}/reply-versions/${replyVersionId}/reject`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "reviews-reply-reject-1"
        },
        body: JSON.stringify({
          reasonCode: "abuse_or_hate",
          note: null
        })
      }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      replyVersions: [{ id: replyVersionId, moderationStatus: "rejected" }]
    });
    expect(receivedDecisionCommand).toMatchObject({
      moderatorUserId: adminUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId,
      replyVersionId,
      reasonCode: "abuse_or_hate",
      note: null
    });
  });

  it("restores reviews after dispute resolution and returns refreshed admin detail", async () => {
    const response = await fetch(
      `${baseUrl}/admin/reviews/${reviewId}/moderation-cases/${caseId}/restore`,
      {
        method: "POST",
        headers: {
          "idempotency-key": "reviews-dispute-restore-1"
        }
      }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reviewId,
      visibilityStatus: "visible",
      disputeStatus: "none"
    });
    expect(receivedDecisionCommand).toMatchObject({
      moderatorUserId: adminUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId,
      caseId
    });
  });
});

function adminReviewDetail(
  moderationStatus: "pending" | "approved" | "rejected" = "pending",
  replyModerationStatus: "pending" | "approved" | "rejected" = "pending"
): ReviewAdminDetail {
  return {
    reviewId,
    client: {
      clientUserId,
      displayName: "Анна Петрова",
      initials: "АП",
      avatarUrl: null
    },
    publicIdentityMode: "secret_user",
    visibilityStatus: "visible",
    disputeStatus: "none",
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
    versions: [
      {
        id: "10000000-0000-4000-8000-000000000207",
        versionNumber: 1,
        rating: 5,
        text: "Очень полезно.",
        publicIdentityMode: "secret_user",
        moderationStatus,
        moderationReasonCode: moderationStatus === "rejected" ? "off_topic" : null,
        submittedAt: "2026-08-20T09:00:00.000Z",
        decidedAt: moderationStatus === "pending" ? null : "2026-08-20T11:00:00.000Z"
      }
    ],
    replyVersions: [
      {
        id: replyVersionId,
        versionNumber: 1,
        text: "Спасибо за отзыв.",
        moderationStatus: replyModerationStatus,
        moderationReasonCode: replyModerationStatus === "rejected" ? "abuse_or_hate" : null,
        submittedAt: "2026-08-20T09:30:00.000Z",
        decidedAt: replyModerationStatus === "pending" ? null : "2026-08-20T11:00:00.000Z"
      }
    ],
    moderationCase: null,
    auditCursor: null
  };
}
