// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { ClientReviewDetail, ReviewModerationCaseDetail } from "@elevenhouse/contracts";
import { I18nProvider } from "@elevenhouse/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { ClientReviewsPage } from "./ClientReviewsPage";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../Application", () => ({ application: { http } }));

afterEach(cleanup);

describe("ClientReviewsPage", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
  });

  it("renders reviewable products and submits an anonymous review version", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/reviews/reviewable-instances?limit=30") {
        return { items: [newReviewDetail.reviewableInstance], nextCursor: null };
      }
      if (path === `/me/reviews/reviewable-instances/${reviewableInstanceId}`) {
        return newReviewDetail;
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    http.post.mockResolvedValueOnce({ ...newReviewDetail, pendingVersion });

    renderPage();
    expect(await screen.findByText("Прогностика на месяц")).toBeVisible();
    fireEvent.change(await screen.findByRole("textbox", { name: "Текст отзыва" }), {
      target: { value: "Очень точная консультация" }
    });
    fireEvent.click(screen.getByLabelText("Опубликовать анонимно"));
    fireEvent.click(screen.getByRole("button", { name: /Отправить на модерацию/ }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        "/me/reviews/versions",
        expect.objectContaining({
          reviewableInstanceId,
          text: "Очень точная консультация",
          publicIdentityMode: "secret_user"
        }),
        expect.objectContaining({ csrf: true })
      )
    );
    expect(await screen.findByText("Отзыв отправлен на модерацию.")).toBeVisible();
  });

  it("keeps active public review visible while edited version is pending", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/reviews/reviewable-instances?limit=30") {
        return { items: [editedReviewDetail.reviewableInstance], nextCursor: null };
      }
      if (path === `/me/reviews/reviewable-instances/${reviewableInstanceId}`) {
        return editedReviewDetail;
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    renderPage();
    expect(await screen.findByText("Старая опубликованная версия")).toBeVisible();
    await waitFor(() => expect(screen.getAllByText("Очень точная консультация").length).toBe(2));
    expect(screen.getByText("На модерации")).toBeVisible();
  });

  it("loads moderation case thread and sends a client message", async () => {
    let postedBody: unknown = null;
    http.get.mockImplementation(async (path: string) => {
      if (path === "/me/reviews/reviewable-instances?limit=30") {
        return { items: [caseReviewDetail.reviewableInstance], nextCursor: null };
      }
      if (path === `/me/reviews/reviewable-instances/${reviewableInstanceId}`) {
        return caseReviewDetail;
      }
      if (path === `/me/reviews/moderation-cases/${caseId}`) {
        return caseDetail;
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    http.post.mockImplementation(async (_path: string, body: unknown) => {
      postedBody = body;
      return clientCaseMessage;
    });

    renderPage();

    expect(await screen.findByText("Уточните контекст консультации.")).toBeVisible();
    expect(screen.getByText("Статус: Ждём клиента")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение по спору" }), {
      target: { value: "Речь про прогноз на вторую неделю." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        `/me/reviews/moderation-cases/${caseId}/messages`,
        expect.objectContaining({
          body: "Речь про прогноз на вторую неделю.",
          visibility: "all_case_participants"
        }),
        expect.objectContaining({ csrf: true, idempotencyKey: expect.any(String) })
      )
    );
    expect(postedBody).toEqual({
      body: "Речь про прогноз на вторую неделю.",
      visibility: "all_case_participants"
    });
    expect(await screen.findByText("Сообщение отправлено.")).toBeVisible();
    expect(screen.getByText("Речь про прогноз на вторую неделю.")).toBeVisible();
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider dictionaries={clientCopyByLocale}>
        <ClientReviewsPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

const reviewableInstanceId = "10000000-0000-4000-8000-000000000103";
const baseInstance = {
  id: reviewableInstanceId,
  kind: "booking",
  status: "reviewable",
  title: "Прогностика на месяц",
  contextLabel: "Консультация завершена",
  receivedAt: "2026-08-20T10:00:00.000Z",
  reviewWindowClosesAt: "2026-09-03T10:00:00.000Z",
  windowPolicy: "standard_14_days_after_receipt"
} satisfies ClientReviewDetail["reviewableInstance"];

const pendingVersion = {
  id: "10000000-0000-4000-8000-000000000106",
  versionNumber: 1,
  rating: 5,
  text: "Очень точная консультация",
  publicIdentityMode: "secret_user",
  moderationStatus: "pending",
  moderationReasonCode: null,
  submittedAt: "2026-08-21T10:10:00.000Z",
  decidedAt: null
} satisfies ClientReviewDetail["pendingVersion"];

const newReviewDetail = {
  reviewId: null,
  reviewableInstance: baseInstance,
  activePublicVersion: null,
  pendingVersion: null,
  moderationCase: null,
  canSubmitNewVersion: true,
  canEditLatestVersion: false
} satisfies ClientReviewDetail;

const editedReviewDetail = {
  ...newReviewDetail,
  reviewId: "10000000-0000-4000-8000-000000000104",
  activePublicVersion: {
    id: "10000000-0000-4000-8000-000000000105",
    versionNumber: 1,
    rating: 4,
    text: "Старая опубликованная версия",
    publicIdentityMode: "named",
    moderationStatus: "approved",
    moderationReasonCode: null,
    submittedAt: "2026-08-20T10:10:00.000Z",
    decidedAt: "2026-08-20T11:10:00.000Z"
  },
  pendingVersion,
  canSubmitNewVersion: false,
  canEditLatestVersion: false
} satisfies ClientReviewDetail;

const caseId = "10000000-0000-4000-8000-000000000108";
const caseReviewDetail = {
  ...editedReviewDetail,
  moderationCase: {
    caseId,
    status: "waiting_client",
    openedAt: "2026-08-21T09:00:00.000Z",
    closedAt: null,
    reasonCode: "other"
  }
} satisfies ClientReviewDetail;

const clientCaseMessage = {
  messageId: "10000000-0000-4000-8000-000000000110",
  authorRole: "client",
  visibility: "all_case_participants",
  body: "Речь про прогноз на вторую неделю.",
  createdAt: "2026-08-21T09:20:00.000Z"
} satisfies ReviewModerationCaseDetail["messages"][number];

const caseDetail = {
  caseId,
  reviewId: "10000000-0000-4000-8000-000000000104",
  status: "waiting_client",
  openedAt: "2026-08-21T09:00:00.000Z",
  closedAt: null,
  serviceContext: {
    title: "Прогностика на месяц",
    contextLabel: "Консультация завершена"
  },
  messages: [
    {
      messageId: "10000000-0000-4000-8000-000000000109",
      authorRole: "moderator",
      visibility: "all_case_participants",
      body: "Уточните контекст консультации.",
      createdAt: "2026-08-21T09:05:00.000Z"
    }
  ]
} satisfies ReviewModerationCaseDetail;
