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

export type ChartAiConsentCopy = {
  sectionEyebrow: string;
  sectionTitle: string;
  sentHeading: string;
  excludedHeading: string;
  relationshipHeading: string;
  acceptanceLabel: string;
  grant: string;
  grantAgain: string;
  granting: string;
  revoke: string;
  revoking: string;
  grantedAt: string;
  revokedAt: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  states: {
    missing: string;
    granted: string;
    revoked: string;
    stale: string;
  };
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

export type ClientCopy = {
  auth: AuthCopy;
  birthPlaceSearch: BirthPlaceSearchCopy;
  birthTimeOccurrence: BirthTimeOccurrenceCopy;
  chartAiConsent: ChartAiConsentCopy;
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
    chartAiConsent: {
      sectionEyebrow: "Приватность",
      sectionTitle: "AI-черновики интерпретаций",
      sentHeading: "Передаётся OpenAI",
      excludedHeading: "Не передаётся",
      relationshipHeading: "Отдельное согласие для каждого астролога",
      acceptanceLabel: "Я прочитал(а) условия и явно разрешаю описанную передачу данных",
      grant: "Разрешить AI-черновики",
      grantAgain: "Предоставить согласие заново",
      granting: "Сохраняем согласие…",
      revoke: "Отозвать согласие",
      revoking: "Отзываем…",
      grantedAt: "Предоставлено",
      revokedAt: "Отозвано",
      loading: "Загружаем подтверждённые согласия…",
      empty: "Связанных астрологов пока нет — предоставлять согласие некому.",
      error: "Не удалось подтвердить состояние согласий. AI-черновики остаются недоступны.",
      retry: "Повторить",
      states: {
        missing: "Согласие не предоставлено",
        granted: "Согласие действует",
        revoked: "Согласие отозвано",
        stale: "Нужно обновить согласие"
      }
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
    chartAiConsent: {
      sectionEyebrow: "Privacy",
      sectionTitle: "AI interpretation drafts",
      sentHeading: "Sent to OpenAI",
      excludedHeading: "Not sent",
      relationshipHeading: "Separate consent for each astrologer",
      acceptanceLabel: "I have read the terms and explicitly allow the described data transfer",
      grant: "Allow AI drafts",
      grantAgain: "Grant consent again",
      granting: "Saving consent…",
      revoke: "Withdraw consent",
      revoking: "Withdrawing…",
      grantedAt: "Granted",
      revokedAt: "Withdrawn",
      loading: "Loading verified consent records…",
      empty: "There are no linked astrologers to grant consent to yet.",
      error: "Consent status could not be verified. AI drafts remain unavailable.",
      retry: "Try again",
      states: {
        missing: "Consent not granted",
        granted: "Consent is active",
        revoked: "Consent withdrawn",
        stale: "Consent needs renewal"
      }
    }
  }
} satisfies Record<SupportedLocale, ClientCopy>;
