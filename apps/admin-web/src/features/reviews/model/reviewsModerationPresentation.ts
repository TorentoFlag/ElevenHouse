import type {
  ReviewAdminDetail,
  ReviewDisputeStatus,
  ReviewModerationCaseMessageAuthorRole,
  ReviewModerationCaseMessageVisibility,
  ReviewModerationStatus,
  ReviewModerationCaseStatus,
  ReviewModerationQueueItem,
  ReviewVisibilityStatus
} from "@elevenhouse/contracts";

export type AdminReviewsSummary = {
  readonly total: number;
  readonly reviewVersions: number;
  readonly replyVersions: number;
  readonly moderationCases: number;
  readonly disputed: number;
};

export const reviewModerationReasonOptions = [
  { value: "off_topic", label: "Не относится к услуге" },
  { value: "not_service_related", label: "Нет связи с оказанной услугой" },
  { value: "personal_data_exposure", label: "Персональные данные" },
  { value: "abuse_or_hate", label: "Оскорбления или hate" },
  { value: "fraud_or_conflict", label: "Подозрение на конфликт/фрод" },
  { value: "legal_risk", label: "Юридический риск" },
  { value: "spam", label: "Спам" },
  { value: "duplicate", label: "Дубликат" },
  { value: "other", label: "Другое" }
] as const;

export const caseMessageVisibilityOptions: readonly {
  readonly value: ReviewModerationCaseMessageVisibility;
  readonly label: string;
}[] = [
  { value: "all_case_participants", label: "Клиент и астролог" },
  { value: "client_and_moderators", label: "Только клиенту" },
  { value: "astrologer_and_moderators", label: "Только астрологу" },
  { value: "moderators_only", label: "Внутренняя заметка" }
];

export type EditableReviewModerationCaseStatus = Exclude<ReviewModerationCaseStatus, "closed">;

export const caseStatusOptions: readonly {
  readonly value: EditableReviewModerationCaseStatus;
  readonly label: string;
}[] = [
  { value: "open", label: "Открыт" },
  { value: "waiting_client", label: "Ждём клиента" },
  { value: "waiting_astrologer", label: "Ждём астролога" },
  { value: "consensus_reached", label: "Консенсус достигнут" }
];

export function summarizeModerationQueue(
  items: readonly ReviewModerationQueueItem[]
): AdminReviewsSummary {
  return {
    total: items.length,
    reviewVersions: items.filter((item) => item.kind === "review_version").length,
    replyVersions: items.filter((item) => item.kind === "reply_version").length,
    moderationCases: items.filter((item) => item.kind === "moderation_case").length,
    disputed: items.filter((item) => item.disputeStatus !== "none").length
  };
}

export function pendingReviewVersion(detail: ReviewAdminDetail) {
  return detail.versions.find((version) => version.moderationStatus === "pending") ?? null;
}

export function pendingReplyVersion(detail: ReviewAdminDetail) {
  return detail.replyVersions.find((version) => version.moderationStatus === "pending") ?? null;
}

export function queueItemLabel(item: ReviewModerationQueueItem): string {
  switch (item.kind) {
    case "review_version":
      return "Отзыв клиента";
    case "reply_version":
      return "Ответ астролога";
    case "moderation_case":
      return "Спор по отзыву";
  }
}

export function moderationStatusLabel(status: ReviewModerationStatus): string {
  switch (status) {
    case "pending":
      return "На модерации";
    case "approved":
      return "Одобрено";
    case "rejected":
      return "Отклонено";
  }
}

export function caseMessageAuthorLabel(role: ReviewModerationCaseMessageAuthorRole): string {
  switch (role) {
    case "moderator":
      return "Модератор";
    case "client":
      return "Клиент";
    case "astrologer":
      return "Астролог";
    case "system":
      return "Система";
  }
}

export function caseMessageVisibilityLabel(
  visibility: ReviewModerationCaseMessageVisibility
): string {
  switch (visibility) {
    case "all_case_participants":
      return "Клиент и астролог";
    case "client_and_moderators":
      return "Только клиент";
    case "astrologer_and_moderators":
      return "Только астролог";
    case "moderators_only":
      return "Только модераторы";
  }
}

export function visibilityLabel(status: ReviewVisibilityStatus): string {
  switch (status) {
    case "visible":
      return "Опубликован";
    case "not_public":
      return "Не опубликован";
    case "temporarily_hidden_by_dispute":
      return "Скрыт спором";
    case "hidden_by_moderation":
      return "Скрыт модерацией";
  }
}

export function disputeLabel(status: ReviewDisputeStatus): string {
  switch (status) {
    case "none":
      return "Спора нет";
    case "open":
      return "Спор открыт";
    case "under_review":
      return "На проверке";
    case "waiting_client":
      return "Ждём клиента";
    case "waiting_astrologer":
      return "Ждём астролога";
    case "resolved_closed":
      return "Спор закрыт";
  }
}
