import type { ChangeEvent, ChangeEventHandler, KeyboardEvent, Ref } from "react";
import { classNames } from "../../../helpers/classNames.js";
import type { OtpAuthPhoneCountryOption } from "../types.js";
import type { OtpAuthMotionTextRenderer } from "./types.js";

export type OtpAuthPhoneFieldProps = {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly countryAriaLabel: string;
  readonly country?: string;
  readonly countries?: readonly OtpAuthPhoneCountryOption[];
  readonly disabled?: boolean;
  readonly error?: string | null;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly renderMotionText: OtpAuthMotionTextRenderer;
  readonly onChange: ChangeEventHandler<HTMLInputElement>;
  readonly onCountryChange?: (country: string) => void;
  readonly onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function OtpAuthPhoneField({
  label,
  placeholder,
  value,
  countryAriaLabel,
  country,
  countries,
  disabled,
  error,
  inputRef,
  renderMotionText,
  onChange,
  onCountryChange,
  onInputKeyDown
}: OtpAuthPhoneFieldProps) {
  const selectedCountry =
    countries?.find((countryOption) => countryOption.iso2 === country) ?? countries?.[0] ?? null;
  const inputClassName = classNames("ehOtpAuthForm__input", "ehOtpAuthForm__phoneInput", {
    "ehOtpAuthForm__input--invalid": Boolean(error)
  });
  const controlClassName = classNames("ehOtpAuthForm__phoneControl", {
    "ehOtpAuthForm__phoneControl--invalid": Boolean(error)
  });

  return (
    <label className="ehOtpAuthForm__field ehOtpAuthForm__field--compact">
      <span className="ehOtpAuthForm__label">{renderMotionText("phoneLabel", label)}</span>
      <span className={controlClassName}>
        <input
          className={inputClassName}
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder={placeholder}
          value={value}
          autoComplete="tel"
          disabled={disabled}
          ref={inputRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "eh-otp-auth-phone-error" : undefined}
          onChange={onChange}
          onKeyDown={onInputKeyDown}
        />
        {selectedCountry && countries && countries.length > 0 ? (
          <span className="ehOtpAuthForm__phoneCountry">
            <select
              className="ehOtpAuthForm__phoneCountrySelect"
              value={selectedCountry.iso2}
              aria-label={countryAriaLabel}
              disabled={disabled}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                onCountryChange?.(event.currentTarget.value);
              }}
            >
              {countries.map((countryOption) => (
                <option key={countryOption.iso2} value={countryOption.iso2}>
                  {countryOption.flag} {countryOption.iso2} +{countryOption.callingCode}
                </option>
              ))}
            </select>
          </span>
        ) : null}
      </span>
      {error ? (
        <span className="ehOtpAuthForm__fieldError" id="eh-otp-auth-phone-error">
          {renderMotionText("phoneError", error)}
        </span>
      ) : null}
    </label>
  );
}
