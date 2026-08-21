import type {
  ClientReviewDetail,
  ReviewPublicIdentityMode,
  ReviewableInstanceKind,
  ReviewableInstanceStatus,
  ReviewVersion
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";

export type ClientReviewFormSeed = {
  readonly rating: number;
  readonly text: string;
  readonly publicIdentityMode: ReviewPublicIdentityMode;
};

export function createClientReviewFormSeed(
  detail: ClientReviewDetail | null
): ClientReviewFormSeed {
  const source = detail?.pendingVersion ?? detail?.activePublicVersion ?? null;
  return {
    rating: source?.rating ?? 5,
    text: source?.text ?? "",
    publicIdentityMode: source?.publicIdentityMode ?? "named"
  };
}

export function canOpenClientReviewForm(detail: ClientReviewDetail | null): boolean {
  return Boolean(detail?.canSubmitNewVersion || detail?.canEditLatestVersion);
}

export function describeClientReviewAction(
  detail: ClientReviewDetail | null,
  locale: SupportedLocale = "ru"
): string {
  const labels = clientReviewPresentationLabels[locale];
  if (!detail) return labels.selectService;
  if (detail.pendingVersion) return labels.pendingModeration;
  if (detail.canEditLatestVersion) return labels.editReview;
  if (detail.canSubmitNewVersion) return labels.leaveReview;
  if (detail.activePublicVersion) return labels.editWindowClosed;
  return describeReviewableInstanceStatus(detail.reviewableInstance.status, locale);
}

export function describeReviewableInstanceKind(
  kind: ReviewableInstanceKind,
  locale: SupportedLocale = "ru"
): string {
  return clientReviewPresentationLabels[locale].kinds[kind];
}

export function describeReviewableInstanceStatus(
  status: ReviewableInstanceStatus,
  locale: SupportedLocale = "ru"
): string {
  return clientReviewPresentationLabels[locale].statuses[status];
}

export function describeReviewVersionStatus(
  version: ReviewVersion | null,
  locale: SupportedLocale = "ru"
): string {
  const labels = clientReviewPresentationLabels[locale];
  if (!version) return labels.noReviewYet;
  if (version.moderationStatus === "pending") return labels.pendingVersionStatus;
  if (version.moderationStatus === "approved") return labels.published;
  return labels.rejectedByModeration;
}

export function formatReviewDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

const clientReviewPresentationLabels: Record<
  SupportedLocale,
  {
    readonly selectService: string;
    readonly pendingModeration: string;
    readonly pendingVersionStatus: string;
    readonly editReview: string;
    readonly leaveReview: string;
    readonly editWindowClosed: string;
    readonly noReviewYet: string;
    readonly published: string;
    readonly rejectedByModeration: string;
    readonly kinds: Record<ReviewableInstanceKind, string>;
    readonly statuses: Record<ReviewableInstanceStatus, string>;
  }
> = {
  ru: {
    selectService: "Выберите услугу",
    pendingModeration: "На модерации",
    pendingVersionStatus: "Ожидает модерации",
    editReview: "Редактировать отзыв",
    leaveReview: "Оставить отзыв",
    editWindowClosed: "Окно редактирования закрыто",
    noReviewYet: "Отзыва пока нет",
    published: "Опубликован",
    rejectedByModeration: "Отклонён модерацией",
    kinds: {
      booking: "Консультация",
      astro_diary_period: "AstroDiary",
      astro_calendar_service_period: "Астрокалендарь",
      async_delivery: "Письменный разбор",
      instant_delivery: "Материал",
      mini_delivery: "Мини-продукт",
      course_access: "Курс",
      course_completion: "Курс",
      pack_session: "Пакетная сессия",
      pack: "Пакет",
      subscription_period: "Подписка",
      group_participation: "Групповая услуга",
      gift_redemption: "Подарок",
      custom_fulfillment: "Услуга"
    },
    statuses: {
      not_yet_received: "Ожидает получения услуги",
      reviewable: "Можно оставить отзыв",
      review_submitted: "Отзыв отправлен",
      window_closed: "Окно отзыва закрыто",
      blocked: "Отзыв временно недоступен"
    }
  },
  en: {
    selectService: "Choose a service",
    pendingModeration: "In moderation",
    pendingVersionStatus: "Pending moderation",
    editReview: "Edit review",
    leaveReview: "Leave a review",
    editWindowClosed: "Editing window closed",
    noReviewYet: "No review yet",
    published: "Published",
    rejectedByModeration: "Rejected by moderation",
    kinds: {
      booking: "Consultation",
      astro_diary_period: "AstroDiary",
      astro_calendar_service_period: "Astrocalendar",
      async_delivery: "Written report",
      instant_delivery: "Material",
      mini_delivery: "Mini product",
      course_access: "Course",
      course_completion: "Course",
      pack_session: "Package session",
      pack: "Package",
      subscription_period: "Subscription",
      group_participation: "Group service",
      gift_redemption: "Gift",
      custom_fulfillment: "Service"
    },
    statuses: {
      not_yet_received: "Service not received yet",
      reviewable: "Review available",
      review_submitted: "Review submitted",
      window_closed: "Review window closed",
      blocked: "Review temporarily unavailable"
    }
  }
};
