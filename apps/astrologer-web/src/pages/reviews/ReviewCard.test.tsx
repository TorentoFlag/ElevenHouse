// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { ReviewAstrologerItem, ReviewModerationCaseDetail } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewCaseState, ReviewsPageCopy } from "./ReviewsPage";
import { ReviewCard } from "./ReviewCard";

afterEach(cleanup);

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
        aiDraftState={{ status: "idle" }}
        disputeDraft={null}
        caseState={caseState}
        caseMessageDraft="Готов обсудить детали консультации."
        replyActive={false}
        disputeActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={vi.fn()}
        onCancelDispute={vi.fn()}
        onEditDispute={vi.fn()}
        onEditCaseMessage={onEditCaseMessage}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSubmitDispute={vi.fn()}
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

  it("keeps the published review text visible while a client edit is pending", () => {
    render(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithPendingEdit}
        replyDraft=""
        aiDraftState={{ status: "idle" }}
        disputeDraft={null}
        caseState={undefined}
        caseMessageDraft=""
        replyActive={false}
        disputeActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={vi.fn()}
        onCancelDispute={vi.fn()}
        onEditDispute={vi.fn()}
        onEditCaseMessage={vi.fn()}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSubmitDispute={vi.fn()}
        onSubmitCaseMessage={vi.fn()}
      />
    );

    expect(screen.getByText("Очень бережная консультация.")).toBeVisible();
    expect(screen.getByText("Новая версия отзыва ожидает модерацию.")).toBeVisible();
    expect(screen.getByText("4 / 5")).toBeVisible();
    expect(screen.getAllByText("На модерации")).toHaveLength(2);
  });

  it("keeps the published astrologer reply visible while a reply edit is pending", () => {
    render(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithPendingReplyEdit}
        replyDraft=""
        aiDraftState={{ status: "idle" }}
        disputeDraft={null}
        caseState={undefined}
        caseMessageDraft=""
        replyActive={false}
        disputeActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={vi.fn()}
        onCancelDispute={vi.fn()}
        onEditDispute={vi.fn()}
        onEditCaseMessage={vi.fn()}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSubmitDispute={vi.fn()}
        onSubmitCaseMessage={vi.fn()}
      />
    );

    expect(screen.getByText("Ваш ответ")).toBeVisible();
    expect(screen.getByText("Спасибо за доверие, рад был помочь.")).toBeVisible();
    expect(screen.getByText("Ответ на модерации")).toBeVisible();
    expect(screen.getByText("Обновленная версия ответа ожидает модерацию.")).toBeVisible();
  });

  it("collects an explicit dispute reason and note before submitting", () => {
    const onStartDispute = vi.fn();
    const onEditDispute = vi.fn();
    const onSubmitDispute = vi.fn();

    render(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithPendingEdit}
        replyDraft=""
        aiDraftState={{ status: "idle" }}
        disputeDraft={{
          reasonCode: "fraud_or_conflict",
          note: "Отзыв не соответствует фактической услуге."
        }}
        caseState={undefined}
        caseMessageDraft=""
        replyActive={false}
        disputeActive
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={onStartDispute}
        onCancelDispute={vi.fn()}
        onEditDispute={onEditDispute}
        onEditCaseMessage={vi.fn()}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSubmitDispute={onSubmitDispute}
        onSubmitCaseMessage={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Причина спора"), {
      target: { value: "not_service_related" }
    });
    fireEvent.change(screen.getByLabelText("Комментарий для модератора"), {
      target: { value: "Клиент описывает услугу, которую я не проводил." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Открыть спор" }));

    expect(onStartDispute).not.toHaveBeenCalled();
    expect(onEditDispute).toHaveBeenCalledWith({
      reasonCode: "not_service_related",
      note: "Отзыв не соответствует фактической услуге."
    });
    expect(onEditDispute).toHaveBeenCalledWith({
      reasonCode: "fraud_or_conflict",
      note: "Клиент описывает услугу, которую я не проводил."
    });
    expect(onSubmitDispute).toHaveBeenCalledTimes(1);
  });

  it("shows safe AI draft loading and error states for one reply action", () => {
    const onCreateAiDraft = vi.fn();

    const { rerender } = render(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithPendingEdit}
        replyDraft=""
        aiDraftState={{ status: "loading" }}
        disputeDraft={null}
        caseState={undefined}
        caseMessageDraft=""
        replyActive={false}
        disputeActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={vi.fn()}
        onCancelDispute={vi.fn()}
        onEditDispute={vi.fn()}
        onEditCaseMessage={vi.fn()}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={onCreateAiDraft}
        onSubmitDispute={vi.fn()}
        onSubmitCaseMessage={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Готовим черновик/ })).toBeDisabled();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Готовим черновик...");

    rerender(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithPendingEdit}
        replyDraft=""
        aiDraftState={{ status: "error" }}
        disputeDraft={null}
        caseState={undefined}
        caseMessageDraft=""
        replyActive={false}
        disputeActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={vi.fn()}
        onCancelDispute={vi.fn()}
        onEditDispute={vi.fn()}
        onEditCaseMessage={vi.fn()}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={onCreateAiDraft}
        onSubmitDispute={vi.fn()}
        onSubmitCaseMessage={vi.fn()}
      />
    );

    expect(screen.getByText("AI-черновик не удалось создать. Попробуйте ещё раз.")).toBeVisible();
    expect(screen.queryByText("openai")).not.toBeInTheDocument();
  });

  it("marks generated AI drafts as text that must be reviewed before submission", () => {
    render(
      <ReviewCard
        copy={copy}
        locale="ru"
        review={reviewWithPendingEdit}
        replyDraft="Спасибо за отзыв."
        aiDraftState={{ status: "ready" }}
        disputeDraft={null}
        caseState={undefined}
        caseMessageDraft=""
        replyActive
        disputeActive={false}
        commandPending={false}
        onStartReply={vi.fn()}
        onCancelReply={vi.fn()}
        onEditReply={vi.fn()}
        onStartDispute={vi.fn()}
        onCancelDispute={vi.fn()}
        onEditDispute={vi.fn()}
        onEditCaseMessage={vi.fn()}
        onSubmitReply={vi.fn()}
        onCreateAiDraft={vi.fn()}
        onSubmitDispute={vi.fn()}
        onSubmitCaseMessage={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Спасибо за отзыв.")).toBeVisible();
    expect(screen.getByText("AI-черновик добавлен. Проверьте текст перед отправкой.")).toBeVisible();
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
  pendingVersion: null,
  pendingReplyVersion: null,
  moderationCase: {
    caseId,
    status: "waiting_astrologer",
    openedAt: "2026-08-21T09:00:00.000Z",
    closedAt: null,
    reasonCode: "other"
  }
} satisfies ReviewAstrologerItem;

const reviewWithPendingEdit = {
  ...reviewWithCase,
  visibilityStatus: "visible",
  disputeStatus: "none",
  pendingVersion: {
    id: "61111111-1111-4111-8111-111111111111",
    versionNumber: 2,
    rating: 4,
    text: "Новая версия отзыва ожидает модерацию.",
    publicIdentityMode: "named",
    moderationStatus: "pending",
    moderationReasonCode: null,
    submittedAt: "2026-08-21T09:00:00.000Z",
    decidedAt: null
  },
  moderationCase: null
} satisfies ReviewAstrologerItem;

const reviewWithPendingReplyEdit = {
  ...reviewWithCase,
  visibilityStatus: "visible",
  disputeStatus: "none",
  activePublicReplyVersion: {
    id: "61111111-1111-4111-8111-111111111111",
    versionNumber: 1,
    text: "Спасибо за доверие, рад был помочь.",
    moderationStatus: "approved",
    moderationReasonCode: null,
    submittedAt: "2026-08-20T12:00:00.000Z",
    decidedAt: "2026-08-20T13:00:00.000Z"
  },
  pendingReplyVersion: {
    id: "91111111-1111-4111-8111-111111111111",
    versionNumber: 2,
    text: "Обновленная версия ответа ожидает модерацию.",
    moderationStatus: "pending",
    moderationReasonCode: null,
    submittedAt: "2026-08-21T09:20:00.000Z",
    decidedAt: null
  },
  moderationCase: null
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
