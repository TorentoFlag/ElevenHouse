// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { ReviewAstrologerItem, ReviewModerationCaseDetail } from "@elevenhouse/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewCaseState, ReviewsPageCopy } from "./ReviewsPage";
import { ReviewCard } from "./ReviewCard";

describe("ReviewCard", () => {
  it("renders moderation case thread and submits an astrologer message draft", () => {
    const onEditCaseMessage = vi.fn();
    const onSubmitCaseMessage = vi.fn();

    render(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithCase}
        replyDraft=""
        caseState={caseState}
        caseMessageDraft="Готов обсудить детали консультации."
        replyActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onEditCaseMessage={onEditCaseMessage}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onOpenDispute={vi.fn()}
        onSubmitCaseMessage={onSubmitCaseMessage}
      />
    );

    expect(screen.getByText("Спор и уточнения")).toBeVisible();
    expect(screen.getByText("Ждём астролога")).toBeVisible();
    expect(screen.getByText("Пришлите контекст оказанной услуги.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение по спору" }), {
      target: { value: "Отвечаю модератору." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(onEditCaseMessage).toHaveBeenCalledWith("Отвечаю модератору.");
    expect(onSubmitCaseMessage).toHaveBeenCalledTimes(1);
  });
});

const caseId = "51111111-1111-4111-8111-111111111111";
const reviewWithCase = {
  reviewId: "11111111-1111-4111-8111-111111111111",
  visibilityStatus: "temporarily_hidden_by_dispute",
  disputeStatus: "waiting_astrologer",
  reviewableInstance: {
    id: "21111111-1111-4111-8111-111111111111",
    kind: "booking",
    status: "review_submitted",
    title: "Натальный разбор",
    contextLabel: "Сессия завершена",
    receivedAt: "2026-08-20T09:00:00.000Z",
    reviewWindowClosesAt: "2026-09-03T09:00:00.000Z",
    windowPolicy: "standard_14_days_after_receipt"
  },
  author: {
    publicIdentityMode: "named",
    displayName: "Марина К.",
    initials: "МК",
    avatarUrl: null
  },
  activePublicVersion: {
    id: "71111111-1111-4111-8111-111111111111",
    versionNumber: 1,
    rating: 5,
    text: "Очень бережная консультация.",
    publicIdentityMode: "named",
    moderationStatus: "approved",
    moderationReasonCode: null,
    submittedAt: "2026-08-20T10:00:00.000Z",
    decidedAt: "2026-08-20T11:00:00.000Z"
  },
  activePublicReplyVersion: null,
  pendingReplyVersion: null,
  moderationCase: {
    caseId,
    status: "waiting_astrologer",
    openedAt: "2026-08-21T09:00:00.000Z",
    closedAt: null,
    reasonCode: "other"
  }
} satisfies ReviewAstrologerItem;

const caseDetail = {
  caseId,
  reviewId: reviewWithCase.reviewId,
  status: "waiting_astrologer",
  openedAt: "2026-08-21T09:00:00.000Z",
  closedAt: null,
  serviceContext: {
    title: "Натальный разбор",
    contextLabel: "Сессия завершена"
  },
  messages: [
    {
      messageId: "81111111-1111-4111-8111-111111111111",
      authorRole: "moderator",
      visibility: "astrologer_and_moderators",
      body: "Пришлите контекст оказанной услуги.",
      createdAt: "2026-08-21T09:05:00.000Z"
    }
  ]
} satisfies ReviewModerationCaseDetail;

const caseState = {
  status: "ready",
  detail: caseDetail
} satisfies ReviewCaseState;

const copy = {
  documentTitle: "ElevenHouse | Отзывы",
  title: "Отзывы",
  filterAriaLabel: "Фильтр отзывов",
  requestReviewLabel: "Запросить отзыв",
  requestReviewUnavailableLabel: "Недоступно",
  loadingLabel: "Загружаем отзывы",
  emptyLabel: "Отзывов пока нет",
  errorLabel: "Не удалось загрузить отзывы",
  retryLabel: "Повторить",
  publishedCountLabel: (count: number, total: number) => `${count}/${total}`,
  filters: {
    all: "Все",
    published: "Опубликованы",
    pending: "На модерации",
    hidden: "Скрытые"
  },
  status: {
    published: "Опубликован",
    pending: "На модерации",
    hidden: "Скрыт"
  },
  reply: {
    ownReplyLabel: "Ваш ответ",
    pendingReplyLabel: "Ответ на модерации",
    placeholder: "Ваш публичный ответ...",
    submitLabel: "Ответить",
    cancelLabel: "Отмена",
    startLabel: "Ответить",
    aiLabel: "AI-ответ"
  },
  caseThread: {
    title: "Спор и уточнения",
    loadingLabel: "Загружаем переписку",
    errorLabel: "Не удалось загрузить переписку",
    messageLabel: "Сообщение по спору",
    placeholder: "Ответьте модератору и клиенту...",
    submitLabel: "Отправить",
    status: {
      open: "Открыт",
      closed: "Закрыт",
      waiting_client: "Ждём клиента",
      waiting_astrologer: "Ждём астролога",
      consensus_reached: "Консенсус найден"
    },
    author: {
      client: "Клиент",
      astrologer: "Вы",
      moderator: "Модератор",
      system: "Система"
    }
  },
  disputeLabel: "Оспорить",
  disputeDefaultNote: "Астролог открыл спор из раздела отзывов.",
  commandError: "Команду не удалось выполнить."
} satisfies ReviewsPageCopy;
