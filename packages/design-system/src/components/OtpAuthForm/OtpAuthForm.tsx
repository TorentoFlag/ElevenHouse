import type { ChangeEvent } from "react";
import { MotionContent, MotionHeight, SegmentedIndicator } from "../../motion/index.js";
import { LogoMoon } from "../../icons/LogoMoon/index.js";
import { defaultCopy } from "./const.js";
import type { OtpAuthFormProps, OtpAuthFormValues } from "./types.js";

export function OtpAuthForm({
  mode,
  values,
  className,
  copy,
  error,
  emailError,
  emailInputRef,
  isSubmitting = false,
  nameError,
  nameInputRef,
  phoneCountries,
  phoneCountry,
  phoneError,
  phoneInputRef,
  phonePlaceholder,
  submitButtonRef,
  submitDisabled = false,
  onModeChange,
  onPhoneCountryChange,
  onValuesChange,
  onSubmit
}: OtpAuthFormProps) {
  const text = { ...defaultCopy, ...copy };
  const title = mode === "register" ? text.registerTitle : text.loginTitle;
  const description = mode === "register" ? text.registerDescription : text.loginDescription;
  const submitLabel = mode === "register" ? text.registerSubmitLabel : text.loginSubmitLabel;
  const rootClassName = ["ehOtpAuthForm", className].filter(Boolean).join(" ");
  const selectedPhoneCountry =
    phoneCountries?.find((country) => country.iso2 === phoneCountry) ?? phoneCountries?.[0] ?? null;
  const resolvedPhonePlaceholder = phonePlaceholder ?? text.phonePlaceholder;
  const phoneInputClassName = phoneError
    ? "ehOtpAuthForm__input ehOtpAuthForm__phoneInput ehOtpAuthForm__input--invalid"
    : "ehOtpAuthForm__input ehOtpAuthForm__phoneInput";
  const phoneControlClassName = phoneError
    ? "ehOtpAuthForm__phoneControl ehOtpAuthForm__phoneControl--invalid"
    : "ehOtpAuthForm__phoneControl";
  const activeTabIndex = mode === "register" ? 0 : 1;

  function handleValueChange(field: keyof OtpAuthFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onValuesChange({
        ...values,
        [field]: event.currentTarget.value
      });
    };
  }

  return (
    <div className={rootClassName}>
      <div className="ehOtpAuthForm__brand" aria-label={`${text.brandTitle}${text.brandAccent} ${text.brandSubtitle}`}>
        <LogoMoon aria-hidden="true" />
        <span className="ehOtpAuthForm__brandContent">
          <span className="ehOtpAuthForm__brandName">
            {text.brandTitle}
            <span>{text.brandAccent}</span>
          </span>
          <span className="ehOtpAuthForm__brandSubtitle">{text.brandSubtitle}</span>
        </span>
      </div>

      <div className="ehOtpAuthForm__tabs" role="tablist" aria-label="Auth mode">
        <SegmentedIndicator activeIndex={activeTabIndex} />
        <button
          className={
            mode === "register"
              ? "ehOtpAuthForm__tab ehOtpAuthForm__tab--active"
              : "ehOtpAuthForm__tab"
          }
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => onModeChange("register")}
        >
          {text.registerTab}
        </button>
        <button
          className={
            mode === "login"
              ? "ehOtpAuthForm__tab ehOtpAuthForm__tab--active"
              : "ehOtpAuthForm__tab"
          }
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => onModeChange("login")}
        >
          {text.loginTab}
        </button>
      </div>

      <MotionHeight className="ehOtpAuthForm__motionFrame" transitionKey={mode}>
        <MotionContent className="ehOtpAuthForm__motionContent" transitionKey={mode}>
          <h1 className="ehOtpAuthForm__title">{title}</h1>
          <p className="ehOtpAuthForm__description">{description}</p>

          {mode === "register" ? (
            <label className="ehOtpAuthForm__field">
              <span className="ehOtpAuthForm__label">{text.nameLabel}</span>
              <input
                className={nameError ? "ehOtpAuthForm__input ehOtpAuthForm__input--invalid" : "ehOtpAuthForm__input"}
                name="name"
                placeholder={text.namePlaceholder}
                value={values.name}
                autoComplete="name"
                ref={nameInputRef}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "eh-otp-auth-name-error" : undefined}
                onChange={handleValueChange("name")}
              />
              {nameError ? (
                <span className="ehOtpAuthForm__fieldError" id="eh-otp-auth-name-error">
                  {nameError}
                </span>
              ) : null}
            </label>
          ) : null}

          <label className="ehOtpAuthForm__field ehOtpAuthForm__field--compact">
            <span className="ehOtpAuthForm__label">{text.phoneLabel}</span>
            <span className={phoneControlClassName}>
              <input
                className={phoneInputClassName}
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder={resolvedPhonePlaceholder}
                value={values.phone}
                autoComplete="tel"
                ref={phoneInputRef}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? "eh-otp-auth-phone-error" : undefined}
                onChange={handleValueChange("phone")}
              />
              {selectedPhoneCountry && phoneCountries && phoneCountries.length > 0 ? (
                <span className="ehOtpAuthForm__phoneCountry">
                  <select
                    className="ehOtpAuthForm__phoneCountrySelect"
                    value={selectedPhoneCountry.iso2}
                    aria-label="Страна телефона"
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      onPhoneCountryChange?.(event.currentTarget.value);
                    }}
                  >
                    {phoneCountries.map((country) => (
                      <option key={country.iso2} value={country.iso2}>
                        {country.flag} {country.iso2} +{country.callingCode}
                      </option>
                    ))}
                  </select>
                </span>
              ) : null}
            </span>
            {phoneError ? (
              <span className="ehOtpAuthForm__fieldError" id="eh-otp-auth-phone-error">
                {phoneError}
              </span>
            ) : null}
          </label>

          <label className="ehOtpAuthForm__field">
            <span className="ehOtpAuthForm__label">{text.emailLabel}</span>
            <input
              className={emailError ? "ehOtpAuthForm__input ehOtpAuthForm__input--invalid" : "ehOtpAuthForm__input"}
              name="email"
              type="email"
              placeholder={text.emailPlaceholder}
              value={values.email}
              autoComplete="email"
              ref={emailInputRef}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "eh-otp-auth-email-error" : undefined}
              onChange={handleValueChange("email")}
            />
            {emailError ? (
              <span className="ehOtpAuthForm__fieldError" id="eh-otp-auth-email-error">
                {emailError}
              </span>
            ) : null}
          </label>

          <p className="ehOtpAuthForm__hint">{text.hint}</p>

          {error ? (
            <p className="ehOtpAuthForm__error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="ehOtpAuthForm__submit"
            type="button"
            ref={submitButtonRef}
            disabled={submitDisabled || isSubmitting}
            onClick={() => onSubmit?.(values, mode)}
          >
            {isSubmitting ? "..." : submitLabel}
          </button>
        </MotionContent>
      </MotionHeight>
    </div>
  );
}
