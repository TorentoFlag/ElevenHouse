import type { ChangeEvent, Ref } from "react";
import { LogoMoon } from "../../icons/LogoMoon/index.js";

export type OtpAuthFormMode = "register" | "login";

export type OtpAuthFormValues = {
  name: string;
  email: string;
  phone: string;
};

export type OtpAuthFormCopy = {
  brandTitle: string;
  brandAccent: string;
  brandSubtitle: string;
  registerTab: string;
  loginTab: string;
  registerTitle: string;
  loginTitle: string;
  registerDescription: string;
  loginDescription: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  hint: string;
  registerSubmitLabel: string;
  loginSubmitLabel: string;
};

export type OtpAuthFormProps = {
  mode: OtpAuthFormMode;
  values: OtpAuthFormValues;
  className?: string;
  copy?: Partial<OtpAuthFormCopy>;
  error?: string | null;
  emailError?: string | null;
  emailInputRef?: Ref<HTMLInputElement>;
  isSubmitting?: boolean;
  nameError?: string | null;
  nameInputRef?: Ref<HTMLInputElement>;
  phoneInputRef?: Ref<HTMLInputElement>;
  submitButtonRef?: Ref<HTMLButtonElement>;
  submitDisabled?: boolean;
  onModeChange: (mode: OtpAuthFormMode) => void;
  onValuesChange: (values: OtpAuthFormValues) => void;
  onSubmit?: (values: OtpAuthFormValues, mode: OtpAuthFormMode) => void | Promise<void>;
};

const defaultCopy: OtpAuthFormCopy = {
  brandTitle: "Eleven",
  brandAccent: "House",
  brandSubtitle: "КАБИНЕТ АСТРОЛОГА",
  registerTab: "Регистрация",
  loginTab: "Вход",
  registerTitle: "Создать аккаунт",
  loginTitle: "С возвращением",
  registerDescription: "Доступ к консультациям, картам и переписке с астрологом.",
  loginDescription: "Войдите, чтобы вернуться в свой кабинет.",
  nameLabel: "Имя",
  namePlaceholder: "Как к вам обращаться",
  emailLabel: "или email",
  emailPlaceholder: "you@example.com",
  phoneLabel: "Телефон",
  phonePlaceholder: "+7 ___ ___ __ __",
  hint: "Пришлём код для входа — пароль не нужен.",
  registerSubmitLabel: "Получить код",
  loginSubmitLabel: "Войти по коду"
};

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
  phoneInputRef,
  submitButtonRef,
  submitDisabled = false,
  onModeChange,
  onValuesChange,
  onSubmit
}: OtpAuthFormProps) {
  const text = { ...defaultCopy, ...copy };
  const title = mode === "register" ? text.registerTitle : text.loginTitle;
  const description = mode === "register" ? text.registerDescription : text.loginDescription;
  const submitLabel = mode === "register" ? text.registerSubmitLabel : text.loginSubmitLabel;
  const rootClassName = ["ehOtpAuthForm", className].filter(Boolean).join(" ");

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
        <input
          className="ehOtpAuthForm__input"
          name="phone"
          type="tel"
          placeholder={text.phonePlaceholder}
          value={values.phone}
          autoComplete="tel"
          ref={phoneInputRef}
          onChange={handleValueChange("phone")}
        />
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
    </div>
  );
}
