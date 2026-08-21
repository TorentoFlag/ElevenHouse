import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReviewReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AiGenerationService } from "../ai/ai-generation.service";
import { SystemClock } from "../clock/system-clock.service";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { AstrologerReviewsController } from "./reviews.controller";
import { AstrologerReviewsService } from "./reviews.service";
import {
  ASTROLOGER_REVIEWS_AI_REPLY_DRAFT_STORE,
  ASTROLOGER_REVIEWS_COMMAND_STORE,
  ASTROLOGER_REVIEWS_READ_STORE
} from "./reviews.tokens";

const astrologerUserId = "10000000-0000-4000-8000-000000000301";
const reviewId = "10000000-0000-4000-8000-000000000302";
const caseId = "10000000-0000-4000-8000-000000000303";

describe("astrologer reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedReviewsRead: unknown;
  let receivedCaseRead: unknown;
  let receivedMessageCommand: unknown;
  let receivedReplyCommand: unknown;
  let receivedDisputeCommand: unknown;
  let receivedAiDraftCommand: unknown;
  let receivedAiGeneration: unknown;
  let receivedAiDraftSucceeded: unknown;
  let receivedAiDraftFailed: unknown;
  let aiGenerationOutput: unknown;
  let disputeOpened: boolean;

  beforeEach(async () => {
    receivedReviewsRead = null;
    receivedCaseRead = null;
    receivedMessageCommand = null;
    receivedReplyCommand = null;
    receivedDisputeCommand = null;
    receivedAiDraftCommand = null;
    receivedAiGeneration = null;
    receivedAiDraftSucceeded = null;
    receivedAiDraftFailed = null;
    aiGenerationOutput = { draftText: "Спасибо за отзыв. Рад, что консультация помогла." };
    disputeOpened = true;
    const builder = Test.createTestingModule({
      controllers: [AstrologerReviewsController],
      providers: [
        AstrologerReviewsService,
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-20T13:00:00.000Z") } },
        {
          provide: AiGenerationService,
          useValue: {
            async generate(input: unknown) {
              receivedAiGeneration = input;
              return {
                output: aiGenerationOutput,
                provider: "openai",
                model: "gpt-5.5",
                finishReason: "completed",
                usage: {
                  promptTokens: 100,
                  completionTokens: 20,
                  totalTokens: 120
                }
              };
            }
          }
        },
        {
          provide: ASTROLOGER_REVIEWS_READ_STORE,
          useValue: {
            async listAstrologerReviews(input) {
              receivedReviewsRead = input;
              return {
                items: [
                  {
                    reviewId,
                    visibilityStatus: "visible",
                    disputeStatus: "none",
                    reviewableInstance: {
                      id: "10000000-0000-4000-8000-000000000305",
                      kind: "booking",
                      status: "review_submitted",
                      title: "Солярная консультация",
                      contextLabel: "60 минут",
                      receivedAt: "2026-08-19T10:00:00.000Z",
                      reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
                      windowPolicy: "standard_14_days_after_receipt"
                    },
                    author: {
                      publicIdentityMode: "secret_user",
                      displayName: "Секретный пользователь",
                      initials: null,
                      avatarUrl: null
                    },
                    activePublicVersion: {
                      id: "10000000-0000-4000-8000-000000000306",
                      versionNumber: 1,
                      rating: 5,
                      text: "Помогло понять следующие шаги.",
                      publicIdentityMode: "secret_user",
                      moderationStatus: "approved",
                      moderationReasonCode: null,
                      submittedAt: "2026-08-20T10:00:00.000Z",
                      decidedAt: "2026-08-20T11:00:00.000Z"
                    },
                    activePublicReplyVersion: null,
                    pendingReplyVersion: null,
                    moderationCase: null
                  }
                ],
                nextCursor: null
              };
            },
            async getModerationCaseDetail(input) {
              receivedCaseRead = input;
              return input.caseId === caseId && disputeOpened
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
          } satisfies Pick<ReviewReadStore, "listAstrologerReviews" | "getModerationCaseDetail">
        },
        {
          provide: ASTROLOGER_REVIEWS_COMMAND_STORE,
          useValue: {
            async openReviewDispute(command: {
              readonly actorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly nextCaseId: string;
              readonly nextMessageId: string | null;
              readonly reasonCode: string;
              readonly note: string | null;
            }) {
              receivedDisputeCommand = command;
              disputeOpened = true;
              return {
                kind: "opened",
                review: {
                  id: command.reviewId,
                  visibilityStatus: "temporarily_hidden_by_dispute",
                  disputeStatus: "open"
                },
                moderationCase: {
                  caseId,
                  reviewId: command.reviewId,
                  status: "open",
                  openedAt: command.now,
                  closedAt: null,
                  reasonCode: command.reasonCode
                }
              };
            },
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
        },
        {
          provide: ASTROLOGER_REVIEWS_AI_REPLY_DRAFT_STORE,
          useValue: {
            async createReplyDraftCommand(command: {
              readonly actorUserId: string;
              readonly now: string;
              readonly reviewId: string;
              readonly nextDraftId: string;
              readonly attemptId: string;
            }) {
              receivedAiDraftCommand = command;
              return {
                kind: "created",
                command: {
                  attemptId: command.attemptId,
                  feature: "reviews.reply_draft",
                  promptId: "reviews.replyDraft",
                  promptVersion: 1,
                  provider: "openai",
                  outputMode: "draft_only",
                  canSubmitOrPublish: false,
                  ownerSafetyId: command.actorUserId,
                  resourceEvidence: {
                    resourceType: "review",
                    resourceId: command.reviewId,
                    sourceChecksum: "sha256:test"
                  },
                  promptInput: {
                    rating: 5,
                    reviewText: "Помогло понять следующие шаги.",
                    publicIdentityMode: "secret_user",
                    serviceTitle: "Солярная консультация",
                    serviceContextLabel: "60 минут"
                  },
                  requestedAt: command.now
                }
              };
            },
            async markReplyDraftSucceeded(input: unknown) {
              receivedAiDraftSucceeded = input;
              return { kind: "updated" };
            },
            async markReplyDraftFailed(input: unknown) {
              receivedAiDraftFailed = input;
              return { kind: "updated" };
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
    builder.overrideGuard(PlatformTariffCapabilityGuard).useValue({ canActivate: () => true });
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

  it("lists reviews owned by the current astrologer without exposing anonymous client identity", async () => {
    const response = await fetch(`${baseUrl}/reviews?limit=10`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          reviewId,
          author: { displayName: "Секретный пользователь" },
          activePublicVersion: { rating: 5 }
        }
      ],
      nextCursor: null
    });
    expect(receivedReviewsRead).toEqual({
      astrologerUserId,
      limit: 10,
      cursor: null
    });
  });

  it("creates astrologer AI reply drafts without submitting replies", async () => {
    const response = await fetch(`${baseUrl}/reviews/${reviewId}/reply-drafts/ai`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-ai-reply-draft-1"
      },
      body: JSON.stringify({ locale: "ru" })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      draftId: expect.any(String),
      attemptId: expect.any(String),
      draftText: "Спасибо за отзыв. Рад, что консультация помогла."
    });
    expect(receivedAiDraftCommand).toMatchObject({
      actorUserId: astrologerUserId,
      now: "2026-08-20T13:00:00.000Z",
      reviewId
    });
    expect(receivedAiDraftCommand).toHaveProperty("nextDraftId", expect.any(String));
    expect(receivedAiDraftCommand).toHaveProperty("attemptId", expect.any(String));
    expect(receivedAiGeneration).toMatchObject({
      ownerUserId: astrologerUserId,
      feature: "reviews.reply_draft",
      input: {
        locale: "ru",
        rating: 5,
        reviewText: "Помогло понять следующие шаги.",
        publicIdentityMode: "secret_user"
      },
      resourceEvidence: {
        resourceType: "review",
        resourceId: reviewId,
        sourceChecksum: "sha256:test"
      }
    });
    expect(receivedAiDraftSucceeded).toMatchObject({
      draftText: "Спасибо за отзыв. Рад, что консультация помогла."
    });
    expect(receivedAiDraftFailed).toBeNull();
  });

  it("marks AI reply drafts failed when provider output is malformed", async () => {
    aiGenerationOutput = { text: "не тот контракт" };

    const response = await fetch(`${baseUrl}/reviews/${reviewId}/reply-drafts/ai`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-ai-reply-draft-malformed"
      },
      body: JSON.stringify({ locale: "ru" })
    });

    expect(response.status).toBe(502);
    expect(receivedAiDraftSucceeded).toBeNull();
    expect(receivedAiDraftFailed).toMatchObject({
      safeErrorCode: "AI_PROVIDER_RESPONSE_INVALID"
    });
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

  it("opens review disputes and returns moderation case detail", async () => {
    disputeOpened = false;
    const response = await fetch(`${baseUrl}/reviews/${reviewId}/disputes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-dispute-astrologer-1"
      },
      body: JSON.stringify({
        reasonCode: "fraud_or_conflict",
        note: "Нужна проверка контекста услуги."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      caseId,
      reviewId,
      status: "open"
    });
    expect(receivedDisputeCommand).toMatchObject({
      actorUserId: astrologerUserId,
      now: "2026-08-20T13:00:00.000Z",
      reviewId,
      reasonCode: "fraud_or_conflict",
      note: "Нужна проверка контекста услуги."
    });
    expect(receivedDisputeCommand).toHaveProperty("nextCaseId", expect.any(String));
    expect(receivedDisputeCommand).toHaveProperty("nextMessageId", expect.any(String));
    expect(receivedCaseRead).toEqual({
      caseId,
      actorUserId: astrologerUserId,
      actorRole: "astrologer"
    });
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
        visibility: "astrologer_and_moderators",
        body: "Готов обсудить и приложить детали консультации."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      authorRole: "astrologer",
      visibility: "astrologer_and_moderators",
      body: "Готов обсудить и приложить детали консультации.",
      createdAt: "2026-08-20T13:00:00.000Z"
    });
    expect(receivedMessageCommand).toMatchObject({
      caseId,
      authorUserId: astrologerUserId,
      authorRole: "astrologer",
      visibility: "astrologer_and_moderators",
      body: "Готов обсудить и приложить детали консультации.",
      now: "2026-08-20T13:00:00.000Z"
    });
    expect(receivedMessageCommand).toHaveProperty("messageId", expect.any(String));
  });

  it("rejects astrologer messages that target all case participants", async () => {
    const response = await fetch(`${baseUrl}/reviews/moderation-cases/${caseId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-case-message-astrologer-broadcast"
      },
      body: JSON.stringify({
        visibility: "all_case_participants",
        body: "Нельзя отправить и модератору, и клиенту одновременно."
      })
    });

    expect(response.status).toBe(400);
    expect(receivedMessageCommand).toBeNull();
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
