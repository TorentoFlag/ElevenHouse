import type { ChangeEvent } from "react";
import { classNames } from "../../helpers/classNames.js";
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

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    onCodeChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
  }

  return (
    <div className={classNames("ehOtpCodeForm", className)}>
      <button
        className="ehOtpCodeForm__back"
        type="button"
        disabled={isSubmitting}
        onClick={onBack}
      >
        {text.backLabel}
      </button>

      <h1 className="ehOtpCodeForm__title">{text.title}</h1>
      <p className="ehOtpCodeForm__description">{description}</p>

      <label className="ehOtpCodeForm__field">
        <span className="ehOtpCodeForm__label">{text.codeLabel}</span>
        <input
          className={classNames("ehOtpCodeForm__input", {
            "ehOtpCodeForm__input--invalid": Boolean(error)
          })}
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
      </label>

      {error ? (
        <p className="ehOtpCodeForm__error" id="eh-otp-code-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ehOtpCodeForm__actions">
        <button
          className="ehOtpCodeForm__resend"
          type="button"
          disabled={isSubmitting || isResendDisabled}
          onClick={onResend}
        >
          {text.resendLabel}
        </button>
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
