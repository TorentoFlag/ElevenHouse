import type { OtpCodeFormCopy } from "./types.js";

export const defaultCopy: OtpCodeFormCopy = {
  title: "Введите код",
  description: "Мы отправили код на {identifier}",
  helpText: "Код обычно приходит в течение 30 секунд",
  codeLabel: "Код",
  codePlaceholder: "000000",
  submitLabel: "Продолжить",
  backLabel: "Изменить данные",
  changeIdentifierLabel: "Изменить данные",
  resendLabel: "Отправить повторно",
  deliveryHint: "Проверьте SMS или сообщения в приложении"
};
