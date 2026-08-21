// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewsPageCopy } from "./ReviewsPage";
import { ReviewsPageView } from "./ReviewsPageView";

afterEach(cleanup);

describe("ReviewsPageView", () => {
  it("opens a request-review dialog with real target and channel controls", () => {
    const onOpenRequestReview = vi.fn();
    const onSendReviewRequest = vi.fn();

    const { rerender } = renderView({
      requestReviewOpen: false,
      onOpenRequestReview,
      onSendReviewRequest
    });

    fireEvent.click(screen.getByRole("button", { name: "Запросить отзыв" }));
    expect(onOpenRequestReview).toHaveBeenCalledTimes(1);

    rerender(
      renderViewElement({
        requestReviewOpen: true,
        onOpenRequestReview,
        onSendReviewRequest
      })
    );

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText("Клиент и услуга")).toHaveValue(reviewableInstanceId);
    expect(screen.getByLabelText("Канал доставки")).toHaveValue(threadId);
    fireEvent.click(screen.getByRole("button", { name: "Отправить запрос" }));
    expect(onSendReviewRequest).toHaveBeenCalledTimes(1);
  });
});

function renderView(overrides: Partial<ReviewsPageViewPropsForTest> = {}) {
  return render(renderViewElement(overrides));
}

function renderViewElement(overrides: Partial<ReviewsPageViewPropsForTest> = {}) {
  const props: ReviewsPageViewPropsForTest = {
    requestReviewOpen: false,
    onOpenRequestReview: vi.fn(),
    onSendReviewRequest: vi.fn(),
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
      requestReviewTargets={[reviewRequestTarget]}
      requestReviewThreads={[messagingThread]}
      selectedRequestTargetId={reviewableInstanceId}
      selectedRequestThreadId={threadId}
      requestReviewMessage="Пожалуйста, оставьте отзыв в ElevenHouse."
      requestReviewLoading={false}
      requestReviewError={false}
      requestReviewPending={false}
      requestReviewSent={false}
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
      onRequestTargetChange={vi.fn()}
      onRequestThreadChange={vi.fn()}
      onRequestMessageChange={vi.fn()}
      onSendReviewRequest={props.onSendReviewRequest}
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
  readonly onOpenRequestReview: () => void;
  readonly onSendReviewRequest: () => void;
};

const reviewableInstanceId = "21111111-1111-4111-8111-111111111111";
const clientUserId = "b1111111-1111-4111-8111-111111111111";
const threadId = "91111111-1111-4111-8111-111111111111";

const copy = {
  documentTitle: "ElevenHouse | Отзывы",
  title: "Отзывы",
  filterAriaLabel: "Фильтр отзывов",
  requestReviewLabel: "Запросить отзыв",
  requestReview: {
    title: "Запросить отзыв",
    description:
      "Выберите услугу и рабочий канал клиента. Запрос уйдёт обычным сообщением и попадёт в очередь доставки.",
    targetLabel: "Клиент и услуга",
    threadLabel: "Канал доставки",
    messageLabel: "Текст запроса",
    defaultMessage: "Пожалуйста, оставьте отзыв в ElevenHouse.",
    sendLabel: "Отправить запрос",
    sendingLabel: "Отправляем...",
    sentLabel: "Запрос поставлен в очередь доставки.",
    loadingLabel: "Загружаем клиентов и каналы",
    errorLabel: "Не удалось загрузить услуги или каналы.",
    emptyTargetsLabel: "Нет услуг, по которым сейчас можно запросить отзыв.",
    emptyThreadsLabel: "Нет связанного открытого канала для этого клиента.",
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

const reviewRequestTarget = {
  reviewableInstance: {
    id: reviewableInstanceId,
    kind: "booking",
    status: "reviewable",
    title: "Натальный разбор",
    contextLabel: "Сессия завершена",
    receivedAt: "2026-08-20T09:00:00.000Z",
    reviewWindowClosesAt: "2026-09-03T09:00:00.000Z",
    windowPolicy: "standard_14_days_after_receipt"
  },
  client: {
    clientUserId,
    displayName: "Марина К.",
    initials: "МК",
    avatarUrl: null
  }
} as const;

const messagingThread = {
  id: threadId,
  clientUserId,
  linkedClient: { userId: clientUserId, displayName: "Марина К.", birthDate: null },
  status: "open",
  primaryIdentity: {
    id: "a1111111-1111-4111-8111-111111111111",
    channelConnectionId: "c1111111-1111-4111-8111-111111111111",
    provider: "telegram",
    providerUserId: null,
    providerChatId: "123",
    username: "marina",
    displayName: "Марина",
    avatarMediaId: null,
    linkedClientUserId: clientUserId,
    linkStatus: "linked",
    firstSeenAt: "2026-08-20T09:00:00.000Z",
    lastSeenAt: "2026-08-20T09:00:00.000Z"
  },
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  createdAt: "2026-08-20T09:00:00.000Z",
  updatedAt: "2026-08-20T09:00:00.000Z"
} as const;
