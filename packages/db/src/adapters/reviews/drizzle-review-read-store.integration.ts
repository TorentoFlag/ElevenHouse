import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  products,
  reviewableInstances,
  userProfiles,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleReviewCommandStore } from "./drizzle-review-command-store";
import { createDrizzleReviewReadStore } from "./drizzle-review-read-store";

describe.sequential("Drizzle review read store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("lists client reviewable instances and reads detail before the first review exists", async () => {
    const fixture = await seedReviewReadFixture(runtime);
    const reads = createDrizzleReviewReadStore(runtime.database);

    await expect(
      reads.listClientReviewableInstances({
        clientUserId: fixture.clientUserId,
        limit: 20,
        cursor: null
      })
    ).resolves.toEqual({
      items: [
        {
          id: fixture.reviewableInstanceId,
          kind: "booking",
          status: "reviewable",
          title: "Солярная консультация",
          contextLabel: "60 минут",
          receivedAt: "2026-08-19T10:00:00.000Z",
          reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
          windowPolicy: "standard_14_days_after_receipt"
        }
      ],
      nextCursor: null
    });

    await expect(
      reads.getClientReviewDetail({
        clientUserId: fixture.clientUserId,
        reviewableInstanceId: fixture.reviewableInstanceId
      })
    ).resolves.toMatchObject({
      reviewId: null,
      reviewableInstance: {
        id: fixture.reviewableInstanceId,
        status: "reviewable"
      },
      activePublicVersion: null,
      pendingVersion: null,
      canSubmitNewVersion: true,
      canEditLatestVersion: false
    });
  });

  it("projects public anonymity while admin and client reads keep the full review context", async () => {
    const fixture = await seedReviewReadFixture(runtime);
    const commands = createDrizzleReviewCommandStore(runtime.database);
    const reads = createDrizzleReviewReadStore(runtime.database);

    await commands.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.firstVersionId,
      submission: {
        rating: 5,
        text: "Сервис помог спокойно разобрать ситуацию.",
        publicIdentityMode: "secret_user"
      }
    });
    await commands.approveReviewVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId: fixture.reviewId,
      versionId: fixture.firstVersionId,
      nextPublicationEventId: fixture.publicationEventId
    });
    await commands.submitReviewReplyVersion({
      actorUserId: fixture.astrologerUserId,
      now: "2026-08-20T12:00:00.000Z",
      reviewId: fixture.reviewId,
      nextReplyVersionId: fixture.replyVersionId,
      text: "Спасибо, что поделились результатом."
    });
    await commands.approveReviewReplyVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T13:00:00.000Z",
      reviewId: fixture.reviewId,
      replyVersionId: fixture.replyVersionId
    });
    await commands.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-21T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.pendingEditVersionId,
      submission: {
        rating: 4,
        text: "Новый текст еще должен пройти модерацию.",
        publicIdentityMode: "named"
      }
    });

    const publicPage = await reads.listPublicReviews({
      astrologerUserId: fixture.astrologerUserId,
      limit: 20,
      cursor: null
    });

    expect(publicPage).toEqual({
      items: [
        {
          reviewId: fixture.reviewId,
          reviewableInstanceId: fixture.reviewableInstanceId,
          astrologerUserId: fixture.astrologerUserId,
          productId: fixture.productId,
          title: "Солярная консультация",
          contextLabel: "60 минут",
          rating: 5,
          text: "Сервис помог спокойно разобрать ситуацию.",
          author: {
            publicIdentityMode: "secret_user",
            displayName: "Секретный пользователь",
            initials: null,
            avatarUrl: null
          },
          publishedAt: "2026-08-20T11:00:00.000Z",
          astrologerReply: {
            replyId: fixture.replyVersionId,
            text: "Спасибо, что поделились результатом.",
            publishedAt: "2026-08-20T13:00:00.000Z"
          }
        }
      ],
      nextCursor: null
    });
    expect(JSON.stringify(publicPage)).not.toContain(fixture.clientUserId);
    expect(JSON.stringify(publicPage)).not.toContain("Анна Петрова");

    const clientDetail = await reads.getClientReviewDetail({
      clientUserId: fixture.clientUserId,
      reviewableInstanceId: fixture.reviewableInstanceId
    });
    expect(clientDetail).toMatchObject({
      reviewId: fixture.reviewId,
      reviewableInstance: {
        id: fixture.reviewableInstanceId,
        title: "Солярная консультация",
        contextLabel: "60 минут"
      },
      activePublicVersion: {
        id: fixture.firstVersionId,
        rating: 5,
        text: "Сервис помог спокойно разобрать ситуацию.",
        publicIdentityMode: "secret_user",
        moderationStatus: "approved"
      },
      pendingVersion: {
        id: fixture.pendingEditVersionId,
        rating: 4,
        text: "Новый текст еще должен пройти модерацию.",
        publicIdentityMode: "named",
        moderationStatus: "pending"
      },
      canSubmitNewVersion: false,
      canEditLatestVersion: false
    });
    await expect(
      reads.getClientReviewDetail({
        clientUserId: randomUUID(),
        reviewableInstanceId: fixture.reviewableInstanceId
      })
    ).resolves.toBeNull();

    const adminDetail = await reads.getAdminReviewDetail({ reviewId: fixture.reviewId });
    expect(adminDetail).toMatchObject({
      reviewId: fixture.reviewId,
      client: {
        clientUserId: fixture.clientUserId,
        displayName: "Анна Петрова",
        initials: "АП",
        avatarUrl: null
      },
      publicIdentityMode: "secret_user",
      visibilityStatus: "visible",
      disputeStatus: "none",
      reviewableInstance: {
        id: fixture.reviewableInstanceId,
        title: "Солярная консультация",
        contextLabel: "60 минут"
      },
      versions: [
        expect.objectContaining({ id: fixture.firstVersionId, moderationStatus: "approved" }),
        expect.objectContaining({ id: fixture.pendingEditVersionId, moderationStatus: "pending" })
      ],
      moderationCase: null,
      auditCursor: null
    });
  });

  it("filters moderation case messages by participant visibility", async () => {
    const fixture = await seedReviewReadFixture(runtime);
    const commands = createDrizzleReviewCommandStore(runtime.database);
    const reads = createDrizzleReviewReadStore(runtime.database);
    const caseId = randomUUID();

    await commands.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.firstVersionId,
      submission: {
        rating: 3,
        text: "Нужны уточнения по оказанной услуге.",
        publicIdentityMode: "named"
      }
    });
    await commands.approveReviewVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId: fixture.reviewId,
      versionId: fixture.firstVersionId,
      nextPublicationEventId: fixture.publicationEventId
    });
    await commands.openReviewDispute({
      actorUserId: fixture.astrologerUserId,
      now: "2026-08-20T12:00:00.000Z",
      reviewId: fixture.reviewId,
      nextCaseId: caseId,
      reasonCode: "fraud_or_conflict"
    });

    await commands.createReviewCaseMessage({
      messageId: fixture.allParticipantsMessageId,
      caseId,
      authorUserId: fixture.moderatorUserId,
      authorRole: "moderator",
      visibility: "all_case_participants",
      body: "Обсуждаем спор здесь.",
      now: "2026-08-20T12:01:00.000Z"
    });
    await commands.createReviewCaseMessage({
      messageId: fixture.clientOnlyMessageId,
      caseId,
      authorUserId: fixture.moderatorUserId,
      authorRole: "moderator",
      visibility: "client_and_moderators",
      body: "Клиенту: уточните детали оплаты.",
      now: "2026-08-20T12:02:00.000Z"
    });
    await commands.createReviewCaseMessage({
      messageId: fixture.astrologerOnlyMessageId,
      caseId,
      authorUserId: fixture.moderatorUserId,
      authorRole: "moderator",
      visibility: "astrologer_and_moderators",
      body: "Астрологу: пришлите контекст услуги.",
      now: "2026-08-20T12:03:00.000Z"
    });
    await commands.createReviewCaseMessage({
      messageId: fixture.moderatorsOnlyMessageId,
      caseId,
      authorUserId: fixture.moderatorUserId,
      authorRole: "moderator",
      visibility: "moderators_only",
      body: "Внутренняя заметка модерации.",
      now: "2026-08-20T12:04:00.000Z"
    });

    const moderatorCase = await reads.getModerationCaseDetail({
      caseId,
      actorRole: "moderator",
      actorUserId: fixture.moderatorUserId
    });
    expect(moderatorCase).toMatchObject({
      caseId,
      reviewId: fixture.reviewId,
      serviceContext: {
        title: "Солярная консультация",
        contextLabel: "60 минут"
      },
      messages: [
        expect.objectContaining({ messageId: fixture.allParticipantsMessageId }),
        expect.objectContaining({ messageId: fixture.clientOnlyMessageId }),
        expect.objectContaining({ messageId: fixture.astrologerOnlyMessageId }),
        expect.objectContaining({ messageId: fixture.moderatorsOnlyMessageId })
      ]
    });

    const clientCase = await reads.getModerationCaseDetail({
      caseId,
      actorRole: "client",
      actorUserId: fixture.clientUserId
    });
    expect(clientCase?.messages.map((message) => message.messageId)).toEqual([
      fixture.allParticipantsMessageId,
      fixture.clientOnlyMessageId
    ]);

    const astrologerCase = await reads.getModerationCaseDetail({
      caseId,
      actorRole: "astrologer",
      actorUserId: fixture.astrologerUserId
    });
    expect(astrologerCase?.messages.map((message) => message.messageId)).toEqual([
      fixture.allParticipantsMessageId,
      fixture.astrologerOnlyMessageId
    ]);

    await expect(
      reads.getModerationCaseDetail({
        caseId,
        actorRole: "client",
        actorUserId: randomUUID()
      })
    ).resolves.toBeNull();
  });

  it("lists pending review and reply versions for admin moderation", async () => {
    const fixture = await seedReviewReadFixture(runtime);
    const commands = createDrizzleReviewCommandStore(runtime.database);
    const reads = createDrizzleReviewReadStore(runtime.database);

    await commands.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.firstVersionId,
      submission: {
        rating: 5,
        text: "Первый отзыв.",
        publicIdentityMode: "secret_user"
      }
    });
    await commands.approveReviewVersion({
      moderatorUserId: fixture.moderatorUserId,
      now: "2026-08-20T11:00:00.000Z",
      reviewId: fixture.reviewId,
      versionId: fixture.firstVersionId,
      nextPublicationEventId: fixture.publicationEventId
    });
    await commands.submitReviewVersion({
      actorUserId: fixture.clientUserId,
      now: "2026-08-22T12:00:00.000Z",
      reviewableInstanceId: fixture.reviewableInstanceId,
      nextReviewId: fixture.reviewId,
      nextVersionId: fixture.pendingEditVersionId,
      submission: {
        rating: 4,
        text: "Редакция отзыва ждет проверки.",
        publicIdentityMode: "named"
      }
    });
    await commands.submitReviewReplyVersion({
      actorUserId: fixture.astrologerUserId,
      now: "2026-08-22T13:00:00.000Z",
      reviewId: fixture.reviewId,
      nextReplyVersionId: fixture.replyVersionId,
      text: "Ответ астролога ждет проверки."
    });

    const queue = await reads.listModerationQueue({ limit: 10, cursor: null });

    expect(queue.nextCursor).toBeNull();
    expect(queue.items.slice(0, 2)).toMatchObject([
      {
        kind: "reply_version",
        reviewId: fixture.reviewId,
        reviewVersionId: null,
        replyVersionId: fixture.replyVersionId,
        submittedAt: "2026-08-22T13:00:00.000Z",
        client: {
          clientUserId: fixture.clientUserId,
          displayName: "Анна Петрова"
        },
        publicIdentityMode: "secret_user",
        rating: null,
        text: "Ответ астролога ждет проверки."
      },
      {
        kind: "review_version",
        reviewId: fixture.reviewId,
        reviewVersionId: fixture.pendingEditVersionId,
        replyVersionId: null,
        submittedAt: "2026-08-22T12:00:00.000Z",
        client: {
          clientUserId: fixture.clientUserId,
          displayName: "Анна Петрова"
        },
        publicIdentityMode: "named",
        rating: 4,
        text: "Редакция отзыва ждет проверки."
      }
    ]);
    expect(queue.items.slice(0, 2).map((item) => item.reviewableInstance.title)).toEqual([
      "Солярная консультация",
      "Солярная консультация"
    ]);
  });
});

async function seedReviewReadFixture(runtime: PostgresRuntime) {
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const moderatorUserId = randomUUID();
  const relationshipId = randomUUID();
  const productId = randomUUID();
  const reviewableInstanceId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values([{ id: astrologerUserId }, { id: clientUserId }, { id: moderatorUserId }]);
    await transaction.insert(userProfiles).values([
      { userId: astrologerUserId, displayName: "Мария Астролог" },
      { userId: clientUserId, displayName: "Анна Петрова" },
      { userId: moderatorUserId, displayName: "Модератор" }
    ]);
    await transaction.insert(clientAstrologerRelationships).values({
      id: relationshipId,
      astrologerUserId,
      clientUserId,
      source: "booking",
      status: "active",
      firstLinkedAt: now,
      lastLinkedAt: now,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(products).values({
      id: productId,
      ownerUserId: astrologerUserId,
      type: "single",
      status: "active",
      revision: 1,
      title: "Солярная консультация",
      priceMinor: 12000,
      currency: "RUB",
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 60,
      participantMode: "solo",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(reviewableInstances).values({
      id: reviewableInstanceId,
      astrologerUserId,
      clientUserId,
      relationshipId,
      kind: "booking",
      status: "reviewable",
      windowPolicy: "standard_14_days_after_receipt",
      sourceResourceKey: `booking:${randomUUID()}`,
      productId,
      orderId: null,
      bookingId: null,
      titleSnapshot: "Солярная консультация",
      contextLabelSnapshot: "60 минут",
      receivedAt: new Date("2026-08-19T10:00:00.000Z"),
      reviewWindowClosesAt: new Date("2026-09-02T10:00:00.000Z"),
      blockedReasonCode: null,
      createdAt: now,
      updatedAt: now
    });
  });

  return {
    astrologerUserId,
    clientUserId,
    moderatorUserId,
    relationshipId,
    productId,
    reviewableInstanceId,
    reviewId: randomUUID(),
    firstVersionId: randomUUID(),
    pendingEditVersionId: randomUUID(),
    replyVersionId: randomUUID(),
    publicationEventId: randomUUID(),
    allParticipantsMessageId: randomUUID(),
    clientOnlyMessageId: randomUUID(),
    astrologerOnlyMessageId: randomUUID(),
    moderatorsOnlyMessageId: randomUUID()
  };
}
