import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductStatus,
  ProductStatusFilter,
  ProductSubscriptionPeriod,
  ProductType
} from "@elevenhouse/contracts";

export type ProductLocale = "ru" | "en";

export type ProductOptionCopy = {
  readonly label: string;
  readonly description?: string;
};

export type ProductStatusCopy = {
  readonly label: string;
  readonly tone: ProductStatus;
};

export type ProductSubscriptionPeriodCopy = ProductOptionCopy & {
  readonly short: string;
};

export type ProductCopy = {
  readonly card: {
    readonly salesLabel: string;
  };
  readonly statusFilters: Record<ProductStatusFilter, string>;
  readonly statuses: Record<ProductStatus, ProductStatusCopy>;
  readonly types: Record<ProductType, ProductOptionCopy>;
  readonly deliveryFormats: Record<ProductDeliveryFormat, ProductOptionCopy>;
  readonly executionModes: Record<ProductExecutionMode, ProductOptionCopy>;
  readonly paymentModels: Record<ProductPaymentModel, ProductOptionCopy>;
  readonly subscriptionPeriods: Record<ProductSubscriptionPeriod, ProductSubscriptionPeriodCopy>;
  readonly participantModes: Record<ProductParticipantMode, ProductOptionCopy>;
  readonly requiredClientData: Record<ProductRequiredClientData, ProductOptionCopy>;
  readonly methods: Record<ProductMethod, ProductOptionCopy>;
  readonly accessGrants: Record<ProductAccessGrant, ProductOptionCopy>;
};

export const productCopyByLocale = {
  ru: {
    card: {
      salesLabel: "Продаж"
    },
    statusFilters: {
      all: "Все",
      active: "Активные",
      draft: "Черновики",
      archived: "Архив"
    },
    statuses: {
      active: { label: "Активен", tone: "active" },
      draft: { label: "Черновик", tone: "draft" },
      archived: { label: "Архив", tone: "archived" }
    },
    types: {
      single: { label: "Разовая консультация", description: "Одна сессия фиксированной длительности" },
      pack: { label: "Пакет консультаций", description: "Несколько сессий в одном продукте" },
      async: { label: "Разбор в записи", description: "Асинхронный продукт с результатом" },
      sub: { label: "Подписка", description: "Регулярный доступ к контенту или эфиру" },
      mini: { label: "Мини-продукт", description: "Короткий вопрос или быстрый ответ" },
      course: { label: "Курс", description: "Уроки, материалы и проверка домашних заданий" },
      custom: { label: "Свой формат", description: "Произвольная конфигурация продукта" }
    },
    deliveryFormats: {
      video: { label: "Видео" },
      audio: { label: "Аудио" },
      chat: { label: "Чат" },
      text: { label: "Текст" },
      file: { label: "Файл" },
      channel: { label: "Канал" }
    },
    executionModes: {
      live: { label: "Онлайн-встреча" },
      async: { label: "Асинхронно" },
      instant: { label: "Мгновенно" }
    },
    paymentModels: {
      once: { label: "Разовая оплата" },
      pack: { label: "Пакет" },
      sub: { label: "Подписка" },
      free: { label: "Бесплатно" }
    },
    subscriptionPeriods: {
      week: { label: "Неделя", short: "нед" },
      month: { label: "Месяц", short: "мес" },
      year: { label: "Год", short: "год" }
    },
    participantModes: {
      solo: { label: "1 : 1" },
      group: { label: "Группа" },
      gift: { label: "В подарок" }
    },
    requiredClientData: {
      chart1: { label: "Одна карта" },
      cities: { label: "Город(а)" },
      chart2: { label: "Две карты" },
      question: { label: "Вопрос" },
      event: { label: "Событие / дата" }
    },
    methods: {
      natal: { label: "Натальная карта" },
      forecast: { label: "Прогноз" },
      synastry: { label: "Синастрия" },
      child: { label: "Детская карта" },
      numerology: { label: "Нумерология" },
      matrix: { label: "Матрица судьбы" },
      humandesign: { label: "Дизайн человека" }
    },
    accessGrants: {
      content: { label: "Раздел «Контент»" },
      channel: { label: "Закрытый канал" },
      records: { label: "Записи эфиров" },
      course: { label: "Курс-материалы" },
      community: { label: "Чат-сообщество" },
      journal: { label: "Астродневник" }
    }
  },
  en: {
    card: {
      salesLabel: "Sales"
    },
    statusFilters: {
      all: "All",
      active: "Active",
      draft: "Drafts",
      archived: "Archive"
    },
    statuses: {
      active: { label: "Active", tone: "active" },
      draft: { label: "Draft", tone: "draft" },
      archived: { label: "Archived", tone: "archived" }
    },
    types: {
      single: { label: "Single consultation", description: "One fixed-duration session" },
      pack: { label: "Consultation package", description: "Several sessions in one product" },
      async: { label: "Recorded reading", description: "Asynchronous product with a result" },
      sub: { label: "Subscription", description: "Recurring content or live-session access" },
      mini: { label: "Mini product", description: "A short question or quick answer" },
      course: { label: "Course", description: "Lessons, materials, and homework review" },
      custom: { label: "Custom format", description: "A custom product configuration" }
    },
    deliveryFormats: {
      video: { label: "Video" },
      audio: { label: "Audio" },
      chat: { label: "Chat" },
      text: { label: "Text" },
      file: { label: "File" },
      channel: { label: "Channel" }
    },
    executionModes: {
      live: { label: "Live session" },
      async: { label: "Async" },
      instant: { label: "Instant" }
    },
    paymentModels: {
      once: { label: "One-time payment" },
      pack: { label: "Package" },
      sub: { label: "Subscription" },
      free: { label: "Free" }
    },
    subscriptionPeriods: {
      week: { label: "Week", short: "week" },
      month: { label: "Month", short: "mo" },
      year: { label: "Year", short: "yr" }
    },
    participantModes: {
      solo: { label: "1 : 1" },
      group: { label: "Group" },
      gift: { label: "Gift" }
    },
    requiredClientData: {
      chart1: { label: "One chart" },
      cities: { label: "City / cities" },
      chart2: { label: "Two charts" },
      question: { label: "Question" },
      event: { label: "Event / date" }
    },
    methods: {
      natal: { label: "Natal chart" },
      forecast: { label: "Forecast" },
      synastry: { label: "Synastry" },
      child: { label: "Child chart" },
      numerology: { label: "Numerology" },
      matrix: { label: "Destiny matrix" },
      humandesign: { label: "Human Design" }
    },
    accessGrants: {
      content: { label: "Content section" },
      channel: { label: "Private channel" },
      records: { label: "Session recordings" },
      course: { label: "Course materials" },
      community: { label: "Community chat" },
      journal: { label: "Astro journal" }
    }
  }
} satisfies Record<ProductLocale, ProductCopy>;
