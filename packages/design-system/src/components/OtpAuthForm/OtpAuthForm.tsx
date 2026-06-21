import type { ChangeEvent } from "react";
import { classNames } from "../../helpers/classNames.js";
import { LogoMoon } from "../../icons/LogoMoon/index.js";
import { Button } from "../Button/index.js";
import { LanguageSwitcher } from "../LanguageSwitcher/index.js";
import { SegmentedTabs } from "../SegmentedTabs/index.js";
import { MotionContent, MotionHeight } from "../../motion/index.js";
import { defaultCopy } from "./const.js";
import type { OtpAuthFormProps, OtpAuthFormValues } from "./types.js";

export function OtpAuthForm({
  mode,
  values,
  className,
  copy,
  error,
  emailDisabled = false,
  emailError,
  emailInputRef,
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
  const rootClassName = classNames("ehOtpAuthForm", className);
  const selectedPhoneCountry =
    phoneCountries?.find((country) => country.iso2 === phoneCountry) ?? phoneCountries?.[0] ?? null;
  const resolvedPhonePlaceholder = phonePlaceholder ?? text.phonePlaceholder;
  const phoneInputClassName = classNames("ehOtpAuthForm__input", "ehOtpAuthForm__phoneInput", {
    "ehOtpAuthForm__input--invalid": Boolean(phoneError)
  });
  const phoneControlClassName = classNames("ehOtpAuthForm__phoneControl", {
    "ehOtpAuthForm__phoneControl--invalid": Boolean(phoneError)
  });
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
      <div className="ehOtpAuthForm__brandHeader">
        <div
          className="ehOtpAuthForm__brand"
          aria-label={`${text.brandTitle}${text.brandAccent} ${text.brandSubtitle}`}
        >
          <LogoMoon aria-hidden="true" />
          <span className="ehOtpAuthForm__brandContent">
            <span className="ehOtpAuthForm__brandName">
              {text.brandTitle}
              <span>{text.brandAccent}</span>
            </span>
            <span className="ehOtpAuthForm__brandSubtitle">{text.brandSubtitle}</span>
          </span>
        </div>

        {localeSwitcher ? (
          <LanguageSwitcher
            locale={localeSwitcher.locale}
            options={localeSwitcher.options}
            ariaLabel={localeSwitcher.ariaLabel}
            onLocaleChange={localeSwitcher.onLocaleChange}
          />
        ) : null}
      </div>

      <SegmentedTabs
        className="ehOtpAuthForm__tabs"
        value={mode}
        ariaLabel="Auth mode"
        options={[
          { value: "register", label: text.registerTab },
          { value: "login", label: text.loginTab }
        ]}
        onValueChange={onModeChange}
      />

      <MotionHeight className="ehOtpAuthForm__motionFrame" transitionKey={mode}>
        <MotionContent className="ehOtpAuthForm__motionContent" transitionKey={mode}>
          <h1 className="ehOtpAuthForm__title">{title}</h1>
          <p className="ehOtpAuthForm__description">{description}</p>

          {mode === "register" ? (
            <label className="ehOtpAuthForm__field">
              <span className="ehOtpAuthForm__label">{text.nameLabel}</span>
              <input
                className={classNames("ehOtpAuthForm__input", {
                  "ehOtpAuthForm__input--invalid": Boolean(nameError)
                })}
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
                disabled={phoneDisabled}
                ref={phoneInputRef}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? "eh-otp-auth-phone-error" : undefined}
                onChange={handleValueChange("phone")}
                onKeyDown={onPhoneInputKeyDown}
              />
              {selectedPhoneCountry && phoneCountries && phoneCountries.length > 0 ? (
                <span className="ehOtpAuthForm__phoneCountry">
                  <select
                    className="ehOtpAuthForm__phoneCountrySelect"
                    value={selectedPhoneCountry.iso2}
                    aria-label={text.phoneCountryAriaLabel}
                    disabled={phoneDisabled}
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
              className={classNames("ehOtpAuthForm__input", {
                "ehOtpAuthForm__input--invalid": Boolean(emailError)
              })}
              name="email"
              type="email"
              placeholder={text.emailPlaceholder}
              value={values.email}
              autoComplete="email"
              disabled={emailDisabled}
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

          <Button
            className="ehOtpAuthForm__submit"
            title={isSubmitting ? "..." : submitLabel}
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
