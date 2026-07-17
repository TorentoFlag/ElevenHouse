import { HttpError } from "../../../common/http/HttpError";

export function getNumerologyActionErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof HttpError &&
    isErrorBodyWithCode(error.body, "ASTROLOGER_TIMEZONE_REQUIRED")
  ) {
    return "Укажите часовой пояс в настройках профиля и повторите расчёт";
  }

  return fallback;
}

function isErrorBodyWithCode(body: unknown, code: string): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    (body as { readonly code?: unknown }).code === code
  );
}
