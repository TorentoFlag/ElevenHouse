import type {
  CreateProductRequest,
  ProductTemplateLocale,
  ProductType
} from "@elevenhouse/contracts/products";

export type ProductTemplateSeed = {
  readonly code: string;
  readonly locale: ProductTemplateLocale;
  readonly type: ProductType;
  readonly status: "active" | "archived";
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly payload: CreateProductRequest;
};

const individualConsultationPayload = {
  type: "single",
  title: "Индивидуальная консультация",
  subtitle: "Одна встреча с понятным результатом",
  priceMinor: 490000,
  currency: "RUB",
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  participantMode: "solo",
  deliveryFormats: ["video"],
  requiredClientData: ["question"],
  methods: [],
  accessGrants: [],
  includedItems: [
    { text: "Онлайн-встреча 1 : 1", icon: "video", order: 10 },
    { text: "Разбор вашего запроса", icon: "chat", order: 20 },
    { text: "Краткий план следующих шагов", icon: "check", order: 30 }
  ],
  modifiers: []
} satisfies CreateProductRequest;

const quickAnswerPayload = {
  type: "mini",
  title: "Быстрый ответ",
  subtitle: "Короткий формат для одного вопроса",
  priceMinor: 150000,
  currency: "RUB",
  executionMode: "instant",
  paymentModel: "once",
  durationMinutes: undefined,
  durationLabel: "до 24 ч",
  participantMode: "solo",
  deliveryFormats: ["chat", "text"],
  requiredClientData: ["question"],
  methods: [],
  accessGrants: [],
  includedItems: [
    { text: "Один конкретный вопрос", icon: "chat", order: 10 },
    { text: "Короткий экспертный ответ", icon: "check", order: 20 },
    { text: "Ответ в течение суток", icon: "clock", order: 30 }
  ],
  modifiers: []
} satisfies CreateProductRequest;

const recordedReviewPayload = {
  type: "async",
  title: "Разбор в записи",
  subtitle: "Экспертный ответ без онлайн-встречи",
  priceMinor: 290000,
  currency: "RUB",
  executionMode: "async",
  paymentModel: "once",
  durationMinutes: undefined,
  durationLabel: "20-30 мин",
  slaLabel: "3 дня",
  participantMode: "solo",
  deliveryFormats: ["video", "file"],
  requiredClientData: ["question", "event"],
  methods: [],
  accessGrants: [],
  includedItems: [
    { text: "Видео или аудио-разбор", icon: "video", order: 10 },
    { text: "Краткое резюме файлом", icon: "fileDown", order: 20 },
    { text: "Готовность в течение 3 дней", icon: "clock", order: 30 }
  ],
  modifiers: []
} satisfies CreateProductRequest;

const consultationPackagePayload = {
  type: "pack",
  title: "Пакет встреч",
  subtitle: "Несколько сессий в одном продукте",
  priceMinor: 1260000,
  currency: "RUB",
  executionMode: "live",
  paymentModel: "pack",
  packageSessionCount: 3,
  packageDiscountPercent: 15,
  durationMinutes: 60,
  durationLabel: "3 x 60 мин",
  participantMode: "solo",
  deliveryFormats: ["video", "chat"],
  requiredClientData: ["question"],
  methods: [],
  accessGrants: [],
  includedItems: [
    { text: "3 индивидуальные встречи", icon: "calendar", order: 10 },
    { text: "Поддержка между сессиями", icon: "chat", order: 20 },
    { text: "Пакетная стоимость", icon: "wallet", order: 30 }
  ],
  modifiers: []
} satisfies CreateProductRequest;

const miniCoursePayload = {
  type: "course",
  title: "Мини-курс",
  subtitle: "Небольшая программа с уроками и практикой",
  priceMinor: 590000,
  currency: "RUB",
  executionMode: "async",
  paymentModel: "once",
  durationMinutes: undefined,
  durationLabel: "4-6 уроков",
  participantMode: "solo",
  deliveryFormats: ["video", "file"],
  requiredClientData: ["question"],
  methods: [],
  accessGrants: ["course"],
  includedItems: [
    { text: "Короткие видеоуроки", icon: "video", order: 10 },
    { text: "Материалы для самостоятельной работы", icon: "fileDown", order: 20 },
    { text: "Практическое задание", icon: "check", order: 30 }
  ],
  modifiers: []
} satisfies CreateProductRequest;

const expertSubscriptionPayload = {
  type: "sub",
  title: "Подписка эксперта",
  subtitle: "Регулярный доступ к материалам и поддержке",
  priceMinor: 99000,
  currency: "RUB",
  executionMode: "async",
  paymentModel: "sub",
  subscriptionPeriod: "month",
  trialDays: 0,
  participantMode: "solo",
  deliveryFormats: ["channel"],
  requiredClientData: [],
  methods: [],
  accessGrants: ["content", "channel"],
  includedItems: [
    { text: "Регулярные материалы", icon: "content", order: 10 },
    { text: "Закрытый канал", icon: "flow", order: 20 },
    { text: "Ежемесячная встреча или эфир", icon: "video", order: 30 }
  ],
  modifiers: []
} satisfies CreateProductRequest;

const customFormatPayload = {
  type: "custom",
  title: "Свой формат",
  subtitle: "Гибкая заготовка для авторского продукта",
  priceMinor: 490000,
  currency: "RUB",
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  participantMode: "solo",
  deliveryFormats: ["video", "chat"],
  requiredClientData: ["question"],
  methods: [],
  accessGrants: [],
  includedItems: [
    { text: "Основная экспертная работа", icon: "sparkle", order: 10 },
    { text: "Материалы или рекомендации", icon: "fileDown", order: 20 }
  ],
  modifiers: [
    {
      label: "Срочное выполнение",
      priceMinor: 150000,
      kind: "fixed",
      isEnabled: false,
      createsArtifact: false,
      order: 10
    }
  ]
} satisfies CreateProductRequest;

const individualConsultationPayloadEn = localizePayload(individualConsultationPayload, {
  durationLabel: "60 min",
  includedItems: ["One-on-one online session", "Review of your request", "Concise next-step plan"]
});

const quickAnswerPayloadEn = localizePayload(quickAnswerPayload, {
  durationLabel: "within 24 hours",
  includedItems: ["One specific question", "Concise expert answer", "Response within 24 hours"]
});

const recordedReviewPayloadEn = localizePayload(recordedReviewPayload, {
  durationLabel: "20-30 min",
  slaLabel: "3 days",
  includedItems: ["Video or audio review", "Concise file summary", "Delivery within 3 days"]
});

const consultationPackagePayloadEn = localizePayload(consultationPackagePayload, {
  durationLabel: "3 x 60 min",
  includedItems: ["3 individual sessions", "Support between sessions", "Package pricing"]
});

const miniCoursePayloadEn = localizePayload(miniCoursePayload, {
  durationLabel: "4-6 lessons",
  includedItems: ["Short video lessons", "Self-study materials", "Practical assignment"]
});

const expertSubscriptionPayloadEn = localizePayload(expertSubscriptionPayload, {
  includedItems: ["Regular materials", "Private channel", "Monthly session or live stream"]
});

const customFormatPayloadEn = localizePayload(customFormatPayload, {
  durationLabel: "60 min",
  includedItems: ["Core expert work", "Materials or recommendations"],
  modifiers: ["Priority delivery"]
});

export const productTemplateSeedData = [
  seed("individual_consultation", "ru", 10, individualConsultationPayload, {
    title: "Индивидуальная консультация",
    subtitle: "Одна встреча с понятным результатом",
    description: "Подходит для консультаций, диагностики, стратегических и экспертных сессий."
  }),
  seed("individual_consultation", "en", 10, individualConsultationPayloadEn, {
    title: "Individual consultation",
    subtitle: "One focused session with a clear outcome",
    description: "A neutral starter for consultations, diagnostics and expert sessions."
  }),
  seed("quick_answer", "ru", 20, quickAnswerPayload, {
    title: "Быстрый ответ",
    subtitle: "Короткий формат для одного вопроса",
    description: "Подходит для компактных платных ответов без большой подготовки."
  }),
  seed("quick_answer", "en", 20, quickAnswerPayloadEn, {
    title: "Quick answer",
    subtitle: "A compact format for one question",
    description: "A small paid offer for concise expert guidance."
  }),
  seed("recorded_review", "ru", 30, recordedReviewPayload, {
    title: "Разбор в записи",
    subtitle: "Экспертный ответ без онлайн-встречи",
    description: "Клиент оставляет контекст, эксперт возвращает запись или файл."
  }),
  seed("recorded_review", "en", 30, recordedReviewPayloadEn, {
    title: "Recorded review",
    subtitle: "An expert answer without a live meeting",
    description: "The client sends context and receives a recording or file."
  }),
  seed("consultation_package", "ru", 40, consultationPackagePayload, {
    title: "Пакет встреч",
    subtitle: "Несколько сессий в одном продукте",
    description: "Для длительной работы, сопровождения и программ из нескольких встреч."
  }),
  seed("consultation_package", "en", 40, consultationPackagePayloadEn, {
    title: "Session package",
    subtitle: "Several sessions in one product",
    description: "A starter for longer work, support and multi-session programs."
  }),
  seed("mini_course", "ru", 50, miniCoursePayload, {
    title: "Мини-курс",
    subtitle: "Небольшая программа с уроками и практикой",
    description: "Для образовательного продукта без сложной большой программы."
  }),
  seed("mini_course", "en", 50, miniCoursePayloadEn, {
    title: "Mini course",
    subtitle: "A short program with lessons and practice",
    description: "A simple education product with materials and exercises."
  }),
  seed("expert_subscription", "ru", 60, expertSubscriptionPayload, {
    title: "Подписка эксперта",
    subtitle: "Регулярный доступ к материалам и поддержке",
    description: "Для закрытого канала, контента, эфиров или сообщества."
  }),
  seed("expert_subscription", "en", 60, expertSubscriptionPayloadEn, {
    title: "Expert subscription",
    subtitle: "Recurring access to materials and support",
    description: "A starter for a private channel, content, sessions or community."
  }),
  seed("custom_format", "ru", 70, customFormatPayload, {
    title: "Свой формат",
    subtitle: "Гибкая заготовка для авторского продукта",
    description: "Для сложного продукта с ручной настройкой всех параметров."
  }),
  seed("custom_format", "en", 70, customFormatPayloadEn, {
    title: "Custom format",
    subtitle: "A flexible starter for an original product",
    description: "A full-constructor template for complex expert offers."
  })
] satisfies readonly ProductTemplateSeed[];

function seed(
  code: string,
  locale: ProductTemplateLocale,
  sortOrder: number,
  payload: CreateProductRequest,
  copy: {
    readonly title: string;
    readonly subtitle: string;
    readonly description: string;
  }
): ProductTemplateSeed {
  return {
    code,
    locale,
    type: payload.type,
    status: "active",
    title: copy.title,
    subtitle: copy.subtitle,
    description: copy.description,
    sortOrder,
    payload: {
      ...payload,
      title: copy.title,
      subtitle: copy.subtitle
    }
  };
}

function localizePayload(
  payload: CreateProductRequest,
  copy: {
    readonly durationLabel?: string;
    readonly slaLabel?: string;
    readonly includedItems: readonly string[];
    readonly modifiers?: readonly string[];
  }
): CreateProductRequest {
  if (copy.includedItems.length !== payload.includedItems.length) {
    throw new Error(`Expected ${payload.includedItems.length} localized included items`);
  }

  if ((copy.modifiers?.length ?? 0) !== payload.modifiers.length) {
    throw new Error(`Expected ${payload.modifiers.length} localized modifiers`);
  }

  return {
    ...payload,
    durationLabel: copy.durationLabel,
    slaLabel: copy.slaLabel,
    includedItems: payload.includedItems.map((item, index) => ({
      ...item,
      text: copy.includedItems[index] ?? item.text
    })),
    modifiers: payload.modifiers.map((modifier, index) => ({
      ...modifier,
      label: copy.modifiers?.[index] ?? modifier.label
    }))
  };
}
