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
  isPopularFirstName,
  isValidDisplayName,
  isValidEmail
} from "@elevenhouse/validation";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  createDelayedValidationVisibilityController,
  isNameErrorCandidate,
  shouldSchedulePhoneFocusForName,
  type DelayedValidationVisibilityController
} from "./delayedValidationVisibility";
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
const validationFeedbackDelayMs = 700;

export function AuthPage() {
  useDocumentTitle("ElevenHouse | Авторизация");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const phoneFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameErrorVisibilityControllerRef = useRef<DelayedValidationVisibilityController | null>(null);
  const [authMode, setAuthMode] = useState<OtpAuthFormMode>("register");
  const [authValues, setAuthValues] = useState<OtpAuthFormValues>({
    name: "",
    email: "",
    phone: ""
  });
  const [emailTouched, setEmailTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [showNameError, setShowNameError] = useState(false);

  if (nameErrorVisibilityControllerRef.current === null) {
    nameErrorVisibilityControllerRef.current = createDelayedValidationVisibilityController({
      delayMs: validationFeedbackDelayMs,
      onVisibleChange: setShowNameError
    });
  }

  const emailError =
    emailTouched && authValues.email.length > 0 && !isValidEmail(authValues.email)
      ? "Введите корректный email"
      : null;
  const hasNameValidationError = isNameErrorCandidate({
    isRegisterMode: authMode === "register",
    isTouched: nameTouched,
    isValidName: isValidDisplayName(authValues.name)
  });
  const nameError = showNameError && hasNameValidationError ? "Имя должно быть от 2 до 200 символов" : null;

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

    if (
      !shouldSchedulePhoneFocusForName({
        isRegisterMode: authMode === "register",
        isPopularFirstName: isPopularFirstName(name),
        name
      })
    ) {
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
      nameErrorVisibilityControllerRef.current?.clear();
    },
    []
  );

  useEffect(() => {
    nameErrorVisibilityControllerRef.current?.schedule(hasNameValidationError);
  }, [authValues.name, hasNameValidationError]);

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

          <div className={styles.joinedInfo} aria-label="Уже с астрологами 18 000+">
            <div className={styles.joinedAvatars} aria-hidden="true">
              <span>МК</span>
              <span>ДЛ</span>
              <span>ЗМ</span>
              <span>НР</span>
            </div>
            <p>
              Уже с астрологами <strong>18 000+</strong>
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
          submitDisabled={emailError !== null || hasNameValidationError}
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
