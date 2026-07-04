import type {
  ProductExecutionMode,
  ProductMethod,
  ProductPaymentModel
} from "@elevenhouse/contracts";
import type { ProductLocale } from "../../../../../features/products/model/productCopy";

export type ConstructorUiCopy = {
  readonly productsBreadcrumb: string;
  readonly createBreadcrumb: string;
  readonly publishLabel: string;
  readonly mediaLabel: string;
  readonly mediaHint: string;
  readonly coverPlaceholder: string;
  readonly introVideoPlaceholder: string;
  readonly introVideoHint: string;
  readonly nameAndPriceLabel: string;
  readonly whenLabel: string;
  readonly slaPlaceholder: string;
  readonly volumeLabel: string;
  readonly volumeHint: string;
  readonly durationPlaceholder: string;
  readonly methodHint: string;
  readonly clientDataHint: string;
  readonly accessHint: string;
  readonly freeNote: string;
  readonly previewClientLabel: string;
  readonly draftStatusLabel: string;
  readonly clientGetsLabel: string;
  readonly clientCabinetLabel: string;
  readonly afterSessionLabel: string;
  readonly afterDeliveryLabel: string;
  readonly upsellLabel: string;
  readonly bookLabel: string;
  readonly subscribeLabel: string;
  readonly getLabel: string;
  readonly giftLabel: string;
  readonly durationSuffix: string;
  readonly modifierArtifactLabel: string;
  readonly modifierEnabledLabel: string;
  readonly modifierDisabledLabel: string;
  readonly modifierFreeShortLabel: string;
  readonly modifierIncludedSuffixLabel: string;
  readonly fieldAutomationNote: string;
  readonly modifiersHint: string;
  readonly includedItemsHint: string;
  readonly includedItemTagFormat: string;
  readonly includedItemTagRecording: string;
  readonly includedItemTagPayment: string;
  readonly includedItemTagAccess: string;
  readonly includedItemTagMethod: string;
  readonly sessionRecordingLabel: string;
  readonly audioRecordingLabel: string;
  readonly packageIncludedLabel: (sessionCount: number, discountPercent: number) => string;
  readonly trialIncludedLabel: (trialDays: number) => string;
  readonly methodIncludedLabels: Record<ProductMethod, string>;
  readonly autoIncludedVisibleLabel: string;
  readonly personalConsultationLabel: string;
  readonly watchLabel: string;
  readonly listenLabel: string;
  readonly openLabel: string;
  readonly readLabel: string;
  readonly downloadLabel: string;
  readonly enterLabel: string;
  readonly astrologerNotesLabel: string;
  readonly executionModes: Record<ProductExecutionMode, { readonly label: string }>;
  readonly paymentModels: Record<ProductPaymentModel, { readonly label: string }>;
};

export const constructorUiCopyByLocale = {
  ru: {
    productsBreadcrumb: "Продукты",
    createBreadcrumb: "Создать",
    publishLabel: "Опубликовать",
    mediaLabel: "Обложка и медиа",
    mediaHint: "Перетащите фото на обложку. Можно добавить промо-видео — карточка станет живее.",
    coverPlaceholder: "Фото / обложка",
    introVideoPlaceholder: "Ссылка на промо-видео (YouTube / Vimeo / Rutube)",
    introVideoHint:
      "Обложка и видео показываются клиенту на странице записи и в карточке продукта.",
    nameAndPriceLabel: "Название и цена",
    whenLabel: "Когда",
    slaPlaceholder: "SLA",
    volumeLabel: "Объём",
    volumeHint: "Длительность сессии, тираж или объём материалов",
    durationPlaceholder: "60 мин",
    methodHint: "На чём построен продукт. Каждый метод добавляет свой расчёт в кабинет клиента.",
    clientDataHint: "Что клиент заполняет при записи.",
    accessHint: "Что открывает продукт: контент, канал, записи, курс или дневник.",
    freeNote: "Лид-магнит: продукт бесплатный, ведёт клиента в воронку. Цена игнорируется.",
    previewClientLabel: "Превью · так увидит клиент",
    draftStatusLabel: "Черновик",
    clientGetsLabel: "Что получит клиент",
    clientCabinetLabel: "Кабинет клиента",
    afterSessionLabel: "после сессии",
    afterDeliveryLabel: "после выдачи",
    upsellLabel: "Можно добавить при записи:",
    bookLabel: "Записаться",
    subscribeLabel: "Подписаться",
    getLabel: "Получить",
    giftLabel: "Подарить",
    durationSuffix: " мин",
    modifierArtifactLabel: "Показывать как материал в кабинете клиента",
    modifierEnabledLabel: "Включён",
    modifierDisabledLabel: "Выключен",
    modifierFreeShortLabel: "входит",
    modifierIncludedSuffixLabel: "входит",
    fieldAutomationNote:
      "Тип и поля выведены из кубиков. Превью показывает материалы и доступы, которые будут открываться клиенту после подключения delivery-модулей.",
    modifiersHint: "Опциональные апсейлы. Меняйте название, цену и тип — или добавьте свои.",
    includedItemsHint: "Авто — из выбранных кубиков, ниже — свои пункты с иконкой",
    includedItemTagFormat: "формат + объём",
    includedItemTagRecording: "запись вкл.",
    includedItemTagPayment: "оплата",
    includedItemTagAccess: "доступ",
    includedItemTagMethod: "метод",
    sessionRecordingLabel: "Запись сессии",
    audioRecordingLabel: "Аудиозапись",
    packageIncludedLabel: (sessionCount, discountPercent) =>
      `Пакет из ${sessionCount} · скидка ${discountPercent}%`,
    trialIncludedLabel: (trialDays) => `Пробный период ${trialDays} дн.`,
    methodIncludedLabels: {
      natal: "Разбор натальной карты",
      forecast: "Прогноз: транзиты и соляр",
      synastry: "Разбор совместимости (синастрия)",
      child: "Разбор детской карты для родителя",
      numerology: "Нумерологический портрет",
      matrix: "Матрица судьбы (арканы)",
      humandesign: "Бодиграф (Дизайн человека)"
    },
    autoIncludedVisibleLabel: "Показывается клиенту",
    personalConsultationLabel: "Личная консультация",
    watchLabel: "Смотреть",
    listenLabel: "Слушать",
    openLabel: "Открыть",
    readLabel: "Читать",
    downloadLabel: "Скачать",
    enterLabel: "Войти",
    astrologerNotesLabel: "Заметки астролога",
    executionModes: {
      live: { label: "Вживую · слот" },
      async: { label: "Асинхронно · SLA" },
      instant: { label: "Мгновенно" }
    },
    paymentModels: {
      once: { label: "Разовый" },
      pack: { label: "Пакет из N" },
      sub: { label: "Подписка" },
      free: { label: "Бесплатно · лид-магнит" }
    }
  },
  en: {
    productsBreadcrumb: "Products",
    createBreadcrumb: "Create",
    publishLabel: "Publish",
    mediaLabel: "Cover and media",
    mediaHint: "Drop a cover photo. Add a promo video to make the card feel alive.",
    coverPlaceholder: "Photo / cover",
    introVideoPlaceholder: "Promo video link (YouTube / Vimeo / Rutube)",
    introVideoHint: "Cover and video are shown on the booking page and product card.",
    nameAndPriceLabel: "Title and price",
    whenLabel: "When",
    slaPlaceholder: "SLA",
    volumeLabel: "Volume",
    volumeHint: "Session duration, seats, or amount of material",
    durationPlaceholder: "60 min",
    methodHint:
      "What the product is based on. Each method can add an artifact to the client cabinet.",
    clientDataHint: "What the client fills in while booking.",
    accessHint: "What the product unlocks: content, channel, recordings, course, or journal.",
    freeNote:
      "Lead magnet: this product is free and moves a client into the funnel. Price is ignored.",
    previewClientLabel: "Preview · what the client sees",
    draftStatusLabel: "Draft",
    clientGetsLabel: "What the client gets",
    clientCabinetLabel: "Client cabinet",
    afterSessionLabel: "after session",
    afterDeliveryLabel: "after delivery",
    upsellLabel: "Can be added while booking:",
    bookLabel: "Book",
    subscribeLabel: "Subscribe",
    getLabel: "Get",
    giftLabel: "Gift",
    durationSuffix: " min",
    modifierArtifactLabel: "Show as a client-cabinet material",
    modifierEnabledLabel: "Enabled",
    modifierDisabledLabel: "Disabled",
    modifierFreeShortLabel: "incl.",
    modifierIncludedSuffixLabel: "included",
    fieldAutomationNote:
      "Type and fields come from product blocks. The preview shows materials and access grants that will open for the client after delivery modules are connected.",
    modifiersHint: "Optional upsells. Change the name, price, and kind, or add your own.",
    includedItemsHint: "Auto items come from selected blocks. Add custom icon rows below.",
    includedItemTagFormat: "format + volume",
    includedItemTagRecording: "recording included",
    includedItemTagPayment: "payment",
    includedItemTagAccess: "access",
    includedItemTagMethod: "method",
    sessionRecordingLabel: "Session recording",
    audioRecordingLabel: "Audio recording",
    packageIncludedLabel: (sessionCount, discountPercent) =>
      `Package of ${sessionCount} · ${discountPercent}% discount`,
    trialIncludedLabel: (trialDays) => `${trialDays}-day trial`,
    methodIncludedLabels: {
      natal: "Natal chart reading",
      forecast: "Forecast: transits and solar return",
      synastry: "Compatibility reading (synastry)",
      child: "Child chart reading for a parent",
      numerology: "Numerology portrait",
      matrix: "Destiny matrix",
      humandesign: "Bodygraph (Human Design)"
    },
    autoIncludedVisibleLabel: "Visible to the client",
    personalConsultationLabel: "Personal consultation",
    watchLabel: "Watch",
    listenLabel: "Listen",
    openLabel: "Open",
    readLabel: "Read",
    downloadLabel: "Download",
    enterLabel: "Enter",
    astrologerNotesLabel: "Astrologer notes",
    executionModes: {
      live: { label: "Live · slot" },
      async: { label: "Async · SLA" },
      instant: { label: "Instant" }
    },
    paymentModels: {
      once: { label: "One-time" },
      pack: { label: "Package of N" },
      sub: { label: "Subscription" },
      free: { label: "Free · lead magnet" }
    }
  }
} satisfies Record<ProductLocale, ConstructorUiCopy>;
