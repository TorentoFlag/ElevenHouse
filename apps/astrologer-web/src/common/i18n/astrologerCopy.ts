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
  languageSwitcher: {
    ariaLabel: string;
  };
};

export type AuthVisualHighlightKey = "charts" | "automation" | "commerce";

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

export type AstrologerCopy = {
  auth: AuthCopy;
  dashboard: {
    documentTitle: string;
    title: string;
    kicker: string;
  };
};

export const astrologerCopyByLocale = {
  ru: {
    auth: {
      documentTitle: "ElevenHouse | Регистрация астролога",
      sectionAriaLabel: "Регистрация и вход астролога",
      visual: {
        backLinkTitle: "На главную",
        heroTitleLine1: "Кабинет, который",
        heroTitleLine2: "продаёт за вас",
        highlights: [
          {
            key: "charts",
            label: "Движок карт и все системы",
            description: ""
          },
          {
            key: "automation",
            label: "Воронки и AI-автоматизация",
            description: ""
          },
          {
            key: "commerce",
            label: "Оплаты, продукты, контент",
            description: ""
          }
        ],
        joinedInfoLabel: "Уже с нами 1 200+ астрологов",
        joinedInfoPrefix: "Уже с нами",
        joinedInfoCount: "1 200+ астрологов",
        avatarInitials: ["МК", "ДЛ", "ВМ", "НР"]
      },
      form: {
        brandTitle: "Eleven",
        brandAccent: "House",
        brandSubtitle: "КАБИНЕТ АСТРОЛОГА",
        registerTab: "Регистрация",
        loginTab: "Вход",
        registerTitle: "Создать кабинет",
        loginTitle: "Войти в кабинет",
        registerDescription: "Бесплатно, без карты. 10 минут до первой продажи.",
        loginDescription: "Войдите, чтобы вернуться к записям, клиентам и продажам.",
        nameLabel: "Имя",
        namePlaceholder: "Как вас зовут",
        emailLabel: "Email",
        emailPlaceholder: "you@example.com",
        phoneLabel: "Или телефон",
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
        identityExists: "Кабинет с этим телефоном или email уже существует",
        rateLimited: "Слишком много попыток. Попробуйте позже",
        generic: "Не удалось выполнить запрос. Попробуйте ещё раз"
      },
      languageSwitcher: {
        ariaLabel: "Язык интерфейса"
      }
    },
    dashboard: {
      documentTitle: "ElevenHouse | Кабинет астролога",
      kicker: "Astrologer surface",
      title: "ElevenHouse Astrologer Web"
    }
  },
  en: {
    auth: {
      documentTitle: "ElevenHouse | Astrologer sign up",
      sectionAriaLabel: "Astrologer sign up and sign in",
      visual: {
        backLinkTitle: "Home",
        heroTitleLine1: "A workspace that",
        heroTitleLine2: "sells for you",
        highlights: [
          {
            key: "charts",
            label: "Chart engine and all systems",
            description: ""
          },
          {
            key: "automation",
            label: "Funnels and AI automation",
            description: ""
          },
          {
            key: "commerce",
            label: "Payments, products, content",
            description: ""
          }
        ],
        joinedInfoLabel: "Already with us 1,200+ astrologers",
        joinedInfoPrefix: "Already with us",
        joinedInfoCount: "1,200+ astrologers",
        avatarInitials: ["MK", "DL", "VM", "NR"]
      },
      form: {
        brandTitle: "Eleven",
        brandAccent: "House",
        brandSubtitle: "ASTROLOGER DASHBOARD",
        registerTab: "Sign up",
        loginTab: "Sign in",
        registerTitle: "Create workspace",
        loginTitle: "Sign in",
        registerDescription: "Free, no card. 10 minutes to your first sale.",
        loginDescription: "Return to bookings, clients, and sales.",
        nameLabel: "Name",
        namePlaceholder: "What is your name?",
        emailLabel: "Email",
        emailPlaceholder: "you@example.com",
        phoneLabel: "Or phone",
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
        identityExists: "A workspace with this phone or email already exists",
        rateLimited: "Too many attempts. Try again later",
        generic: "Request failed. Try again"
      },
      languageSwitcher: {
        ariaLabel: "Interface language"
      }
    },
    dashboard: {
      documentTitle: "ElevenHouse | Astrologer dashboard",
      kicker: "Astrologer surface",
      title: "ElevenHouse Astrologer Web"
    }
  }
} satisfies Record<SupportedLocale, AstrologerCopy>;
