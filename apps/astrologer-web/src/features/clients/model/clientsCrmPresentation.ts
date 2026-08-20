import type {
  ClientCrmActivityItem,
  ClientCrmReadiness,
  ClientLifecycleStatus,
  ClientRelationshipSource
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";

type ClientCrmPresentationTone = "positive" | "neutral" | "warning";

type ClientCrmValuePresentation = {
  readonly label: string;
  readonly tone: ClientCrmPresentationTone;
};

type ActivityPresentation = {
  readonly title: string;
  readonly detail: string;
  readonly tone: ClientCrmPresentationTone;
};

const readinessLabels = {
  ru: {
    ready: "Готово",
    missing: "Нет данных"
  },
  en: {
    ready: "Ready",
    missing: "Missing"
  }
} as const satisfies Record<SupportedLocale, Record<ClientCrmReadiness[keyof ClientCrmReadiness], string>>;

const lifecyclePresentationByStatus = {
  new: { tone: "neutral", labels: { ru: "Новый", en: "New" } },
  active: { tone: "positive", labels: { ru: "Активный", en: "Active" } },
  waiting_for_client: { tone: "warning", labels: { ru: "Ждет клиента", en: "Waiting for client" } },
  in_service: { tone: "positive", labels: { ru: "В работе", en: "In service" } },
  inactive: { tone: "neutral", labels: { ru: "Неактивный", en: "Inactive" } }
} as const satisfies Record<
  ClientLifecycleStatus,
  { readonly tone: ClientCrmPresentationTone; readonly labels: Record<SupportedLocale, string> }
>;

const sourcePresentationByValue = {
  direct_link: { tone: "neutral", labels: { ru: "Прямая ссылка", en: "Direct link" } },
  booking: { tone: "positive", labels: { ru: "Запись", en: "Booking" } },
  order: { tone: "positive", labels: { ru: "Заказ", en: "Order" } },
  lead_magnet: { tone: "neutral", labels: { ru: "Лид-магнит", en: "Lead magnet" } },
  manual: { tone: "neutral", labels: { ru: "Вручную", en: "Manual" } }
} as const satisfies Record<
  ClientRelationshipSource,
  { readonly tone: ClientCrmPresentationTone; readonly labels: Record<SupportedLocale, string> }
>;

export function mapClientCrmReadinessToPresentation(
  readiness: ClientCrmReadiness,
  locale: SupportedLocale = "en"
) {
  return {
    birthData: formatClientCrmReadiness("birthData", readiness.birthData, locale),
    relatedProfiles: formatClientCrmReadiness("relatedProfiles", readiness.relatedProfiles, locale)
  };
}

export function formatClientCrmReadiness(
  _field: keyof ClientCrmReadiness,
  value: ClientCrmReadiness[keyof ClientCrmReadiness],
  locale: SupportedLocale = "en"
): ClientCrmValuePresentation {
  return {
    label: readinessLabels[locale][value],
    tone: value === "ready" ? "positive" : "neutral"
  };
}

export function mapClientCrmLifecycleToPresentation(
  status: ClientLifecycleStatus,
  locale: SupportedLocale = "en"
): ClientCrmValuePresentation {
  return formatClientCrmLifecycle(status, locale);
}

export function formatClientCrmLifecycle(
  status: ClientLifecycleStatus,
  locale: SupportedLocale = "en"
): ClientCrmValuePresentation {
  const presentation = lifecyclePresentationByStatus[status];

  return { label: presentation.labels[locale], tone: presentation.tone };
}

export function mapClientCrmSourceToPresentation(
  source: ClientRelationshipSource,
  locale: SupportedLocale = "en"
): ClientCrmValuePresentation {
  return formatClientCrmSource(source, locale);
}

export function formatClientCrmSource(
  source: ClientRelationshipSource,
  locale: SupportedLocale = "en"
): ClientCrmValuePresentation {
  const presentation = sourcePresentationByValue[source];

  return { label: presentation.labels[locale], tone: presentation.tone };
}

export function formatClientCrmActivityItem(
  item: ClientCrmActivityItem,
  locale: SupportedLocale = "en"
): ActivityPresentation {
  switch (item.kind) {
    case "relationship_created":
      return {
        title: locale === "ru" ? "Связь с клиентом создана" : "Relationship created",
        detail: formatClientCrmSource(item.metadata.source, locale).label,
        tone: "positive"
      };
    case "lifecycle_changed":
      return {
        title: locale === "ru" ? "Статус клиента изменен" : "Lifecycle changed",
        detail: formatClientCrmLifecycle(item.metadata.status, locale).label,
        tone: formatClientCrmLifecycle(item.metadata.status, locale).tone
      };
    case "birth_data_updated":
      return {
        title: locale === "ru" ? "Данные рождения обновлены" : "Birth data updated",
        detail: `Revision ${item.metadata.revision}`,
        tone: "positive"
      };
    case "related_birth_profile_updated":
      return {
        title: locale === "ru" ? "Связанный профиль обновлен" : "Related profile updated",
        detail: `Revision ${item.metadata.revision}`,
        tone: "positive"
      };
  }
}

export function formatClientCrmDisplayName(
  clientUserId: string,
  displayName: string | null,
  locale: SupportedLocale = "en"
): string {
  if (displayName?.trim()) {
    return displayName.trim();
  }

  return `${locale === "ru" ? "Клиент" : "Client"} ${clientUserId.slice(0, 8)}`;
}

export function formatClientCrmDate(
  value: string,
  locale: SupportedLocale = "en",
  timeZone?: string
): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    ...(timeZone ? { timeZone } : {})
  }).format(new Date(value));
}

export function formatClientCrmDateTime(
  value: string,
  locale: SupportedLocale = "en",
  timeZone?: string
): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {})
  }).format(new Date(value));
}
