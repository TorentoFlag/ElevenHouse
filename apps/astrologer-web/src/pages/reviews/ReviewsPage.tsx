import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReviewAstrologerItem } from "@elevenhouse/contracts";
import { useI18n, type SupportedLocale } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { astrologerReviewsListQueryOptions } from "../../features/reviews/model/reviewsQueryOptions";
import {
  type AstrologerReviewFilter,
  buildAstrologerReviewsSummary,
  countAstrologerReviewFilters,
  filterAstrologerReviews
} from "../../features/reviews/model/reviewsPresentation";
import {
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
  const reviewsQuery = useQuery(
    astrologerReviewsListQueryOptions({ limit: pageSize, cursor: null })
  );
  const submitReplyMutation = useSubmitReviewReplyVersionMutation();
  const aiDraftMutation = useCreateReviewReplyAiDraftMutation();
  const disputeMutation = useOpenReviewDisputeMutation();
  const reviews = reviewsQuery.data?.items ?? [];
  const visibleReviews = filterAstrologerReviews(reviews, filter);
  const commandError = submitReplyMutation.error ?? aiDraftMutation.error ?? disputeMutation.error;

  useDocumentTitle(copy.documentTitle);

  async function handleCreateAiDraft(review: ReviewAstrologerItem) {
    const result = await aiDraftMutation.mutateAsync({
      reviewId: review.reviewId,
      idempotencyKey: createCommandKey("reviews:reply-ai"),
      body: { locale }
    });
    setReplyTargetId(review.reviewId);
    setReplyDrafts((current) => ({ ...current, [review.reviewId]: result.draftText }));
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
  }

  async function handleOpenDispute(review: ReviewAstrologerItem) {
    await disputeMutation.mutateAsync({
      reviewId: review.reviewId,
      idempotencyKey: createCommandKey("reviews:dispute"),
      body: { reasonCode: "other", note: copy.disputeDefaultNote }
    });
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
      isLoading={reviewsQuery.isLoading}
      isError={reviewsQuery.isError}
      isCommandPending={
        submitReplyMutation.isPending || aiDraftMutation.isPending || disputeMutation.isPending
      }
      commandError={commandError ? copy.commandError : null}
      onFilterChange={setFilter}
      onRefresh={() => void reviewsQuery.refetch()}
      onEditReply={(reviewId, value) =>
        setReplyDrafts((current) => ({ ...current, [reviewId]: value }))
      }
      onStartReply={(review) => {
        setReplyTargetId(review.reviewId);
        setReplyDrafts((current) => ({
          ...current,
          [review.reviewId]: current[review.reviewId] ?? ""
        }));
      }}
      onCancelReply={() => setReplyTargetId(null)}
      onSubmitReply={(review) => {
        void handleSubmitReply(review);
      }}
      onCreateAiDraft={(review) => {
        void handleCreateAiDraft(review);
      }}
      onOpenDispute={(review) => {
        void handleOpenDispute(review);
      }}
    />
  );
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
  };
  readonly disputeLabel: string;
  readonly disputeDefaultNote: string;
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
      aiLabel: "AI-ответ"
    },
    disputeLabel: "Оспорить",
    disputeDefaultNote: "Астролог открыл спор из раздела отзывов.",
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
      aiLabel: "AI reply"
    },
    disputeLabel: "Dispute",
    disputeDefaultNote: "Astrologer opened a dispute from the reviews workspace.",
    commandError: "The command failed. Refresh the list and try again."
  }
} satisfies Record<SupportedLocale, ReviewsPageCopy>;
