import {
  OtpAuthForm,
  type OtpAuthFormMode,
  type OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import "@elevenhouse/design-system/components/OtpAuthForm.css";
import { Chat } from "@elevenhouse/design-system/icons/Chat";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { Video } from "@elevenhouse/design-system/icons/Video";
import { BackLink } from "@elevenhouse/design-system/navigation";
import {
  isEmailCompleteWithKnownTld,
  isPopularFemaleFirstName,
  isValidDisplayName,
  isValidEmail
} from "@elevenhouse/validation";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import styles from "./AuthPage.module.css";

type HighlightIcon = ComponentType<SVGProps<SVGSVGElement>>;

const authHighlights: Array<{ Icon: HighlightIcon; label: string; description: string }> = [
  {
    Icon: Video,
    label: "Записи и онлайн консультации",
    description: "История сессий, записи и материалы — всегда под рукой"
  },
  {
    Icon: Orbit,
    label: "Ваши натальные карты",
    description: "Карты, расчёты и разборы от вашего астролога"
  },
  {
    Icon: Chat,
    label: "Личные сообщения",
    description: "Переписка с астрологом в одном окне"
  },
  {
    Icon: Content,
    label: "Астродневник и контент",
    description: "Прогнозы, дневник и закрытый контент по подписке"
  }
];

const fieldAutoFocusDelayMs = 450;

export function AuthPage() {
  useDocumentTitle("ElevenHouse | Авторизация");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const phoneFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authMode, setAuthMode] = useState<OtpAuthFormMode>("register");
  const [authValues, setAuthValues] = useState<OtpAuthFormValues>({
    name: "",
    email: "",
    phone: ""
  });
  const [emailTouched, setEmailTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const emailError =
    emailTouched && authValues.email.length > 0 && !isValidEmail(authValues.email)
      ? "Введите корректный email"
      : null;
  const nameError =
    authMode === "register" && nameTouched && !isValidDisplayName(authValues.name)
      ? "Имя должно быть от 2 до 200 символов"
      : null;

  function clearSubmitFocusTimeout() {
    if (submitFocusTimeoutRef.current !== null) {
      clearTimeout(submitFocusTimeoutRef.current);
      submitFocusTimeoutRef.current = null;
    }
  }

  function clearPhoneFocusTimeout() {
    if (phoneFocusTimeoutRef.current !== null) {
      clearTimeout(phoneFocusTimeoutRef.current);
      phoneFocusTimeoutRef.current = null;
    }
  }

  function schedulePhoneFocus(name: string) {
    clearPhoneFocusTimeout();

    if (authMode !== "register" || !isPopularFemaleFirstName(name)) {
      return;
    }

    phoneFocusTimeoutRef.current = setTimeout(() => {
      const nameInput = nameInputRef.current;
      const phoneInput = phoneInputRef.current;

      if (document.activeElement !== nameInput || !phoneInput) {
        return;
      }

      phoneInput.focus({ preventScroll: true });
    }, fieldAutoFocusDelayMs);
  }

  function scheduleSubmitFocus(email: string) {
    clearSubmitFocusTimeout();

    if (!isEmailCompleteWithKnownTld(email)) {
      return;
    }

    submitFocusTimeoutRef.current = setTimeout(() => {
      const emailInput = emailInputRef.current;
      const submitButton = submitButtonRef.current;

      if (document.activeElement !== emailInput || !submitButton || submitButton.disabled) {
        return;
      }

      submitButton.focus({ preventScroll: true });
    }, fieldAutoFocusDelayMs);
  }

  useEffect(
    () => () => {
      clearPhoneFocusTimeout();
      clearSubmitFocusTimeout();
    },
    []
  );

  return (
    <main className={styles.page}>
      <section className={styles.visualPane}>
        <div className={`${styles.planet} ${styles.planetGold}`}>
          <span className={styles.orbit} />
        </div>
        <div className={`${styles.planet} ${styles.planetTeal}`} />
        <div className={`${styles.planet} ${styles.planetAmber}`} />
        <div className={`${styles.planet} ${styles.planetViolet}`}>
          <span className={styles.orbit} />
        </div>
        <div className={`${styles.planet} ${styles.planetBlue}`} />
        <div className={styles.stars} />

        <div className={styles.visualContent}>
          <BackLink className={styles.backLink} path="/" title="На страницу астролога" />

          <div className={styles.heroCopy}>
            <div className={styles.brandBadge}>
              <Sparkle aria-hidden="true" />
              ElevenHouse
            </div>
            <h1 className={styles.heroTitle}>
              Ваш кабинет
              <br />у астролога
            </h1>
            <div className={styles.highlightList}>
              {authHighlights.map(({ Icon, description, label }) => (
                <div className={styles.highlightItem} key={label}>
                  <span className={styles.highlightIcon} aria-hidden="true">
                    <Icon />
                  </span>
                  <span className={styles.highlightText}>
                    <span className={styles.highlightLabel}>{label}</span>
                    <span className={styles.highlightDescription}>{description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.joinedInfo} aria-label="Уже с нами 1 200+ астрологов">
            <div className={styles.joinedAvatars} aria-hidden="true">
              <span>МК</span>
              <span>ДЛ</span>
              <span>ЗМ</span>
              <span>НР</span>
            </div>
            <p>
              Уже с нами <strong>1 200+ астрологов</strong>
            </p>
          </div>
        </div>
      </section>
      <section className={styles.formPane} aria-label="Authentication">
        <OtpAuthForm
          mode={authMode}
          values={authValues}
          emailError={emailError}
          emailInputRef={emailInputRef}
          nameError={nameError}
          nameInputRef={nameInputRef}
          phoneInputRef={phoneInputRef}
          submitButtonRef={submitButtonRef}
          submitDisabled={emailError !== null || nameError !== null}
          onModeChange={setAuthMode}
          onValuesChange={(values) => {
            if (values.email !== authValues.email) {
              setEmailTouched(true);
              scheduleSubmitFocus(values.email);
            }
            if (values.name !== authValues.name) {
              setNameTouched(true);
              schedulePhoneFocus(values.name);
            }
            setAuthValues(values);
          }}
          onSubmit={() => {
            setEmailTouched(true);
            setNameTouched(true);
          }}
        />
      </section>
    </main>
  );
}
