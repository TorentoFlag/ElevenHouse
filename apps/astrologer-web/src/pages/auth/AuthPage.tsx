import {
  OtpAuthForm,
  type OtpAuthFormMode,
  type OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import "@elevenhouse/design-system/components/OtpAuthForm.css";
import { OtpCodeForm } from "@elevenhouse/design-system/components/OtpCodeForm";
import "@elevenhouse/design-system/components/OtpCodeForm.css";
import type { RequestAstrologerPasswordlessCodeResponse } from "@elevenhouse/contracts";
import { isSupportedLocale, useI18n } from "@elevenhouse/i18n";
import { getPhonePlaceholder, supportedPhoneCountries } from "@elevenhouse/validation/phone";
import { useCallback, useRef, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { AuthStepMotion } from "./AuthStepMotion";
import { AuthVisualPane } from "./AuthVisualPane";
import { createInitialPhoneInputState, type PhoneInputState } from "./helpers/phoneInputModel";
import { useAuthFocusAutomation } from "./hooks/useAuthFocusAutomation";
import { useAuthValidationState } from "./hooks/useAuthValidationState";
import { useResendCountdown } from "./hooks/useResendCountdown";
import {
  usePasswordlessAuthFlowHandlers,
  type AuthStep,
  type PasswordlessPendingCredential
} from "./hooks/usePasswordlessAuthFlowHandlers";
import { useAuthCredentialInputHandlers } from "./hooks/useAuthCredentialInputHandlers";
import styles from "./AuthPage.module.css";

const fieldAutoFocusDelayMs = 450;
const validationFeedbackDelayMs = 700;
const resendCountdownTickMs = 1000;

export function AuthPage() {
  const { dictionary, locale, localeOptions, setLocale } = useI18n<AstrologerCopy>();
  const copy = dictionary.auth;

  useDocumentTitle(copy.documentTitle);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
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
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [challenge, setChallenge] = useState<RequestAstrologerPasswordlessCodeResponse | null>(
    null
  );
  const [pendingCredential, setPendingCredential] = useState<PasswordlessPendingCredential | null>(
    null
  );
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    emailError,
    hasNameValidationError,
    nameError,
    hasPhoneValidationError,
    phoneError,
    credentialState,
    submitState
  } = useAuthValidationState({
    mode: authMode,
    values: authValues,
    phoneInputState,
    touched: {
      email: emailTouched,
      name: nameTouched,
      phone: phoneTouched
    },
    copy,
    nameErrorDelayMs: validationFeedbackDelayMs
  });
  const { resendCountdownSeconds, resendCooldownLabel, resetResendCountdown } = useResendCountdown({
    isActive: authStep === "code",
    resendAvailableAt: challenge?.resendAvailableAt,
    labelTemplate: copy.resendCooldown.availableIn,
    tickMs: resendCountdownTickMs
  });

  const { schedulePhoneFocus, scheduleSubmitFocus, scheduleSubmitFocusAfterValidPhone } =
    useAuthFocusAutomation({
      delayMs: fieldAutoFocusDelayMs,
      isRegisterMode: authMode === "register",
      emailInputRef,
      nameInputRef,
      phoneInputRef,
      submitButtonRef
    });

  const { handleBackToCredentials, handleCodeSubmit, handleCredentialSubmit, handleResend } =
    usePasswordlessAuthFlowHandlers({
      mode: authMode,
      values: authValues,
      phoneInputState,
      challenge,
      pendingCredential,
      code,
      copy,
      codeInputRef,
      resendCountdownSeconds,
      resetResendCountdown,
      setAuthStep,
      setChallenge,
      setCode,
      setEmailTouched,
      setIsSubmitting,
      setNameTouched,
      setPendingCredential,
      setPhoneTouched,
      setServerError
    });

  const { handlePhoneCountryChange, handlePhoneInputKeyDown, handleValuesChange } =
    useAuthCredentialInputHandlers({
      values: authValues,
      phoneInputState,
      schedulePhoneFocus,
      scheduleSubmitFocus,
      scheduleSubmitFocusAfterValidPhone,
      setAuthValues,
      setEmailTouched,
      setNameTouched,
      setPhoneInputState,
      setPhoneTouched
    });

  const handleModeChange = useCallback((mode: OtpAuthFormMode) => {
    setAuthMode(mode);
    setAuthStep("credentials");
    setChallenge(null);
    setPendingCredential(null);
    setCode("");
    setServerError(null);
  }, []);

  return (
    <main className={styles.page}>
      <AuthVisualPane copy={copy.visual} motionKey={locale} />
      <section className={styles.formPane} aria-label={copy.sectionAriaLabel}>
        <AuthStepMotion step={authStep}>
          {authStep === "credentials" ? (
            <OtpAuthForm
              mode={authMode}
              identifierFieldOrder="email-phone"
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
              onPhoneInputKeyDown={handlePhoneInputKeyDown}
              onValuesChange={handleValuesChange}
              onSubmit={() => {
                void handleCredentialSubmit();
              }}
            />
          ) : (
            <OtpCodeForm
              backIconSize={24}
              code={code}
              maskedIdentifier={challenge?.maskedIdentifier ?? ""}
              copy={copy.codeForm}
              error={serverError}
              isSubmitting={isSubmitting}
              isResendDisabled={resendCountdownSeconds > 0}
              codeInputRef={codeInputRef}
              resendCooldownLabel={resendCooldownLabel}
              submitDisabled={code.length !== 6}
              onBack={handleBackToCredentials}
              onCodeChange={setCode}
              onResend={() => {
                void handleResend();
              }}
              onSubmit={(submittedCode) => {
                void handleCodeSubmit(submittedCode);
              }}
            />
          )}
        </AuthStepMotion>
      </section>
    </main>
  );
}
