import type { ChangeEventHandler, Ref } from "react";
import { classNames } from "../../../helpers/classNames.js";
import type { OtpAuthMotionTextRenderer } from "./types.js";

export type OtpAuthTextFieldProps = {
  readonly name: "name" | "email";
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly autoComplete: string;
  readonly errorId: string;
  readonly disabled?: boolean;
  readonly error?: string | null;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly type?: "email";
  readonly renderMotionText: OtpAuthMotionTextRenderer;
  readonly onChange: ChangeEventHandler<HTMLInputElement>;
};

export function OtpAuthTextField({
  name,
  label,
  placeholder,
  value,
  autoComplete,
  errorId,
  disabled,
  error,
  inputRef,
  type,
  renderMotionText,
  onChange
}: OtpAuthTextFieldProps) {
  return (
    <label className="ehOtpAuthForm__field">
      <span className="ehOtpAuthForm__label">{renderMotionText(`${name}Label`, label)}</span>
      <input
        className={classNames("ehOtpAuthForm__input", {
          "ehOtpAuthForm__input--invalid": Boolean(error)
        })}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        ref={inputRef}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={onChange}
      />
      {error ? (
        <span className="ehOtpAuthForm__fieldError" id={errorId}>
          {renderMotionText(`${name}Error`, error)}
        </span>
      ) : null}
    </label>
  );
}
