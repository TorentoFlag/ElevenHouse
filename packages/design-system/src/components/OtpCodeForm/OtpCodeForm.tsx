import type { ChangeEvent } from "react";
import { classNames } from "../../helpers/classNames.js";
import { Refresh } from "../../icons/Refresh/index.js";
import { Button } from "../Button/index.js";
import { defaultCopy } from "./const.js";
import type { OtpCodeFormProps } from "./types.js";

export function OtpCodeForm({
  code,
  maskedIdentifier,
  className,
  copy,
  error,
  isResendDisabled = false,
  isSubmitting = false,
  codeInputRef,
  submitDisabled = false,
  onBack,
  onCodeChange,
  onResend,
  onSubmit
}: OtpCodeFormProps) {
  const text = { ...defaultCopy, ...copy };
  const description = text.description.replace("{identifier}", maskedIdentifier);
  const digits = Array.from({ length: 6 }, (_, index) => code[index] ?? "");

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    onCodeChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
  }

  return (
    <div className={classNames("ehOtpCodeForm", className)}>
      <div className="ehOtpCodeForm__topBar">
        <button
          className="ehOtpCodeForm__back"
          type="button"
          aria-label={text.backLabel}
          disabled={isSubmitting}
          onClick={onBack}
        >
          <span aria-hidden="true" />
        </button>
        <button
          className="ehOtpCodeForm__changeIdentifier"
          type="button"
          disabled={isSubmitting}
          onClick={onBack}
        >
          {text.changeIdentifierLabel}
        </button>
      </div>

      <h1 className="ehOtpCodeForm__title">{text.title}</h1>
      <p className="ehOtpCodeForm__description">{description}</p>
      <p className="ehOtpCodeForm__help">{text.helpText}</p>

      <label className="ehOtpCodeForm__field">
        <span className="ehOtpCodeForm__label">{text.codeLabel}</span>
        <input
          className="ehOtpCodeForm__nativeInput"
          name="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={text.codePlaceholder}
          value={code}
          maxLength={6}
          ref={codeInputRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "eh-otp-code-error" : undefined}
          onChange={handleCodeChange}
        />
        <span
          className={classNames("ehOtpCodeForm__digitGroup", {
            "ehOtpCodeForm__digitGroup--invalid": Boolean(error)
          })}
          aria-hidden="true"
        >
          {digits.map((digit, index) => (
            <span
              className={classNames("ehOtpCodeForm__digitCell", {
                "ehOtpCodeForm__digitCell--active": index === Math.min(code.length, 5)
              })}
              key={index}
            >
              {digit}
            </span>
          ))}
        </span>
      </label>

      {error ? (
        <p className="ehOtpCodeForm__error" id="eh-otp-code-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ehOtpCodeForm__resendRow">
        <Button
          className="ehOtpCodeForm__resend"
          title={text.resendLabel}
          variant="default"
          size="small"
          type="button"
          disabled={isSubmitting || isResendDisabled}
          onClick={onResend}
          startIcon={
            <Refresh
              className="ehOtpCodeForm__resendIcon"
              width={26}
              height={26}
              aria-hidden={true}
            />
          }
        />
      </div>

      <p className="ehOtpCodeForm__deliveryHint">{text.deliveryHint}</p>

      <div className="ehOtpCodeForm__actions">
        <Button
          className="ehOtpCodeForm__submit"
          title={isSubmitting ? "..." : text.submitLabel}
          variant="brand"
          size="medium"
          type="button"
          disabled={submitDisabled || isSubmitting}
          onClick={() => onSubmit(code)}
        />
      </div>
    </div>
  );
}
