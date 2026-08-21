import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type {
  ReviewAstrologerItem,
  ReviewModerationCaseDetail,
  ReviewModerationReasonCode
} from "@elevenhouse/contracts";
import { useI18n, type SupportedLocale } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  astrologerReviewModerationCaseQueryOptions,
  astrologerReviewsListQueryOptions
} from "../../features/reviews/model/reviewsQueryOptions";
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
  useSubmitReviewReplyVersionMutation
} from "../../features/reviews/model/useReviewsMutations";
import { ReviewsPageView } from "./ReviewsPageView";

const pageSize = 50;

export function ReviewsPage() {
  const { locale } = useI18n();
  const copy = reviewsCopyByLocale[locale];
  const [filter, setFilter] = useState<AstrologerReviewFilter>("all");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [aiDraftStates, setAiDraftStates] = useState<Record<string, AiDraftState>>({});
  const [disputeTargetId, setDisputeTargetId] = useState<string | null>(null);
  const [disputeDrafts, setDisputeDrafts] = useState<Record<string, DisputeDraft>>({});
  const [caseMessageDrafts, setCaseMessageDrafts] = useState<Record<string, string>>({});
  const reviewsQuery = useQuery(
    astrologerReviewsListQueryOptions({ limit: pageSize, cursor: null })
  );
  const submitReplyMutation = useSubmitReviewReplyVersionMutation();
  const aiDraftMutation = useCreateReviewReplyAiDraftMutation();
  const disputeMutation = useOpenReviewDisputeMutation();
  const caseMessageMutation = useCreateAstrologerReviewCaseMessageMutation();
  const reviews = reviewsQuery.data?.items ?? [];
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
    caseMessageMutation.error;

  useDocumentTitle(copy.documentTitle);

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

  return (
    <ReviewsPageView
      copy={copy}
      locale={locale}
      reviews={visibleReviews}
      summary={buildAstrologerReviewsSummary(reviews)}
      counts={countAstrologerReviewFilters(reviews)}
      selectedFilter={filter}
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
        caseMessageMutation.isPending
      }
      commandError={commandError ? copy.commandError : null}
      onFilterChange={setFilter}
      onRefresh={() => void reviewsQuery.refetch()}
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
    />
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
  readonly requestReviewUnavailableLabel: string;
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
    requestReviewUnavailableLabel: "Запрос отзывов появится после production messaging flow",
    loadingLabel: "Загружаем отзывы",
    emptyLabel: "Отзывов пока нет",
    errorLabel: "Не удалось загрузить отзывы",
    retryLabel: "Повторить",
    publishedCountLabel: (count, total) => `${count} опубликованных · ${total} всего`,
    filters: {
      all: "Все",
      published: "Опубликованы",
      pending: "На модерации",
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
    requestReviewUnavailableLabel:
      "Review requests will appear after the production messaging flow",
    loadingLabel: "Loading reviews",
    emptyLabel: "No reviews yet",
    errorLabel: "Could not load reviews",
    retryLabel: "Retry",
    publishedCountLabel: (count, total) => `${count} published · ${total} total`,
    filters: {
      all: "All",
      published: "Published",
      pending: "In moderation",
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
