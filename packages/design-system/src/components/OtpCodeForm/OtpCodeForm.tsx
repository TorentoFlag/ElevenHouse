import { useCallback, type ChangeEvent, type CSSProperties } from "react";
import { classNames } from "../../helpers/classNames.js";
import { ArrowLeft } from "../../icons/ArrowLeft/index.js";
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
  backIconSize,
  resendCooldownLabel,
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
  const resolvedBackIconSize = backIconSize ?? 18;
  const backButtonStyle =
    backIconSize === undefined
      ? undefined
      : ({
          "--eh-otp-code-form-back-icon-size": `${backIconSize}px`
        } as CSSProperties);

  const handleCodeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextCode = event.currentTarget.value.replace(/\D/g, "").slice(0, 6);

      onCodeChange(nextCode);

      if (nextCode.length === 6 && nextCode !== code) {
        onSubmit(nextCode);
      }
    },
    [code, onCodeChange, onSubmit]
  );

  return (
    <div className={classNames("ehOtpCodeForm", className)}>
      <div className="ehOtpCodeForm__topBar">
        <Button
          className="ehOtpCodeForm__back"
          title={text.backLabel}
          variant="default"
          size="medium"
          type="button"
          disabled={isSubmitting}
          style={backButtonStyle}
          onClick={onBack}
          startIcon={
            <ArrowLeft
              className="ehOtpCodeForm__backIcon"
              width={resolvedBackIconSize}
              height={resolvedBackIconSize}
              aria-hidden={true}
            />
          }
        />
        <Button
          className="ehOtpCodeForm__changeIdentifier"
          title={text.changeIdentifierLabel}
          variant="default"
          size="medium"
          type="button"
          disabled={isSubmitting}
          onClick={onBack}
        />
      </div>

      <p className="ehOtpCodeForm__title">{text.title}</p>
      <p className="ehOtpCodeForm__description">{description}</p>

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
          size="medium"
          type="button"
          disabled={isSubmitting || isResendDisabled}
          onClick={onResend}
          startIcon={
            <Refresh
              className="ehOtpCodeForm__resendIcon"
              width={20}
              height={20}
              aria-hidden={true}
            />
          }
        />
        {resendCooldownLabel ? (
          <span className="ehOtpCodeForm__resendCooldown">{resendCooldownLabel}</span>
        ) : null}
      </div>

      <p className="ehOtpCodeForm__deliveryHint">{text.deliveryHint}</p>

      <div className="ehOtpCodeForm__actions">
        <Button
          className="ehOtpCodeForm__submit"
          title={isSubmitting ? "..." : text.submitLabel}
          variant="brand"
          size="big"
          type="button"
          disabled={submitDisabled || isSubmitting}
          onClick={() => onSubmit(code)}
        />
      </div>
    </div>
  );
}
