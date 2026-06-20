import {
  OtpAuthForm,
  type OtpAuthFormMode,
  type OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import "@elevenhouse/design-system/components/OtpAuthForm.css";
import {
  isEmailCompleteWithKnownTld,
  isPopularFirstName,
  isValidDisplayName,
  isValidEmail
} from "@elevenhouse/validation";
import {
  isSupportedLocale,
  useI18n
} from "@elevenhouse/i18n";
import {
  getPhonePlaceholder,
  isSupportedPhoneCountry,
  supportedPhoneCountries,
  validateSupportedPhoneNumber
} from "@elevenhouse/validation/phone";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import { AuthVisualPane } from "./AuthVisualPane";
import {
  isNameErrorCandidate,
  shouldSchedulePhoneFocusForName,
  shouldScheduleSubmitFocusForPhone
} from "./helpers/delayedValidationVisibility";
import {
  applyPhoneCountryChange,
  applyPhoneInputChange,
  createInitialPhoneInputState,
  type PhoneInputState
} from "./helpers/phoneInputModel";
import { useDelayedValidationVisibility } from "./hooks/useDelayedValidationVisibility";
import styles from "./AuthPage.module.css";

const fieldAutoFocusDelayMs = 450;
const validationFeedbackDelayMs = 700;

export function AuthPage() {
  const { dictionary, locale, localeOptions, setLocale } = useI18n<ClientCopy>();
  const copy = dictionary.auth;

  useDocumentTitle(copy.documentTitle);
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
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneInputState, setPhoneInputState] = useState<PhoneInputState>(() =>
    createInitialPhoneInputState("RU")
  );

  const emailError =
    emailTouched && authValues.email.length > 0 && !isValidEmail(authValues.email)
      ? copy.validation.email
      : null;
  const hasNameValidationError = isNameErrorCandidate({
    isRegisterMode: authMode === "register",
    isTouched: nameTouched,
    isValidName: isValidDisplayName(authValues.name)
  });
  const showNameError = useDelayedValidationVisibility({
    delayMs: validationFeedbackDelayMs,
    resetKey: authValues.name,
    shouldShow: hasNameValidationError
  });
  const nameError = showNameError && hasNameValidationError ? copy.validation.name : null;
  const phoneValidation = validateSupportedPhoneNumber(
    phoneInputState.normalizedValue,
    phoneInputState.selectedCountry
  );
  const hasPhoneValidationError = authValues.phone.length > 0 && !phoneValidation.valid;
  const phoneError = phoneTouched && hasPhoneValidationError ? copy.validation.phone : null;

  const clearSubmitFocusTimeout = useCallback(() => {
    if (submitFocusTimeoutRef.current !== null) {
      clearTimeout(submitFocusTimeoutRef.current);
      submitFocusTimeoutRef.current = null;
    }
  }, []);

  const clearPhoneFocusTimeout = useCallback(() => {
    if (phoneFocusTimeoutRef.current !== null) {
      clearTimeout(phoneFocusTimeoutRef.current);
      phoneFocusTimeoutRef.current = null;
    }
  }, []);

  const schedulePhoneFocus = useCallback((name: string) => {
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
  }, [authMode, clearPhoneFocusTimeout]);

  const scheduleSubmitFocus = useCallback((email: string) => {
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
  }, [clearSubmitFocusTimeout]);

  const scheduleSubmitFocusAfterValidPhone = useCallback((nextPhoneInputState: PhoneInputState) => {
    clearSubmitFocusTimeout();

    const nextPhoneValidation = validateSupportedPhoneNumber(
      nextPhoneInputState.normalizedValue,
      nextPhoneInputState.selectedCountry
    );

    if (
      !shouldScheduleSubmitFocusForPhone({
        isValidPhone: nextPhoneValidation.valid,
        phone: nextPhoneInputState.displayValue
      })
    ) {
      return;
    }

    submitFocusTimeoutRef.current = setTimeout(() => {
      const phoneInput = phoneInputRef.current;
      const submitButton = submitButtonRef.current;

      if (document.activeElement !== phoneInput || !submitButton || submitButton.disabled) {
        return;
      }

      submitButton.focus({ preventScroll: true });
    }, fieldAutoFocusDelayMs);
  }, [clearSubmitFocusTimeout]);

  const handlePhoneCountryChange = useCallback((nextCountry: string) => {
    if (!isSupportedPhoneCountry(nextCountry)) {
      return;
    }

    const nextPhoneInputState = applyPhoneCountryChange(
      phoneInputState,
      nextCountry
    );

    setPhoneInputState(nextPhoneInputState);
    setAuthValues((currentValues) => ({
      ...currentValues,
      phone: nextPhoneInputState.displayValue
    }));
  }, [phoneInputState]);

  const handleValuesChange = useCallback((values: OtpAuthFormValues) => {
    let nextValues = values;

    if (values.email !== authValues.email) {
      setEmailTouched(true);
      scheduleSubmitFocus(values.email);
    }
    if (values.name !== authValues.name) {
      setNameTouched(true);
      schedulePhoneFocus(values.name);
    }
    if (values.phone !== authValues.phone) {
      setPhoneTouched(true);
      const nextPhoneInputState = applyPhoneInputChange(phoneInputState, values.phone);
      setPhoneInputState(nextPhoneInputState);
      scheduleSubmitFocusAfterValidPhone(nextPhoneInputState);
      nextValues = {
        ...values,
        phone: nextPhoneInputState.displayValue
      };
    }

    setAuthValues(nextValues);
  }, [
    authValues.email,
    authValues.name,
    authValues.phone,
    phoneInputState,
    schedulePhoneFocus,
    scheduleSubmitFocus,
    scheduleSubmitFocusAfterValidPhone
  ]);

  useEffect(
    () => () => {
      clearPhoneFocusTimeout();
      clearSubmitFocusTimeout();
    },
    [clearPhoneFocusTimeout, clearSubmitFocusTimeout]
  );

  return (
    <main className={styles.page}>
      <AuthVisualPane copy={copy.visual} />
      <section className={styles.formPane} aria-label={copy.sectionAriaLabel}>
        <OtpAuthForm
          mode={authMode}
          values={authValues}
          copy={copy.form}
          emailError={emailError}
          emailInputRef={emailInputRef}
          localeSwitcher={{
            locale,
            options: localeOptions,
            ariaLabel: copy.languageSwitcher.ariaLabel,
            onLocaleChange: (nextLocale) => {
              if (isSupportedLocale(nextLocale)) {
                setLocale(nextLocale);
              }
            }
          }}
          nameError={nameError}
          nameInputRef={nameInputRef}
          phoneCountries={supportedPhoneCountries}
          phoneCountry={phoneInputState.selectedCountry}
          phoneError={phoneError}
          phoneInputRef={phoneInputRef}
          phonePlaceholder={getPhonePlaceholder(phoneInputState.selectedCountry)}
          submitButtonRef={submitButtonRef}
          submitDisabled={emailError !== null || hasNameValidationError || hasPhoneValidationError}
          onModeChange={setAuthMode}
          onPhoneCountryChange={handlePhoneCountryChange}
          onValuesChange={handleValuesChange}
          onSubmit={() => {
            setEmailTouched(true);
            setNameTouched(true);
            setPhoneTouched(true);
          }}
        />
      </section>
    </main>
  );
}
