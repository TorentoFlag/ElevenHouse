import type {
  ClientReviewDetail,
  ReviewPublicIdentityMode,
  ReviewableInstanceKind,
  ReviewableInstanceStatus,
  ReviewVersion
} from "@elevenhouse/contracts";

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

export function describeClientReviewAction(detail: ClientReviewDetail | null): string {
  if (!detail) return "Выберите услугу";
  if (detail.pendingVersion) return "На модерации";
  if (detail.canEditLatestVersion) return "Редактировать отзыв";
  if (detail.canSubmitNewVersion) return "Оставить отзыв";
  if (detail.activePublicVersion) return "Окно редактирования закрыто";
  return describeReviewableInstanceStatus(detail.reviewableInstance.status);
}

export function describeReviewableInstanceKind(kind: ReviewableInstanceKind): string {
  const labels: Record<ReviewableInstanceKind, string> = {
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
  };
  return labels[kind];
}

export function describeReviewableInstanceStatus(status: ReviewableInstanceStatus): string {
  const labels: Record<ReviewableInstanceStatus, string> = {
    not_yet_received: "Ожидает получения услуги",
    reviewable: "Можно оставить отзыв",
    review_submitted: "Отзыв отправлен",
    window_closed: "Окно отзыва закрыто",
    blocked: "Отзыв временно недоступен"
  };
  return labels[status];
}

export function describeReviewVersionStatus(version: ReviewVersion | null): string {
  if (!version) return "Отзыва пока нет";
  if (version.moderationStatus === "pending") return "Ожидает модерации";
  if (version.moderationStatus === "approved") return "Опубликован";
  return "Отклонён модерацией";
}

export function formatReviewDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}
