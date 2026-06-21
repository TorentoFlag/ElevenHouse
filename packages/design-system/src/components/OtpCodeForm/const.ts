import type { OtpCodeFormCopy } from "./types.js";

export const defaultCopy: OtpCodeFormCopy = {
  title: "Введите код",
  description: "Мы отправили код на {identifier}",
  codeLabel: "Код",
  codePlaceholder: "000000",
  submitLabel: "Продолжить",
  backLabel: "Изменить данные",
  resendLabel: "Отправить повторно"
};
