// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ReviewAdminDetail,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewModerationQueueResponse
} from "@elevenhouse/contracts";
import { AdminReviewsPage } from "./AdminReviewsPage";
import type { AdminReviewsApi } from "../api/adminReviewsApi";

afterEach(() => {
  cleanup();
});

describe("AdminReviewsPage", () => {
  it("shows review context, labels case messages, and sends targeted moderator messages", async () => {
    const api = createApi();

    render(<AdminReviewsPage api={api} />);

    expect((await screen.findAllByText("Солярная консультация")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("60 минут · заказ #EH-100").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Модератор")).toBeInTheDocument();
    expect(screen.getAllByText("Клиент и астролог").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Спор открыт")).toBeInTheDocument();
    expect(screen.queryByText("moderator")).not.toBeInTheDocument();
    expect(screen.queryByText("all_case_participants")).not.toBeInTheDocument();
    expect(screen.queryByText("review.dispute.opened")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Кому видно сообщение"), {
      target: { value: "client_and_moderators" }
    });
    fireEvent.change(screen.getByLabelText("Сообщение по спору"), {
      target: { value: "Уточните, пожалуйста, дату оказания услуги." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(api.createModerationCaseMessage).toHaveBeenCalledWith(
        "10000000-0000-4000-8000-000000000301",
        {
          visibility: "client_and_moderators",
          body: "Уточните, пожалуйста, дату оказания услуги."
        },
        expect.stringMatching(/^admin-reviews:/)
      );
    });
  });

  it("keeps closed dispute history visible without mutation controls", async () => {
    const api = createApi({
      review: {
        visibilityStatus: "visible",
        disputeStatus: "resolved_closed",
        moderationCase: {
          ...reviewDetail().moderationCase!,
          status: "closed",
          closedAt: "2026-08-21T09:00:00.000Z"
        }
      },
      caseDetail: {
        status: "closed",
        closedAt: "2026-08-21T09:00:00.000Z"
      }
    });

    render(<AdminReviewsPage api={api} />);

    expect(await screen.findByText("Спор закрыт")).toBeInTheDocument();
    expect(screen.getByText("Прошу уточнить спорный факт по консультации.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Статус спора" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Обновить статус" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Кому видно сообщение")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Сообщение по спору")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отправить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вернуть публикацию" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Скрыть модерацией" })).not.toBeInTheDocument();
  });
});

function createApi(options?: {
  readonly review?: Partial<ReviewAdminDetail>;
  readonly caseDetail?: Partial<ReviewModerationCaseDetail>;
}): AdminReviewsApi {
  const detail = { ...reviewDetail(), ...options?.review };
  const moderationCaseDetail = { ...caseDetail(), ...options?.caseDetail };

  return {
    listModerationQueue: vi.fn(
      async (): Promise<ReviewModerationQueueResponse> => ({
        items: [
          {
            queueItemId: "review_version:10000000-0000-4000-8000-000000000201",
            kind: "review_version",
            reviewId: "10000000-0000-4000-8000-000000000200",
            reviewVersionId: "10000000-0000-4000-8000-000000000201",
            replyVersionId: null,
            caseId: null,
            caseStatus: null,
            submittedAt: "2026-08-20T10:00:00.000Z",
            client: detail.client,
            publicIdentityMode: "named",
            visibilityStatus: detail.visibilityStatus,
            disputeStatus: detail.disputeStatus,
            reviewableInstance: detail.reviewableInstance,
            rating: 5,
            text: "Очень помогло, но есть вопрос по длительности."
          }
        ],
        nextCursor: null
      })
    ),
    getReviewDetail: vi.fn(async () => detail),
    getModerationCaseDetail: vi.fn(async () => moderationCaseDetail),
    approveReviewVersion: vi.fn(async () => detail),
    rejectReviewVersion: vi.fn(async () => detail),
    approveReviewReplyVersion: vi.fn(async () => detail),
    rejectReviewReplyVersion: vi.fn(async () => detail),
    restoreReviewAfterDispute: vi.fn(async () => detail),
    hideReviewByModeration: vi.fn(async () => detail),
    createModerationCaseMessage: vi.fn(
      async (): Promise<ReviewModerationCaseMessage> => ({
        messageId: "10000000-0000-4000-8000-000000000305",
        authorRole: "moderator",
        visibility: "client_and_moderators",
        body: "Уточните, пожалуйста, дату оказания услуги.",
        createdAt: "2026-08-21T09:30:00.000Z"
      })
    ),
    updateModerationCaseStatus: vi.fn(async () => moderationCaseDetail)
  };
}

function reviewDetail(): ReviewAdminDetail {
  return {
    reviewId: "10000000-0000-4000-8000-000000000200",
    client: {
      clientUserId: "10000000-0000-4000-8000-000000000202",
      displayName: "Анна Петрова",
      initials: "АП",
      avatarUrl: null
    },
    publicIdentityMode: "named",
    visibilityStatus: "temporarily_hidden_by_dispute",
    disputeStatus: "waiting_client",
    reviewableInstance: {
      id: "10000000-0000-4000-8000-000000000203",
      kind: "booking",
      status: "review_submitted",
      title: "Солярная консультация",
      contextLabel: "60 минут · заказ #EH-100",
      receivedAt: "2026-08-19T10:00:00.000Z",
      reviewWindowClosesAt: "2026-09-02T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt"
    },
    versions: [
      {
        id: "10000000-0000-4000-8000-000000000201",
        versionNumber: 1,
        rating: 5,
        text: "Очень помогло, но есть вопрос по длительности.",
        publicIdentityMode: "named",
        moderationStatus: "pending",
        moderationReasonCode: null,
        submittedAt: "2026-08-20T10:00:00.000Z",
        decidedAt: null
      }
    ],
    replyVersions: [],
    moderationCase: {
      caseId: "10000000-0000-4000-8000-000000000301",
      status: "waiting_client",
      openedAt: "2026-08-20T12:00:00.000Z",
      closedAt: null,
      reasonCode: "fraud_or_conflict"
    },
    auditTrail: [
      {
        id: "10000000-0000-4000-8000-000000000401",
        actorUserId: "10000000-0000-4000-8000-000000000402",
        action: "review.dispute.opened",
        occurredAt: "2026-08-20T12:00:00.000Z",
        metadata: {
          caseId: "10000000-0000-4000-8000-000000000301"
        }
      }
    ],
    auditCursor: null
  };
}

function caseDetail(): ReviewModerationCaseDetail {
  return {
    caseId: "10000000-0000-4000-8000-000000000301",
    reviewId: "10000000-0000-4000-8000-000000000200",
    status: "waiting_client",
    openedAt: "2026-08-20T12:00:00.000Z",
    closedAt: null,
    serviceContext: {
      title: "Солярная консультация",
      contextLabel: "60 минут · заказ #EH-100"
    },
    messages: [
      {
        messageId: "10000000-0000-4000-8000-000000000302",
        authorRole: "moderator",
        visibility: "all_case_participants",
        body: "Прошу уточнить спорный факт по консультации.",
        createdAt: "2026-08-20T12:05:00.000Z"
      }
    ]
  };
}
