import { HttpError } from "../../../common/http/HttpError";

export type AstroDiaryActionError =
  | "stale"
  | "idempotency"
  | "allowance"
  | "read_only"
  | "no_cycle"
  | "generic";

export function toAstroDiaryActionError(error: unknown): AstroDiaryActionError {
  if (!(error instanceof HttpError)) return "generic";
  const code = readErrorCode(error.body);
  if (code === "stale_version") return "stale";
  if (code === "idempotency_conflict") return "idempotency";
  if (code === "allowance_exhausted") return "allowance";
  if (code === "no_open_cycle") return "no_cycle";
  if (
    error.status === 403 ||
    code === "paid_access_ended" ||
    code === "journal_not_writable" ||
    code === "finance_denied"
  ) {
    return "read_only";
  }
  return "generic";
}

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("code" in body)) return null;
  return typeof body.code === "string" ? body.code : null;
}
