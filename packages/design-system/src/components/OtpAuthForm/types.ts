import type { KeyboardEvent, Ref } from "react";
import type { LanguageSwitcherProps } from "../LanguageSwitcher/index.js";

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
  phoneCountryAriaLabel: string;
  hint: string;
  registerSubmitLabel: string;
  loginSubmitLabel: string;
};

export type OtpAuthPhoneCountryOption = {
  iso2: string;
  name: string;
  flag: string;
  callingCode: string;
};

export type OtpAuthLocaleSwitcher = LanguageSwitcherProps;

export type OtpAuthFormProps = {
  mode: OtpAuthFormMode;
  values: OtpAuthFormValues;
  className?: string;
  copy?: Partial<OtpAuthFormCopy>;
  error?: string | null;
  emailDisabled?: boolean;
  emailError?: string | null;
  emailInputRef?: Ref<HTMLInputElement>;
  isSubmitting?: boolean;
  nameError?: string | null;
  nameInputRef?: Ref<HTMLInputElement>;
  localeSwitcher?: OtpAuthLocaleSwitcher;
  phoneCountries?: readonly OtpAuthPhoneCountryOption[];
  phoneCountry?: string;
  phoneDisabled?: boolean;
  phoneError?: string | null;
  phoneInputRef?: Ref<HTMLInputElement>;
  phonePlaceholder?: string;
  submitButtonRef?: Ref<HTMLButtonElement>;
  submitDisabled?: boolean;
  onModeChange: (mode: OtpAuthFormMode) => void;
  onPhoneCountryChange?: (country: string) => void;
  onPhoneInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onValuesChange: (values: OtpAuthFormValues) => void;
  onSubmit?: (values: OtpAuthFormValues, mode: OtpAuthFormMode) => void | Promise<void>;
};
