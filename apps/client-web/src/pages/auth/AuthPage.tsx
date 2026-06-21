import {
  OtpAuthForm,
  type OtpAuthFormMode,
  type OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import "@elevenhouse/design-system/components/OtpAuthForm.css";
import { OtpCodeForm } from "@elevenhouse/design-system/components/OtpCodeForm";
import "@elevenhouse/design-system/components/OtpCodeForm.css";
import type { RequestPasswordlessCodeResponse } from "@elevenhouse/contracts";
import {
  isEmailCompleteWithKnownTld,
  isPopularFirstName,
  isValidDisplayName,
  isValidEmail
} from "@elevenhouse/validation";
import { isSupportedLocale, useI18n } from "@elevenhouse/i18n";
import {
  getPhonePlaceholder,
  isSupportedPhoneCountry,
  supportedPhoneCountries,
  validateSupportedPhoneNumber
} from "@elevenhouse/validation/phone";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { application } from "../../Application";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { HttpError } from "../../common/http/HttpError";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import { requestPasswordlessCode } from "../../features/auth/api/requestPasswordlessCode";
import { verifyPasswordlessCode } from "../../features/auth/api/verifyPasswordlessCode";
import { verifyRegistrationPasswordlessCode } from "../../features/auth/api/verifyRegistrationPasswordlessCode";
import { authQueryKeys } from "../../features/auth/model/authQueryKeys";
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
import {
  createPasswordlessCodeRequest,
  createPasswordlessVerificationRequest,
  resolveAuthCredentialState,
  resolveAuthSubmitState,
  type AuthIdentifier
} from "./helpers/authFlowModel";
import { useDelayedValidationVisibility } from "./hooks/useDelayedValidationVisibility";
import styles from "./AuthPage.module.css";

const fieldAutoFocusDelayMs = 450;
const validationFeedbackDelayMs = 700;

export function AuthPage() {
  const { dictionary, locale, localeOptions, setLocale } = useI18n<ClientCopy>();
  const copy = dictionary.auth;
  const navigate = useNavigate();

  useDocumentTitle(copy.documentTitle);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
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
  const [authStep, setAuthStep] = useState<"credentials" | "code">("credentials");
  const [challenge, setChallenge] = useState<RequestPasswordlessCodeResponse | null>(null);
  const [pendingCredential, setPendingCredential] = useState<{
    mode: OtpAuthFormMode;
    identifier: AuthIdentifier;
    displayName: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const credentialValues = {
    name: authValues.name,
    email: authValues.email,
    phone: authValues.phone,
    normalizedPhone: phoneValidation.normalizedValue ?? phoneInputState.normalizedValue,
    isPhoneValid: phoneValidation.valid
  };
  const credentialState = resolveAuthCredentialState(credentialValues);
  const submitState = resolveAuthSubmitState({
    mode: authMode,
    values: credentialValues
  });

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

  const schedulePhoneFocus = useCallback(
    (name: string) => {
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
    },
    [authMode, clearPhoneFocusTimeout]
  );

  const scheduleSubmitFocus = useCallback(
    (email: string) => {
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
    },
    [clearSubmitFocusTimeout]
  );

  const scheduleSubmitFocusAfterValidPhone = useCallback(
    (nextPhoneInputState: PhoneInputState) => {
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
    },
    [clearSubmitFocusTimeout]
  );

  const handlePhoneCountryChange = useCallback(
    (nextCountry: string) => {
      if (!isSupportedPhoneCountry(nextCountry)) {
        return;
      }

      const nextPhoneInputState = applyPhoneCountryChange(phoneInputState, nextCountry);

      setPhoneInputState(nextPhoneInputState);
      setAuthValues((currentValues) => ({
        ...currentValues,
        phone: nextPhoneInputState.displayValue
      }));
    },
    [phoneInputState]
  );

  const handleValuesChange = useCallback(
    (values: OtpAuthFormValues) => {
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
    },
    [
      authValues.email,
      authValues.name,
      authValues.phone,
      phoneInputState,
      schedulePhoneFocus,
      scheduleSubmitFocus,
      scheduleSubmitFocusAfterValidPhone
    ]
  );

  const handleModeChange = useCallback((mode: OtpAuthFormMode) => {
    setAuthMode(mode);
    setAuthStep("credentials");
    setChallenge(null);
    setPendingCredential(null);
    setCode("");
    setServerError(null);
  }, []);

  const handleCredentialSubmit = useCallback(async () => {
    setEmailTouched(true);
    setNameTouched(true);
    setPhoneTouched(true);

    const currentPhoneValidation = validateSupportedPhoneNumber(
      phoneInputState.normalizedValue,
      phoneInputState.selectedCountry
    );
    const currentCredentialValues = {
      name: authValues.name,
      email: authValues.email,
      phone: authValues.phone,
      normalizedPhone: currentPhoneValidation.normalizedValue ?? phoneInputState.normalizedValue,
      isPhoneValid: currentPhoneValidation.valid
    };
    const currentSubmitState = resolveAuthSubmitState({
      mode: authMode,
      values: currentCredentialValues
    });

    if (!currentSubmitState.canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const nextChallenge = await requestPasswordlessCode(
        createPasswordlessCodeRequest(currentSubmitState.identifier)
      );
      setChallenge(nextChallenge);
      setPendingCredential({
        mode: authMode,
        identifier: currentSubmitState.identifier,
        displayName: authValues.name
      });
      setCode("");
      setAuthStep("code");
      requestAnimationFrame(() => codeInputRef.current?.focus({ preventScroll: true }));
    } catch (error) {
      setServerError(resolveAuthErrorMessage(error, copy));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    authMode,
    authValues.email,
    authValues.name,
    authValues.phone,
    copy,
    phoneInputState.normalizedValue,
    phoneInputState.selectedCountry
  ]);

  const handleCodeSubmit = useCallback(async () => {
    if (!challenge || !pendingCredential || code.length !== 6) {
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const request = createPasswordlessVerificationRequest({
        mode: pendingCredential.mode,
        challengeId: challenge.challengeId,
        code,
        displayName: pendingCredential.displayName
      });
      const result =
        pendingCredential.mode === "register" && "displayName" in request
          ? await verifyRegistrationPasswordlessCode(request)
          : await verifyPasswordlessCode(request);

      application.queryClient.setQueryData(authQueryKeys.currentAccount(), {
        account: {
          id: result.account.id,
          status: result.account.status,
          roles: result.account.roles
        }
      });
      navigate("/me", { replace: true });
    } catch (error) {
      setServerError(resolveAuthErrorMessage(error, copy));
    } finally {
      setIsSubmitting(false);
    }
  }, [challenge, code, copy, navigate, pendingCredential]);

  const handleResend = useCallback(async () => {
    if (!pendingCredential) {
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const nextChallenge = await requestPasswordlessCode(
        createPasswordlessCodeRequest(pendingCredential.identifier)
      );
      setChallenge(nextChallenge);
      setCode("");
    } catch (error) {
      setServerError(resolveAuthErrorMessage(error, copy));
    } finally {
      setIsSubmitting(false);
    }
  }, [copy, pendingCredential]);

  const handleBackToCredentials = useCallback(() => {
    setAuthStep("credentials");
    setChallenge(null);
    setPendingCredential(null);
    setCode("");
    setServerError(null);
  }, []);

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
        {authStep === "credentials" ? (
          <OtpAuthForm
            mode={authMode}
            values={authValues}
            copy={copy.form}
            emailDisabled={credentialState.emailDisabled}
            emailError={emailError}
            emailInputRef={emailInputRef}
            error={serverError}
            isSubmitting={isSubmitting}
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
            phoneDisabled={credentialState.phoneDisabled}
            phoneError={phoneError}
            phoneInputRef={phoneInputRef}
            phonePlaceholder={getPhonePlaceholder(phoneInputState.selectedCountry)}
            submitButtonRef={submitButtonRef}
            submitDisabled={
              !submitState.canSubmit ||
              emailError !== null ||
              hasNameValidationError ||
              hasPhoneValidationError
            }
            onModeChange={handleModeChange}
            onPhoneCountryChange={handlePhoneCountryChange}
            onValuesChange={handleValuesChange}
            onSubmit={() => {
              void handleCredentialSubmit();
            }}
          />
        ) : (
          <OtpCodeForm
            code={code}
            maskedIdentifier={challenge?.maskedIdentifier ?? ""}
            copy={copy.codeForm}
            error={serverError}
            isSubmitting={isSubmitting}
            codeInputRef={codeInputRef}
            submitDisabled={code.length !== 6}
            onBack={handleBackToCredentials}
            onCodeChange={setCode}
            onResend={() => {
              void handleResend();
            }}
            onSubmit={() => {
              void handleCodeSubmit();
            }}
          />
        )}
      </section>
    </main>
  );
}

function resolveAuthErrorMessage(error: unknown, copy: ClientCopy["auth"]): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return copy.errors.invalidCode;
    }

    if (error.status === 409) {
      return copy.errors.identityExists;
    }

    if (error.status === 429) {
      return copy.errors.rateLimited;
    }
  }

  return copy.errors.generic;
}
