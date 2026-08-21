// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewsPageCopy } from "./ReviewsPage";
import { ReviewsPageView } from "./ReviewsPageView";

afterEach(cleanup);

describe("ReviewsPageView", () => {
  it("opens a manual request-review dialog without claiming an in-app send", () => {
    const onOpenRequestReview = vi.fn();
    const onCopyRequestReview = vi.fn();

    const { rerender } = renderView({
      requestReviewOpen: false,
      requestReviewCopied: false,
      onOpenRequestReview,
      onCopyRequestReview
    });

    fireEvent.click(screen.getByRole("button", { name: "Запросить отзыв" }));
    expect(onOpenRequestReview).toHaveBeenCalledTimes(1);

    rerender(
      renderViewElement({
        requestReviewOpen: true,
        requestReviewCopied: true,
        onOpenRequestReview,
        onCopyRequestReview
      })
    );

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(
      screen.getByText(/ElevenHouse не помечает такой запрос как отправленный/)
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Скопировать текст" }));
    expect(onCopyRequestReview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Текст скопирован.")).toBeVisible();
  });
});

function renderView(overrides: Partial<ReviewsPageViewPropsForTest> = {}) {
  return render(renderViewElement(overrides));
}

function renderViewElement(overrides: Partial<ReviewsPageViewPropsForTest> = {}) {
  const props: ReviewsPageViewPropsForTest = {
    requestReviewOpen: false,
    requestReviewCopied: false,
    onOpenRequestReview: vi.fn(),
    onCopyRequestReview: vi.fn(),
    ...overrides
  };

  return (
    <ReviewsPageView
      copy={copy}
      locale="ru"
      reviews={[]}
      summary={{
        averageRating: "—",
        publishedCount: 0,
        totalCount: 0,
        distribution: [
          { rating: 5, count: 0 },
          { rating: 4, count: 0 },
          { rating: 3, count: 0 },
          { rating: 2, count: 0 },
          { rating: 1, count: 0 }
        ]
      }}
      counts={{ all: 0, published: 0, pending: 0, hidden: 0 }}
      selectedFilter="all"
      requestReviewOpen={props.requestReviewOpen}
      requestReviewCopied={props.requestReviewCopied}
      replyTargetId={null}
      replyDrafts={{}}
      aiDraftStates={{}}
      disputeTargetId={null}
      disputeDrafts={{}}
      caseStates={{}}
      caseMessageDrafts={{}}
      isLoading={false}
      isError={false}
      isCommandPending={false}
      commandError={null}
      onFilterChange={vi.fn()}
      onRefresh={vi.fn()}
      onOpenRequestReview={props.onOpenRequestReview}
      onCloseRequestReview={vi.fn()}
      onCopyRequestReview={props.onCopyRequestReview}
      onStartReply={vi.fn()}
      onCancelReply={vi.fn()}
      onStartDispute={vi.fn()}
      onCancelDispute={vi.fn()}
      onEditReply={vi.fn()}
      onEditDispute={vi.fn()}
      onEditCaseMessage={vi.fn()}
      onSubmitReply={vi.fn()}
      onCreateAiDraft={vi.fn()}
      onSubmitDispute={vi.fn()}
      onSubmitCaseMessage={vi.fn()}
    />
  );
}

type ReviewsPageViewPropsForTest = {
  readonly requestReviewOpen: boolean;
  readonly requestReviewCopied: boolean;
  readonly onOpenRequestReview: () => void;
  readonly onCopyRequestReview: () => void;
};

const copy = {
  documentTitle: "ElevenHouse | Отзывы",
  title: "Отзывы",
  filterAriaLabel: "Фильтр отзывов",
  requestReviewLabel: "Запросить отзыв",
  requestReview: {
    title: "Запросить отзыв",
    description:
      "Подготовьте текст запроса и отправьте клиенту в вашем рабочем канале. ElevenHouse не помечает такой запрос как отправленный, пока production messaging flow не подключен.",
    messageLabel: "Текст запроса",
    defaultMessage: "Пожалуйста, оставьте отзыв в ElevenHouse.",
    copyLabel: "Скопировать текст",
    copiedLabel: "Текст скопирован.",
    closeLabel: "Закрыть"
  },
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
    aiLabel: "AI-ответ",
    aiLoadingLabel: "Готовим черновик...",
    aiReadyLabel: "AI-черновик добавлен. Проверьте текст перед отправкой.",
    aiErrorLabel: "AI-черновик не удалось создать. Попробуйте ещё раз."
  },
  dispute: {
    label: "Оспорить",
    reasonLabel: "Причина спора",
    noteLabel: "Комментарий для модератора",
    placeholder: "Коротко опишите, что именно нужно проверить.",
    submitLabel: "Открыть спор",
    cancelLabel: "Отмена",
    reasons: {
      spam: "Спам",
      abuse_or_hate: "Оскорбления или ненависть",
      personal_data_exposure: "Персональные данные",
      off_topic: "Не по теме",
      not_service_related: "Не относится к услуге",
      fraud_or_conflict: "Недостоверный отзыв или конфликт",
      duplicate: "Дубликат",
      legal_risk: "Юридический риск",
      other: "Другое"
    }
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
  commandError: "Команду не удалось выполнить."
} satisfies ReviewsPageCopy;
