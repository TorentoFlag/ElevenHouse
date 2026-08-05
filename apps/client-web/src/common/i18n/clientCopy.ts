import type { OtpAuthFormCopy } from "@elevenhouse/design-system/components/OtpAuthForm";
import type { OtpCodeFormCopy } from "@elevenhouse/design-system/components/OtpCodeForm";
import type { SupportedLocale } from "@elevenhouse/i18n";

export type AuthCopy = {
  documentTitle: string;
  sectionAriaLabel: string;
  visual: AuthVisualCopy;
  form: OtpAuthFormCopy;
  codeForm: OtpCodeFormCopy;
  validation: {
    email: string;
    name: string;
    phone: string;
  };
  errors: {
    invalidCode: string;
    identityExists: string;
    rateLimited: string;
    generic: string;
  };
  resendCooldown: {
    availableIn: string;
  };
  languageSwitcher: {
    ariaLabel: string;
  };
};

export type AuthVisualHighlightKey = "sessions" | "charts" | "messages" | "content";

export type AuthVisualCopy = {
  backLinkTitle: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  highlights: Array<{
    key: AuthVisualHighlightKey;
    label: string;
    description: string;
  }>;
  joinedInfoLabel: string;
  joinedInfoPrefix: string;
  joinedInfoCount: string;
  avatarInitials: string[];
};

export type BirthPlaceSearchCopy = {
  label: string;
  placeholder: string;
  searching: string;
  empty: string;
  error: string;
  retry: string;
  resolved: string;
  selectionRequired: string;
};

export type BirthTimeOccurrenceCopy = {
  label: string;
  none: string;
  first: string;
  second: string;
  helper: string;
};

export type ClientPurchaseFlowCopy = {
  eyebrow: string;
  title: string;
  relationshipOnly: string;
  astrologerLabel: string;
  loadingProducts: string;
  noProducts: string;
  loadProductsFailed: string;
  loadSlotsFailed: string;
  liveProductHint: string;
  asyncProductFallbackHint: string;
  formatLabel: string;
  availableSlotsLabel: string;
  noSlots: string;
  receiptContactLabel: string;
  emailLabel: string;
  phoneLabel: string;
  phonePlaceholderLabel: string;
  receiptContactHint: string;
  preparingPayment: string;
  creatingOrder: string;
  pay: string;
  checkoutUnknown: string;
  checkoutFailed: string;
  checkoutFailedGeneric: string;
  checkoutRequiresHttps: string;
  returnStatusLabel: string;
  paid: string;
  pendingPayment: string;
  paymentNotCompleted: string;
  deliveryFormats: Record<string, string>;
};

export type ClientCopy = {
  auth: AuthCopy;
  birthPlaceSearch: BirthPlaceSearchCopy;
  birthTimeOccurrence: BirthTimeOccurrenceCopy;
  purchaseFlow: ClientPurchaseFlowCopy;
};

export const clientCopyByLocale = {
  ru: {
    auth: {
      documentTitle: "ElevenHouse | Авторизация",
      sectionAriaLabel: "Авторизация",
      visual: {
        backLinkTitle: "На страницу астролога",
        heroTitleLine1: "Ваш кабинет",
        heroTitleLine2: "у астролога",
        highlights: [
          {
            key: "sessions",
            label: "Записи и онлайн консультации",
            description: "История сессий, записи и материалы — всегда под рукой"
          },
          {
            key: "charts",
            label: "Ваши натальные карты",
            description: "Карты, расчёты и разборы от вашего астролога"
          },
          {
            key: "messages",
            label: "Личные сообщения",
            description: "Переписка с астрологом в одном окне"
          },
          {
            key: "content",
            label: "Астродневник и контент",
            description: "Прогнозы, дневник и закрытый контент по подписке"
          }
        ],
        joinedInfoLabel: "Уже с астрологами 18 000+",
        joinedInfoPrefix: "Уже с астрологами",
        joinedInfoCount: "18 000+",
        avatarInitials: ["МК", "ДЛ", "ЗМ", "НР"]
      },
      form: {
        brandTitle: "Eleven",
        brandAccent: "House",
        brandSubtitle: "КАБИНЕТ АСТРОЛОГА",
        registerTab: "Регистрация",
        loginTab: "Вход",
        registerTitle: "Создать аккаунт",
        loginTitle: "С возвращением",
        registerDescription: "Доступ к консультациям, картам и переписке с астрологом.",
        loginDescription: "Войдите, чтобы вернуться в свой кабинет.",
        nameLabel: "Имя",
        namePlaceholder: "Как к вам обращаться",
        emailLabel: "или email",
        emailPlaceholder: "you@example.com",
        phoneLabel: "Телефон",
        phonePlaceholder: "+7 ___ ___ __ __",
        phoneCountryAriaLabel: "Страна телефона",
        hint: "Пришлём код для входа — пароль не нужен.",
        registerSubmitLabel: "Получить код",
        loginSubmitLabel: "Войти по коду"
      },
      codeForm: {
        title: "Введите код",
        description: "Мы отправили код на {identifier}",
        codeLabel: "Код из сообщения",
        codePlaceholder: "000000",
        submitLabel: "Продолжить",
        backLabel: "Изменить данные",
        changeIdentifierLabel: "Изменить контакт",
        resendLabel: "Отправить повторно",
        deliveryHint: "Проверьте SMS или сообщения в приложении"
      },
      validation: {
        email: "Введите корректный email",
        name: "Имя должно быть от 2 до 200 символов",
        phone: "Введите корректный номер телефона"
      },
      errors: {
        invalidCode: "Неверный или устаревший код",
        identityExists: "Аккаунт с этим телефоном или email уже существует",
        rateLimited: "Слишком много попыток. Попробуйте позже",
        generic: "Не удалось выполнить запрос. Попробуйте ещё раз"
      },
      resendCooldown: {
        availableIn: "Повторно через {time}"
      },
      languageSwitcher: {
        ariaLabel: "Язык интерфейса"
      }
    },
    birthPlaceSearch: {
      label: "Место рождения",
      placeholder: "Начните вводить город",
      searching: "Ищем место…",
      empty: "Место не найдено. Уточните запрос.",
      error: "Не удалось найти место.",
      retry: "Повторить",
      resolved: "Место подтверждено",
      selectionRequired: "Выберите место рождения из найденных вариантов."
    },
    birthTimeOccurrence: {
      label: "Повторный час",
      none: "Не выбрано",
      first: "Первое вхождение",
      second: "Второе вхождение",
      helper: "Выберите вариант только если местное время повторялось при переводе часов."
    },
    purchaseFlow: {
      eyebrow: "Запись и оплата",
      title: "Выберите услугу связанного астролога",
      relationshipOnly: "В этом кабинете нет каталога: показываем только услуги астрологов, с которыми у вас уже есть связь.",
      astrologerLabel: "Астролог",
      loadingProducts: "Загружаем доступные услуги…",
      noProducts: "У этого астролога пока нет доступных для онлайн-оплаты услуг.",
      loadProductsFailed: "Не удалось загрузить доступные услуги. Повторите попытку.",
      loadSlotsFailed: "Не удалось получить свободное время. Выберите услугу позже.",
      liveProductHint: "Выберите время, затем оплатите",
      asyncProductFallbackHint: "После оплаты астролог начнёт работу по услуге.",
      formatLabel: "Формат",
      availableSlotsLabel: "Свободное время",
      noSlots: "На ближайшие 14 дней свободного времени нет.",
      receiptContactLabel: "Чек: подтверждённый контакт",
      emailLabel: "Email",
      phoneLabel: "Телефон",
      phonePlaceholderLabel: "Телефон в формате +7999…",
      receiptContactHint: "Используйте email или телефон, подтверждённый при входе: он нужен для кассового чека.",
      preparingPayment: "Подготавливаем защищённую оплату…",
      creatingOrder: "Создаём заказ…",
      pay: "Оплатить {amount}",
      checkoutUnknown: "Состояние платёжной сессии требует проверки. Повторно не списывайте средства.",
      checkoutFailed: "Не удалось подготовить оплату. Средства не списаны.",
      checkoutFailedGeneric: "Не удалось создать оплату. Проверьте подтверждённый email или телефон и попробуйте ещё раз.",
      checkoutRequiresHttps: "Не удалось открыть защищённую оплату: для return URL требуется HTTPS. Средства не списаны.",
      returnStatusLabel: "Статус заказа",
      paid: "Оплата подтверждена. Астролог получит заказ в кабинете.",
      pendingPayment: "Проверяем результат оплаты. Не создавайте повторный заказ, обновите страницу через минуту.",
      paymentNotCompleted: "Оплата не завершена. Средства по этому заказу не списаны либо будут отражены после проверки банка.",
      deliveryFormats: { video: "Видео", chat: "Чат", audio: "Аудио", text: "Текст", file: "Файл", channel: "Канал" }
    }
  },
  en: {
    auth: {
      documentTitle: "ElevenHouse | Sign in",
      sectionAriaLabel: "Authentication",
      visual: {
        backLinkTitle: "Astrologer's page",
        heroTitleLine1: "Your space",
        heroTitleLine2: "with your astrologer",
        highlights: [
          {
            key: "sessions",
            label: "Sessions and online consultations",
            description: "Session history, recordings, and materials always at hand"
          },
          {
            key: "charts",
            label: "Your natal charts",
            description: "Charts, calculations, and interpretations from your astrologer"
          },
          {
            key: "messages",
            label: "Private messages",
            description: "A single place for conversations with your astrologer"
          },
          {
            key: "content",
            label: "Astro journal and content",
            description: "Forecasts, journal notes, and private subscription content"
          }
        ],
        joinedInfoLabel: "Already connected with astrologers 18,000+",
        joinedInfoPrefix: "Already connected with astrologers",
        joinedInfoCount: "18,000+",
        avatarInitials: ["MK", "DL", "ZM", "NR"]
      },
      form: {
        brandTitle: "Eleven",
        brandAccent: "House",
        brandSubtitle: "ASTROLOGER DASHBOARD",
        registerTab: "Sign up",
        loginTab: "Sign in",
        registerTitle: "Create account",
        loginTitle: "Welcome back",
        registerDescription: "Access consultations, charts, and messages with your astrologer.",
        loginDescription: "Sign in to return to your account.",
        nameLabel: "Name",
        namePlaceholder: "How should we address you?",
        emailLabel: "or email",
        emailPlaceholder: "you@example.com",
        phoneLabel: "Phone",
        phonePlaceholder: "+7 ___ ___ __ __",
        phoneCountryAriaLabel: "Phone country",
        hint: "We will send a sign-in code — no password needed.",
        registerSubmitLabel: "Get code",
        loginSubmitLabel: "Sign in by code"
      },
      codeForm: {
        title: "Enter code",
        description: "We sent a code to {identifier}",
        codeLabel: "Message code",
        codePlaceholder: "000000",
        submitLabel: "Continue",
        backLabel: "Change details",
        changeIdentifierLabel: "Change contact",
        resendLabel: "Send again",
        deliveryHint: "Check SMS or app messages"
      },
      validation: {
        email: "Enter a valid email",
        name: "Name must be 2 to 200 characters",
        phone: "Enter a valid phone number"
      },
      errors: {
        invalidCode: "Invalid or expired code",
        identityExists: "An account with this phone or email already exists",
        rateLimited: "Too many attempts. Try again later",
        generic: "Request failed. Try again"
      },
      resendCooldown: {
        availableIn: "Again in {time}"
      },
      languageSwitcher: {
        ariaLabel: "Interface language"
      }
    },
    birthPlaceSearch: {
      label: "Place of birth",
      placeholder: "Start typing a city",
      searching: "Searching for a place…",
      empty: "No place found. Refine your search.",
      error: "Place search failed.",
      retry: "Try again",
      resolved: "Place verified",
      selectionRequired: "Select the place of birth from the search results."
    },
    birthTimeOccurrence: {
      label: "Repeated hour",
      none: "Not selected",
      first: "First occurrence",
      second: "Second occurrence",
      helper: "Choose only when the local clock time occurred twice during a DST change."
    },
    purchaseFlow: {
      eyebrow: "Booking and payment",
      title: "Choose a service from your connected astrologer",
      relationshipOnly: "There is no catalogue in this account. We show services only from astrologers you are already connected with.",
      astrologerLabel: "Astrologer",
      loadingProducts: "Loading available services…",
      noProducts: "This astrologer has no services available for online payment yet.",
      loadProductsFailed: "Could not load available services. Please try again.",
      loadSlotsFailed: "Could not load available times. Please choose a service later.",
      liveProductHint: "Choose a time, then pay",
      asyncProductFallbackHint: "After payment, the astrologer will begin work on the service.",
      formatLabel: "Format",
      availableSlotsLabel: "Available times",
      noSlots: "There are no available times in the next 14 days.",
      receiptContactLabel: "Receipt: verified contact",
      emailLabel: "Email",
      phoneLabel: "Phone",
      phonePlaceholderLabel: "Phone in +7999… format",
      receiptContactHint: "Use the email or phone verified during sign-in. It is required for the fiscal receipt.",
      preparingPayment: "Preparing secure payment…",
      creatingOrder: "Creating order…",
      pay: "Pay {amount}",
      checkoutUnknown: "The payment session needs review. Do not attempt to pay again.",
      checkoutFailed: "Payment could not be prepared. No funds were charged.",
      checkoutFailedGeneric: "Could not create the payment. Check your verified email or phone and try again.",
      checkoutRequiresHttps: "Secure payment could not be opened: the return URL requires HTTPS. No funds were charged.",
      returnStatusLabel: "Order status",
      paid: "Payment is confirmed. The astrologer will receive the order in their account.",
      pendingPayment: "We are checking the payment result. Do not create another order; refresh the page in a minute.",
      paymentNotCompleted: "Payment is not complete. Funds for this order were not charged, or will appear after bank review.",
      deliveryFormats: { video: "Video", chat: "Chat", audio: "Audio", text: "Text", file: "File", channel: "Channel" }
    }
  }
} satisfies Record<SupportedLocale, ClientCopy>;
