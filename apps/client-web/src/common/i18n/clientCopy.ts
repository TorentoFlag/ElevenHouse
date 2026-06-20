import type { OtpAuthFormCopy } from "@elevenhouse/design-system/components/OtpAuthForm";
import type { SupportedLocale } from "@elevenhouse/i18n";

export type AuthCopy = {
  documentTitle: string;
  sectionAriaLabel: string;
  form: OtpAuthFormCopy;
  validation: {
    email: string;
    name: string;
    phone: string;
  };
  languageSwitcher: {
    ariaLabel: string;
  };
};

export type ClientCopy = {
  auth: AuthCopy;
};

export const clientCopyByLocale = {
  ru: {
    auth: {
      documentTitle: "ElevenHouse | Авторизация",
      sectionAriaLabel: "Авторизация",
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
      validation: {
        email: "Введите корректный email",
        name: "Имя должно быть от 2 до 200 символов",
        phone: "Введите корректный номер телефона"
      },
      languageSwitcher: {
        ariaLabel: "Язык интерфейса"
      }
    }
  },
  en: {
    auth: {
      documentTitle: "ElevenHouse | Sign in",
      sectionAriaLabel: "Authentication",
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
      validation: {
        email: "Enter a valid email",
        name: "Name must be 2 to 200 characters",
        phone: "Enter a valid phone number"
      },
      languageSwitcher: {
        ariaLabel: "Interface language"
      }
    }
  }
} satisfies Record<SupportedLocale, ClientCopy>;
