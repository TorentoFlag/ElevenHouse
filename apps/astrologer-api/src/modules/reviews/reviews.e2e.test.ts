import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ReviewRatingAggregateProjectionDriftError } from "@elevenhouse/db/reviews";
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
  ASTROLOGER_REVIEWS_MESSAGING_STORE,
  ASTROLOGER_REVIEWS_READ_STORE,
  ASTROLOGER_REVIEWS_SOURCE_RECEIPT_STORE
} from "./reviews.tokens";

const astrologerUserId = "10000000-0000-4000-8000-000000000301";
const reviewId = "10000000-0000-4000-8000-000000000302";
const caseId = "10000000-0000-4000-8000-000000000303";
const reviewableInstanceId = "10000000-0000-4000-8000-000000000305";
const clientUserId = "10000000-0000-4000-8000-000000000307";
const threadId = "10000000-0000-4000-8000-000000000308";
const channelConnectionId = "10000000-0000-4000-8000-000000000309";
const orderId = "10000000-0000-4000-8000-000000000311";
const productId = "10000000-0000-4000-8000-000000000312";
const relationshipId = "10000000-0000-4000-8000-000000000313";

describe("astrologer reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedReviewsRead: unknown;
  let receivedReviewTargetsRead: unknown;
  let receivedCaseRead: unknown;
  let receivedMessageCommand: unknown;
  let receivedReplyCommand: unknown;
  let receivedDisputeCommand: unknown;
  let receivedAiDraftCommand: unknown;
  let receivedAiGeneration: unknown;
  let receivedAiDraftSucceeded: unknown;
  let receivedAiDraftFailed: unknown;
  let receivedReviewDetailRead: unknown;
  let receivedThreadLookup: unknown;
  let receivedOutboundMessage: unknown;
  let receivedSourceReceiptCommand: unknown;
  let sourceReceiptResult: unknown;
  let aiGenerationOutput: unknown;
  let aiDraftCommandResult: unknown;
  let disputeOpened: boolean;
  let threadClientUserId: string | null;
  let canSubmitNewVersion: boolean;
  let disputeProjectionDrift: boolean;

  beforeEach(async () => {
    receivedReviewsRead = null;
    receivedReviewTargetsRead = null;
    receivedCaseRead = null;
    receivedMessageCommand = null;
    receivedReplyCommand = null;
    receivedDisputeCommand = null;
    receivedAiDraftCommand = null;
    receivedAiGeneration = null;
    receivedAiDraftSucceeded = null;
    receivedAiDraftFailed = null;
    receivedReviewDetailRead = null;
    receivedThreadLookup = null;
    receivedOutboundMessage = null;
    receivedSourceReceiptCommand = null;
    sourceReceiptResult = null;
    aiGenerationOutput = { draftText: "Спасибо за отзыв. Рад, что консультация помогла." };
    aiDraftCommandResult = null;
    disputeOpened = true;
    threadClientUserId = clientUserId;
    canSubmitNewVersion = true;
    disputeProjectionDrift = false;
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
                    pendingVersion: null,
                    pendingReplyVersion: null,
                    moderationCase: null
                  }
                ],
                nextCursor: null
              };
            },
            async listReviewRequestTargets(input) {
              receivedReviewTargetsRead = input;
              return {
                items: [
                  {
                    reviewableInstance: {
                      id: reviewableInstanceId,
                      kind: "booking",
                      status: "reviewable",
                      title: "Солярная консультация",
                      contextLabel: "60 минут",
                      receivedAt: "2026-08-19T10:00:00.000Z",
                      reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
                      windowPolicy: "standard_14_days_after_receipt"
                    },
                    client: {
                      clientUserId,
                      displayName: "Марина Ковалёва",
                      initials: "МК",
                      avatarUrl: null
                    }
                  }
                ],
                nextCursor: null
              };
            },
            async getClientReviewDetail(input) {
              receivedReviewDetailRead = input;
              if (
                input.clientUserId !== clientUserId ||
                input.reviewableInstanceId !== reviewableInstanceId
              ) {
                return null;
              }
              return {
                reviewId: null,
                reviewableInstance: {
                  id: reviewableInstanceId,
                  kind: "booking",
                  status: "reviewable",
                  title: "Солярная консультация",
                  contextLabel: "60 минут",
                  receivedAt: "2026-08-19T10:00:00.000Z",
                  reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
                  windowPolicy: "standard_14_days_after_receipt"
                },
                activePublicVersion: null,
                pendingVersion: null,
                moderationCase: null,
                canSubmitNewVersion,
                canEditLatestVersion: false
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
          } satisfies Pick<
            ReviewReadStore,
            | "listAstrologerReviews"
            | "listReviewRequestTargets"
            | "getModerationCaseDetail"
            | "getClientReviewDetail"
          >
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
              if (disputeProjectionDrift) {
                throw new ReviewRatingAggregateProjectionDriftError("astrologer");
              }
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
              if (aiDraftCommandResult) return aiDraftCommandResult;
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
        },
        {
          provide: ASTROLOGER_REVIEWS_MESSAGING_STORE,
          useValue: {
            async findThreadForAstrologer(input: unknown) {
              receivedThreadLookup = input;
              return {
                id: threadId,
                astrologerUserId,
                clientUserId: threadClientUserId,
                channelConnectionId,
                externalIdentityId: "10000000-0000-4000-8000-000000000310",
                status: "open",
                lastMessageAt: null,
                unreadAstrologerCount: 0,
                createdAt: "2026-08-19T10:00:00.000Z",
                updatedAt: "2026-08-19T10:00:00.000Z"
              };
            },
            async findOutboundMessageByIdempotencyKey() {
              return null;
            },
            async createOutboundMessage(input: {
              readonly messageId: string;
              readonly threadId: string;
              readonly channelConnectionId: string;
              readonly text: string;
              readonly idempotencyKey: string;
              readonly now: string;
            }) {
              receivedOutboundMessage = input;
              return {
                id: input.messageId,
                threadId: input.threadId,
                channelConnectionId: input.channelConnectionId,
                externalIdentityId: null,
                direction: "outbound",
                text: input.text,
                status: "queued",
                providerMessageId: null,
                idempotencyKey: input.idempotencyKey,
                createdAt: input.now,
                updatedAt: input.now
              };
            }
          }
        },
        {
          provide: ASTROLOGER_REVIEWS_SOURCE_RECEIPT_STORE,
          useValue: {
            async recordPaidOrderFulfillmentReceipt(input: unknown) {
              receivedSourceReceiptCommand = input;
              if (sourceReceiptResult) return sourceReceiptResult;
              return {
                kind: "created",
                receipt: {
                  id: "10000000-0000-4000-8000-000000000314",
                  clientUserId,
                  astrologerUserId,
                  relationshipId,
                  kind: "async_delivery",
                  sourceResourceKey: `async_delivery:${orderId}`,
                  productId,
                  orderId,
                  titleSnapshot: "Письменный разбор",
                  contextLabelSnapshot: "Материал выдан клиенту",
                  receivedAt: "2026-08-20T13:00:00.000Z",
                  windowPolicy: "standard_14_days_after_receipt",
                  activePeriodEndsAt: null,
                  status: "received"
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

  it("lists review request targets for the current astrologer", async () => {
    const response = await fetch(`${baseUrl}/reviews/request-targets?limit=10`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          reviewableInstance: {
            id: reviewableInstanceId,
            title: "Солярная консультация"
          },
          client: {
            clientUserId,
            displayName: "Марина Ковалёва",
            initials: "МК"
          }
        }
      ],
      nextCursor: null
    });
    expect(receivedReviewTargetsRead).toEqual({
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

  it("replays completed astrologer AI reply drafts without calling the provider again", async () => {
    aiDraftCommandResult = {
      kind: "replayed",
      draftId: "10000000-0000-4000-8000-000000000331",
      attemptId: "10000000-0000-4000-8000-000000000332",
      status: "succeeded",
      draftText: "Повторно возвращенный черновик ответа."
    };

    const response = await fetch(`${baseUrl}/reviews/${reviewId}/reply-drafts/ai`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-ai-reply-draft-replay"
      },
      body: JSON.stringify({ locale: "ru" })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      draftId: "10000000-0000-4000-8000-000000000331",
      attemptId: "10000000-0000-4000-8000-000000000332",
      draftText: "Повторно возвращенный черновик ответа."
    });
    expect(receivedAiGeneration).toBeNull();
    expect(receivedAiDraftSucceeded).toBeNull();
    expect(receivedAiDraftFailed).toBeNull();
  });

  it("sends review requests through the linked client messaging thread", async () => {
    const response = await fetch(`${baseUrl}/reviews/request-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-request-review-1"
      },
      body: JSON.stringify({
        reviewableInstanceId,
        threadId,
        text: "Буду благодарна, если оставите отзыв о консультации."
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      threadId,
      status: "queued",
      replayed: false
    });
    expect(receivedThreadLookup).toEqual({ astrologerUserId, threadId });
    expect(receivedReviewDetailRead).toEqual({ clientUserId, reviewableInstanceId });
    expect(receivedOutboundMessage).toMatchObject({
      threadId,
      channelConnectionId,
      text: "Буду благодарна, если оставите отзыв о консультации.",
      idempotencyKey: "reviews-request-review-1",
      now: "2026-08-20T13:00:00.000Z"
    });
  });

  it("records paid order fulfillment receipts for later reviewable projection", async () => {
    const response = await fetch(`${baseUrl}/reviews/source-receipts/paid-order-fulfillment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-source-receipt-1"
      },
      body: JSON.stringify({ orderId })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "10000000-0000-4000-8000-000000000314",
      kind: "async_delivery",
      sourceResourceKey: `async_delivery:${orderId}`,
      status: "received"
    });
    expect(receivedSourceReceiptCommand).toMatchObject({
      astrologerUserId,
      orderId,
      receivedAt: "2026-08-20T13:00:00.000Z",
      activePeriodEndsAt: null,
      now: "2026-08-20T13:00:00.000Z"
    });
    expect(receivedSourceReceiptCommand).toHaveProperty("id", expect.any(String));
  });

  it("passes active-period evidence when recording paid order fulfillment receipts", async () => {
    const response = await fetch(`${baseUrl}/reviews/source-receipts/paid-order-fulfillment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-source-receipt-active-period"
      },
      body: JSON.stringify({
        orderId,
        receivedAt: "2026-08-01T10:00:00.000Z",
        activePeriodEndsAt: "2026-08-31T10:00:00.000Z"
      })
    });

    expect(response.status).toBe(201);
    expect(receivedSourceReceiptCommand).toMatchObject({
      orderId,
      receivedAt: "2026-08-01T10:00:00.000Z",
      activePeriodEndsAt: "2026-08-31T10:00:00.000Z"
    });
  });

  it("returns conflict when paid order fulfillment is not reviewable yet", async () => {
    sourceReceiptResult = {
      kind: "rejected",
      reason: "live_order_requires_terminal_booking"
    };

    const response = await fetch(`${baseUrl}/reviews/source-receipts/paid-order-fulfillment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-source-receipt-live"
      },
      body: JSON.stringify({ orderId })
    });

    expect(response.status).toBe(409);
    expect(receivedSourceReceiptCommand).toMatchObject({ astrologerUserId, orderId });
  });

  it("rejects review requests for unlinked messaging threads", async () => {
    threadClientUserId = null;

    const response = await fetch(`${baseUrl}/reviews/request-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-request-review-unlinked"
      },
      body: JSON.stringify({
        reviewableInstanceId,
        threadId,
        text: "Буду благодарна, если оставите отзыв о консультации."
      })
    });

    expect(response.status).toBe(400);
    expect(receivedReviewDetailRead).toBeNull();
    expect(receivedOutboundMessage).toBeNull();
  });

  it("rejects review requests when the service is no longer reviewable", async () => {
    canSubmitNewVersion = false;

    const response = await fetch(`${baseUrl}/reviews/request-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-request-review-closed"
      },
      body: JSON.stringify({
        reviewableInstanceId,
        threadId,
        text: "Буду благодарна, если оставите отзыв о консультации."
      })
    });

    expect(response.status).toBe(400);
    expect(receivedOutboundMessage).toBeNull();
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

  it("returns conflict when opening a dispute requires review aggregate reconciliation", async () => {
    disputeOpened = false;
    disputeProjectionDrift = true;

    const response = await fetch(`${baseUrl}/reviews/${reviewId}/disputes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "reviews-dispute-astrologer-drift"
      },
      body: JSON.stringify({
        reasonCode: "fraud_or_conflict",
        note: "Нужна проверка контекста услуги."
      })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "review_rating_aggregate_projection_drift",
      scope: "astrologer"
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
