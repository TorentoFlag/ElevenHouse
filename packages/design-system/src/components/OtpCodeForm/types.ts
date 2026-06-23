import type { Ref } from "react";

export type OtpCodeFormCopy = {
  readonly title: string;
  readonly description: string;
  readonly codeLabel: string;
  readonly codePlaceholder: string;
  readonly submitLabel: string;
  readonly backLabel: string;
  readonly resendLabel: string;
};

export type OtpCodeFormProps = {
  readonly code: string;
  readonly maskedIdentifier: string;
  readonly className?: string;
  readonly copy?: Partial<OtpCodeFormCopy>;
  readonly error?: string | null;
  readonly isResendDisabled?: boolean;
  readonly isSubmitting?: boolean;
  readonly codeInputRef?: Ref<HTMLInputElement>;
  readonly submitDisabled?: boolean;
  readonly onBack: () => void;
  readonly onCodeChange: (code: string) => void;
  readonly onResend: () => void;
  readonly onSubmit: (code: string) => void;
};
