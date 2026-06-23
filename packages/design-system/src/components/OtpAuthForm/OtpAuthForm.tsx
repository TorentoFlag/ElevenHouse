import { classNames } from "../../helpers/classNames.js";
import { Button } from "../Button/index.js";
import { SegmentedTabs } from "../SegmentedTabs/index.js";
import { MotionContent, MotionHeight, MotionText } from "../../motion/index.js";
import { OtpAuthBrandHeader } from "./components/OtpAuthBrandHeader.js";
import { OtpAuthPhoneField } from "./components/OtpAuthPhoneField.js";
import { OtpAuthTextField } from "./components/OtpAuthTextField.js";
import { useOtpAuthValueHandlers } from "./components/useOtpAuthValueHandlers.js";
import { defaultCopy } from "./const.js";
import type { OtpAuthFormProps } from "./types.js";

export function OtpAuthForm({
  mode,
  values,
  className,
  copy,
  error,
  emailDisabled = false,
  emailError,
  emailInputRef,
  identifierFieldOrder = "phone-email",
  isSubmitting = false,
  localeSwitcher,
  nameError,
  nameInputRef,
  phoneCountries,
  phoneCountry,
  phoneDisabled = false,
  phoneError,
  phoneInputRef,
  phonePlaceholder,
  submitButtonRef,
  submitDisabled = false,
  onModeChange,
  onPhoneCountryChange,
  onPhoneInputKeyDown,
  onValuesChange,
  onSubmit
}: OtpAuthFormProps) {
  const text = { ...defaultCopy, ...copy };
  const title = mode === "register" ? text.registerTitle : text.loginTitle;
  const description = mode === "register" ? text.registerDescription : text.loginDescription;
  const submitLabel = mode === "register" ? text.registerSubmitLabel : text.loginSubmitLabel;
  const localeMotionKey = localeSwitcher?.locale ?? "default";
  const heightMotionKey = `${mode}:${localeMotionKey}`;
  const rootClassName = classNames("ehOtpAuthForm", className);
  const resolvedPhonePlaceholder = phonePlaceholder ?? text.phonePlaceholder;
  const { handleEmailChange, handleNameChange, handlePhoneChange } = useOtpAuthValueHandlers({
    values,
    onValuesChange
  });

  function renderMotionText(scope: string, value: string) {
    return (
      <MotionText transitionKey={`${localeMotionKey}:${mode}:${scope}:${value}`}>
        {value}
      </MotionText>
    );
  }

  const phoneField = (
    <OtpAuthPhoneField
      label={text.phoneLabel}
      placeholder={resolvedPhonePlaceholder}
      value={values.phone}
      countryAriaLabel={text.phoneCountryAriaLabel}
      country={phoneCountry}
      countries={phoneCountries}
      disabled={phoneDisabled}
      error={phoneError}
      inputRef={phoneInputRef}
      renderMotionText={renderMotionText}
      onChange={handlePhoneChange}
      onCountryChange={onPhoneCountryChange}
      onInputKeyDown={onPhoneInputKeyDown}
    />
  );

  const emailField = (
    <OtpAuthTextField
      name="email"
      label={text.emailLabel}
      placeholder={text.emailPlaceholder}
      value={values.email}
      type="email"
      autoComplete="email"
      disabled={emailDisabled}
      error={emailError}
      errorId="eh-otp-auth-email-error"
      inputRef={emailInputRef}
      renderMotionText={renderMotionText}
      onChange={handleEmailChange}
    />
  );

  const identifierFields =
    identifierFieldOrder === "email-phone" ? (
      <>
        {emailField}
        {phoneField}
      </>
    ) : (
      <>
        {phoneField}
        {emailField}
      </>
    );

  return (
    <div className={rootClassName}>
      <OtpAuthBrandHeader
        brandTitle={text.brandTitle}
        brandAccent={text.brandAccent}
        brandSubtitle={text.brandSubtitle}
        localeSwitcher={localeSwitcher}
        renderMotionText={renderMotionText}
      />

      <SegmentedTabs
        className="ehOtpAuthForm__tabs"
        value={mode}
        ariaLabel="Auth mode"
        options={[
          { value: "register", label: renderMotionText("registerTab", text.registerTab) },
          { value: "login", label: renderMotionText("loginTab", text.loginTab) }
        ]}
        onValueChange={onModeChange}
      />

      <MotionHeight className="ehOtpAuthForm__motionFrame" transitionKey={heightMotionKey}>
        <MotionContent className="ehOtpAuthForm__motionContent" transitionKey={mode}>
          <h1 className="ehOtpAuthForm__title">{renderMotionText("title", title)}</h1>
          <p className="ehOtpAuthForm__description">
            {renderMotionText("description", description)}
          </p>

          {mode === "register" ? (
            <OtpAuthTextField
              name="name"
              label={text.nameLabel}
              placeholder={text.namePlaceholder}
              value={values.name}
              autoComplete="name"
              error={nameError}
              errorId="eh-otp-auth-name-error"
              inputRef={nameInputRef}
              renderMotionText={renderMotionText}
              onChange={handleNameChange}
            />
          ) : null}

          {identifierFields}

          <p className="ehOtpAuthForm__hint">{renderMotionText("hint", text.hint)}</p>

          {error ? (
            <p className="ehOtpAuthForm__error" role="alert">
              {renderMotionText("error", error)}
            </p>
          ) : null}

          <Button
            className="ehOtpAuthForm__submit"
            title={renderMotionText("submit", isSubmitting ? "..." : submitLabel)}
            variant="brand"
            size="medium"
            type="button"
            ref={submitButtonRef}
            disabled={submitDisabled || isSubmitting}
            onClick={() => onSubmit?.(values, mode)}
          />
        </MotionContent>
      </MotionHeight>
    </div>
  );
}
