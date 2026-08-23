import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  MessagingThread,
  ReviewAstrologerItem,
  ReviewModerationCaseDetail,
  ReviewModerationReasonCode
} from "@elevenhouse/contracts";
import { useI18n, type SupportedLocale } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  astrologerReviewModerationCaseQueryOptions,
  astrologerReviewsListQueryOptions,
  reviewRequestTargetsQueryOptions
} from "../../features/reviews/model/reviewsQueryOptions";
import { listMessagingThreadsQueryOptions } from "../../features/messaging/model/messagingQueries";
import {
  type AstrologerReviewFilter,
  buildAstrologerReviewsSummary,
  countAstrologerReviewFilters,
  filterAstrologerReviews
} from "../../features/reviews/model/reviewsPresentation";
import {
  useCreateAstrologerReviewCaseMessageMutation,
  useCreateReviewReplyAiDraftMutation,
  useOpenReviewDisputeMutation,
  useRequestReviewMutation,
  useSubmitReviewReplyVersionMutation
} from "../../features/reviews/model/useReviewsMutations";
import { ReviewsPageView } from "./ReviewsPageView";

const pageSize = 50;

export function ReviewsPage() {
  const { locale } = useI18n();
  const copy = reviewsCopyByLocale[locale];
  const [filter, setFilter] = useState<AstrologerReviewFilter>("all");
  const [requestReviewOpen, setRequestReviewOpen] = useState(false);
  const [selectedRequestTargetId, setSelectedRequestTargetId] = useState("");
  const [selectedRequestThreadId, setSelectedRequestThreadId] = useState("");
  const [requestReviewMessage, setRequestReviewMessage] = useState(copy.requestReview.defaultMessage);
  const [requestReviewSent, setRequestReviewSent] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [aiDraftStates, setAiDraftStates] = useState<Record<string, AiDraftState>>({});
  const [disputeTargetId, setDisputeTargetId] = useState<string | null>(null);
  const [disputeDrafts, setDisputeDrafts] = useState<Record<string, DisputeDraft>>({});
  const [caseMessageDrafts, setCaseMessageDrafts] = useState<Record<string, string>>({});
  const reviewsQuery = useQuery(
    astrologerReviewsListQueryOptions({ limit: pageSize, cursor: null })
  );
  const requestTargetsQuery = useQuery({
    ...reviewRequestTargetsQueryOptions({ limit: 50, cursor: null }),
    enabled: requestReviewOpen
  });
  const messagingThreadsQuery = useQuery({
    ...listMessagingThreadsQueryOptions({ limit: 100, offset: 0 }),
    enabled: requestReviewOpen
  });
  const submitReplyMutation = useSubmitReviewReplyVersionMutation();
  const aiDraftMutation = useCreateReviewReplyAiDraftMutation();
  const disputeMutation = useOpenReviewDisputeMutation();
  const caseMessageMutation = useCreateAstrologerReviewCaseMessageMutation();
  const requestReviewMutation = useRequestReviewMutation();
  const reviews = reviewsQuery.data?.items ?? [];
  const requestTargets = requestTargetsQuery.data?.items ?? [];
  const requestThreads = useMemo(
    () => filterRequestReviewThreads(messagingThreadsQuery.data?.threads ?? []),
    [messagingThreadsQuery.data?.threads]
  );
  const selectedRequestTarget =
    requestTargets.find((target) => target.reviewableInstance.id === selectedRequestTargetId) ??
    null;
  const selectedTargetThreads = useMemo(
    () =>
      selectedRequestTarget
        ? requestThreads.filter(
            (thread) => thread.clientUserId === selectedRequestTarget.client.clientUserId
          )
        : [],
    [requestThreads, selectedRequestTarget]
  );
  const visibleReviews = filterAstrologerReviews(reviews, filter);
  const reviewsWithCases = visibleReviews.filter((review) => review.moderationCase);
  const caseQueries = useQueries({
    queries: reviewsWithCases.map((review) =>
      astrologerReviewModerationCaseQueryOptions(review.moderationCase!.caseId)
    )
  });
  const caseStates = buildCaseStates(reviewsWithCases, caseQueries);
  const commandError =
    submitReplyMutation.error ??
    aiDraftMutation.error ??
    disputeMutation.error ??
    caseMessageMutation.error ??
    requestReviewMutation.error;

  useDocumentTitle(copy.documentTitle);

  useEffect(() => {
    if (!requestReviewOpen || selectedRequestTargetId || requestTargets.length === 0) return;
    setSelectedRequestTargetId(requestTargets[0]!.reviewableInstance.id);
  }, [requestReviewOpen, requestTargets, selectedRequestTargetId]);

  useEffect(() => {
    if (!requestReviewOpen) return;
    if (selectedTargetThreads.some((thread) => thread.id === selectedRequestThreadId)) return;
    setSelectedRequestThreadId(selectedTargetThreads[0]?.id ?? "");
  }, [requestReviewOpen, selectedRequestThreadId, selectedTargetThreads]);

  async function handleCreateAiDraft(review: ReviewAstrologerItem) {
    setAiDraftStates((current) => ({ ...current, [review.reviewId]: { status: "loading" } }));
    try {
      const result = await aiDraftMutation.mutateAsync({
        reviewId: review.reviewId,
        idempotencyKey: createCommandKey("reviews:reply-ai"),
        body: { locale }
      });
      setReplyTargetId(review.reviewId);
      setReplyDrafts((current) => ({ ...current, [review.reviewId]: result.draftText }));
      setAiDraftStates((current) => ({ ...current, [review.reviewId]: { status: "ready" } }));
    } catch {
      setAiDraftStates((current) => ({ ...current, [review.reviewId]: { status: "error" } }));
    }
  }

  async function handleSubmitReply(review: ReviewAstrologerItem) {
    const text = (replyDrafts[review.reviewId] ?? "").trim();
    if (!text) return;

    await submitReplyMutation.mutateAsync({
      reviewId: review.reviewId,
      idempotencyKey: createCommandKey("reviews:reply"),
      body: { text }
    });
    setReplyTargetId(null);
    setReplyDrafts((current) => {
      const next = { ...current };
      delete next[review.reviewId];
      return next;
    });
    setAiDraftStates((current) => {
      const next = { ...current };
      delete next[review.reviewId];
      return next;
    });
  }

  async function handleOpenDispute(review: ReviewAstrologerItem) {
    const draft = disputeDrafts[review.reviewId] ?? createEmptyDisputeDraft();
    const note = draft.note.trim();
    await disputeMutation.mutateAsync({
      reviewId: review.reviewId,
      idempotencyKey: createCommandKey("reviews:dispute"),
      body: { reasonCode: draft.reasonCode, note: note ? note : null }
    });
    setDisputeTargetId(null);
    setDisputeDrafts((current) => {
      const next = { ...current };
      delete next[review.reviewId];
      return next;
    });
  }

  async function handleSubmitCaseMessage(review: ReviewAstrologerItem) {
    const caseId = review.moderationCase?.caseId;
    if (!caseId) return;
    const body = (caseMessageDrafts[caseId] ?? "").trim();
    if (!body) return;

    await caseMessageMutation.mutateAsync({
      caseId,
      idempotencyKey: createCommandKey("reviews:case-message"),
      body: {
        visibility: "astrologer_and_moderators",
        body
      }
    });
    setCaseMessageDrafts((current) => ({ ...current, [caseId]: "" }));
  }

  async function handleSendReviewRequest() {
    const selectedTarget = selectedRequestTarget;
    const text = requestReviewMessage.trim();
    if (!selectedTarget || !selectedRequestThreadId || !text) return;

    await requestReviewMutation.mutateAsync({
      idempotencyKey: createCommandKey("reviews:request"),
      body: {
        reviewableInstanceId: selectedTarget.reviewableInstance.id,
        threadId: selectedRequestThreadId,
        text
      }
    });
    setRequestReviewSent(true);
  }

  return (
    <ReviewsPageView
      copy={copy}
      locale={locale}
      reviews={visibleReviews}
      summary={buildAstrologerReviewsSummary(reviews)}
      counts={countAstrologerReviewFilters(reviews)}
      selectedFilter={filter}
      requestReviewOpen={requestReviewOpen}
      requestReviewTargets={requestTargets}
      requestReviewThreads={requestThreads}
      selectedRequestTargetId={selectedRequestTargetId}
      selectedRequestThreadId={selectedRequestThreadId}
      requestReviewMessage={requestReviewMessage}
      requestReviewLoading={requestTargetsQuery.isLoading || messagingThreadsQuery.isLoading}
      requestReviewError={requestTargetsQuery.isError || messagingThreadsQuery.isError}
      requestReviewPending={requestReviewMutation.isPending}
      requestReviewSent={requestReviewSent}
      replyTargetId={replyTargetId}
      replyDrafts={replyDrafts}
      aiDraftStates={aiDraftStates}
      disputeTargetId={disputeTargetId}
      disputeDrafts={disputeDrafts}
      caseStates={caseStates}
      caseMessageDrafts={caseMessageDrafts}
      isLoading={reviewsQuery.isLoading}
      isError={reviewsQuery.isError}
      isCommandPending={
        submitReplyMutation.isPending ||
        aiDraftMutation.isPending ||
        disputeMutation.isPending ||
        caseMessageMutation.isPending ||
        requestReviewMutation.isPending
      }
      commandError={commandError ? copy.commandError : null}
      onFilterChange={setFilter}
      onRefresh={() => void reviewsQuery.refetch()}
      onOpenRequestReview={() => {
        setRequestReviewMessage(copy.requestReview.defaultMessage);
        setRequestReviewSent(false);
        setRequestReviewOpen(true);
      }}
      onCloseRequestReview={() => setRequestReviewOpen(false)}
      onRequestTargetChange={(reviewableInstanceId) => {
        setSelectedRequestTargetId(reviewableInstanceId);
        setRequestReviewSent(false);
      }}
      onRequestThreadChange={setSelectedRequestThreadId}
      onRequestMessageChange={(message) => {
        setRequestReviewMessage(message);
        setRequestReviewSent(false);
      }}
      onEditReply={(reviewId, value) =>
        setReplyDrafts((current) => ({ ...current, [reviewId]: value }))
      }
      onEditCaseMessage={(caseId, value) =>
        setCaseMessageDrafts((current) => ({ ...current, [caseId]: value }))
      }
      onStartReply={(review) => {
        setReplyTargetId(review.reviewId);
        setReplyDrafts((current) => ({
          ...current,
          [review.reviewId]: current[review.reviewId] ?? ""
        }));
      }}
      onCancelReply={() => setReplyTargetId(null)}
      onStartDispute={(review) => {
        setDisputeTargetId(review.reviewId);
        setDisputeDrafts((current) => ({
          ...current,
          [review.reviewId]: current[review.reviewId] ?? createEmptyDisputeDraft()
        }));
      }}
      onCancelDispute={() => setDisputeTargetId(null)}
      onEditDispute={(reviewId, draft) =>
        setDisputeDrafts((current) => ({ ...current, [reviewId]: draft }))
      }
      onSubmitReply={(review) => {
        void handleSubmitReply(review);
      }}
      onCreateAiDraft={(review) => {
        void handleCreateAiDraft(review);
      }}
      onSubmitDispute={(review) => {
        void handleOpenDispute(review);
      }}
      onSubmitCaseMessage={(review) => {
        void handleSubmitCaseMessage(review);
      }}
      onSendReviewRequest={() => {
        void handleSendReviewRequest();
      }}
    />
  );
}

function filterRequestReviewThreads(threads: readonly MessagingThread[]): readonly MessagingThread[] {
  return threads.filter(
    (thread) =>
      thread.clientUserId !== null &&
      thread.status === "open" &&
      thread.primaryIdentity !== null
  );
}

function buildCaseStates(
  reviews: readonly ReviewAstrologerItem[],
  queries: readonly {
    readonly data?: ReviewModerationCaseDetail;
    readonly isLoading: boolean;
    readonly isError: boolean;
  }[]
): Record<string, ReviewCaseState> {
  const entries: Array<[string, ReviewCaseState]> = [];
  reviews.forEach((review, index) => {
    const caseId = review.moderationCase?.caseId;
    const query = queries[index];
    if (!caseId || !query) return;
    if (query.data) {
      entries.push([caseId, { status: "ready", detail: query.data }]);
      return;
    }
    if (query.isError) {
      entries.push([caseId, { status: "error", detail: null }]);
      return;
    }
    entries.push([caseId, { status: "loading", detail: null }]);
  });
  return Object.fromEntries(entries);
}

export type ReviewCaseState = {
  readonly status: "loading" | "ready" | "error";
  readonly detail: ReviewModerationCaseDetail | null;
};

export type AiDraftState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready" }
  | { readonly status: "error" };

export type DisputeDraft = {
  readonly reasonCode: ReviewModerationReasonCode;
  readonly note: string;
};

function createEmptyDisputeDraft(): DisputeDraft {
  return { reasonCode: "fraud_or_conflict", note: "" };
}

function createCommandKey(scope: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${scope}:${crypto.randomUUID()}`;
  }
  return `${scope}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export type ReviewsPageCopy = {
  readonly documentTitle: string;
  readonly title: string;
  readonly filterAriaLabel: string;
  readonly requestReviewLabel: string;
  readonly requestReview: {
    readonly title: string;
    readonly description: string;
    readonly targetLabel: string;
    readonly threadLabel: string;
    readonly messageLabel: string;
    readonly defaultMessage: string;
    readonly sendLabel: string;
    readonly sendingLabel: string;
    readonly sentLabel: string;
    readonly loadingLabel: string;
    readonly errorLabel: string;
    readonly emptyTargetsLabel: string;
    readonly emptyThreadsLabel: string;
    readonly closeLabel: string;
  };
  readonly loadingLabel: string;
  readonly emptyLabel: string;
  readonly errorLabel: string;
  readonly retryLabel: string;
  readonly publishedCountLabel: (count: number, total: number) => string;
  readonly filters: Record<AstrologerReviewFilter, string>;
  readonly status: Record<"published" | "pending" | "hidden", string>;
  readonly reply: {
    readonly ownReplyLabel: string;
    readonly pendingReplyLabel: string;
    readonly placeholder: string;
    readonly submitLabel: string;
    readonly cancelLabel: string;
    readonly startLabel: string;
    readonly aiLabel: string;
    readonly aiLoadingLabel: string;
    readonly aiReadyLabel: string;
    readonly aiErrorLabel: string;
  };
  readonly dispute: {
    readonly label: string;
    readonly reasonLabel: string;
    readonly noteLabel: string;
    readonly placeholder: string;
    readonly submitLabel: string;
    readonly cancelLabel: string;
    readonly reasons: Record<ReviewModerationReasonCode, string>;
  };
  readonly caseThread: {
    readonly title: string;
    readonly loadingLabel: string;
    readonly errorLabel: string;
    readonly messageLabel: string;
    readonly placeholder: string;
    readonly submitLabel: string;
    readonly status: Record<ReviewModerationCaseDetail["status"], string>;
    readonly author: Record<ReviewModerationCaseDetail["messages"][number]["authorRole"], string>;
  };
  readonly commandError: string;
};

const reviewsCopyByLocale = {
  ru: {
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
      defaultMessage:
        "Здравствуйте! Буду благодарна за отзыв в ElevenHouse. Если услуга уже получена, откройте кабинет и оставьте отзыв в разделе “Отзывы”.",
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
    publishedCountLabel: (count, total) => `${count} опубликованных · ${total} всего`,
    filters: {
      all: "Все",
      published: "Опубликованы",
      pending: "На модерации",
      disputed: "Спорные",
      hidden: "Скрытые"
    },
    status: {
      published: "Опубликован",
      pending: "На модерации",
      hidden: "Скрыт (спор)"
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
    commandError: "Команду не удалось выполнить. Обновите список и попробуйте снова."
  },
  en: {
    documentTitle: "ElevenHouse | Reviews",
    title: "Reviews",
    filterAriaLabel: "Review filter",
    requestReviewLabel: "Request review",
    requestReview: {
      title: "Request review",
      description:
        "Choose the service and the client's working channel. The request is sent as a regular message and queued for delivery.",
      targetLabel: "Client and service",
      threadLabel: "Delivery channel",
      messageLabel: "Request text",
      defaultMessage:
        "Hello! I would appreciate your review in ElevenHouse. If the service has already been received, open your cabinet and leave a review in the Reviews section.",
      sendLabel: "Send request",
      sendingLabel: "Sending...",
      sentLabel: "Review request queued for delivery.",
      loadingLabel: "Loading clients and channels",
      errorLabel: "Could not load services or channels.",
      emptyTargetsLabel: "There are no services that can be requested for review now.",
      emptyThreadsLabel: "No linked open channel for this client.",
      closeLabel: "Close"
    },
    loadingLabel: "Loading reviews",
    emptyLabel: "No reviews yet",
    errorLabel: "Could not load reviews",
    retryLabel: "Retry",
    publishedCountLabel: (count, total) => `${count} published · ${total} total`,
    filters: {
      all: "All",
      published: "Published",
      pending: "In moderation",
      disputed: "Disputed",
      hidden: "Hidden"
    },
    status: {
      published: "Published",
      pending: "In moderation",
      hidden: "Hidden by dispute"
    },
    reply: {
      ownReplyLabel: "Your reply",
      pendingReplyLabel: "Reply in moderation",
      placeholder: "Your public reply...",
      submitLabel: "Reply",
      cancelLabel: "Cancel",
      startLabel: "Reply",
      aiLabel: "AI reply",
      aiLoadingLabel: "Drafting...",
      aiReadyLabel: "AI draft added. Review it before submitting.",
      aiErrorLabel: "Could not create the AI draft. Try again."
    },
    dispute: {
      label: "Dispute",
      reasonLabel: "Dispute reason",
      noteLabel: "Moderator note",
      placeholder: "Briefly describe what the moderator should verify.",
      submitLabel: "Open dispute",
      cancelLabel: "Cancel",
      reasons: {
        spam: "Spam",
        abuse_or_hate: "Abuse or hate",
        personal_data_exposure: "Personal data exposure",
        off_topic: "Off topic",
        not_service_related: "Not service related",
        fraud_or_conflict: "Fraud or conflict",
        duplicate: "Duplicate",
        legal_risk: "Legal risk",
        other: "Other"
      }
    },
    caseThread: {
      title: "Dispute and clarifications",
      loadingLabel: "Loading thread",
      errorLabel: "Could not load thread",
      messageLabel: "Dispute message",
      placeholder: "Reply to the moderator and client...",
      submitLabel: "Send",
      status: {
        open: "Open",
        closed: "Closed",
        waiting_client: "Waiting for client",
        waiting_astrologer: "Waiting for astrologer",
        consensus_reached: "Consensus reached"
      },
      author: {
        client: "Client",
        astrologer: "You",
        moderator: "Moderator",
        system: "System"
      }
    },
    commandError: "The command failed. Refresh the list and try again."
  }
} satisfies Record<SupportedLocale, ReviewsPageCopy>;
