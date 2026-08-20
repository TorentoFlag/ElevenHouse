import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReviewAdminDetail } from "@elevenhouse/contracts";
import type { ReviewReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AdminReviewsController } from "./reviews.controller";
import { AdminReviewsService } from "./reviews.service";
import { ADMIN_REVIEWS_READ_STORE } from "./reviews.tokens";

const adminUserId = "10000000-0000-4000-8000-000000000201";
const reviewId = "10000000-0000-4000-8000-000000000202";
const caseId = "10000000-0000-4000-8000-000000000203";
const clientUserId = "10000000-0000-4000-8000-000000000204";
const reviewableInstanceId = "10000000-0000-4000-8000-000000000205";

describe("admin reviews HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let receivedCaseRead: unknown;

  beforeEach(async () => {
    receivedCaseRead = null;
    const builder = Test.createTestingModule({
      controllers: [AdminReviewsController],
      providers: [
        AdminReviewsService,
        {
          provide: ADMIN_REVIEWS_READ_STORE,
          useValue: {
            async getAdminReviewDetail(input) {
              return input.reviewId === reviewId ? adminReviewDetail() : null;
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
    const response = await fetch(
      `${baseUrl}/admin/reviews/10000000-0000-4000-8000-000000000299`
    );

    expect(response.status).toBe(404);
  });
});

function adminReviewDetail(): ReviewAdminDetail {
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
        moderationStatus: "approved",
        moderationReasonCode: null,
        submittedAt: "2026-08-20T09:00:00.000Z",
        decidedAt: "2026-08-20T10:00:00.000Z"
      }
    ],
    moderationCase: null,
    auditCursor: null
  };
}
