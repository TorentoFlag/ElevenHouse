import { HttpError } from "../../../common/http/HttpError";

export type ClientAstroDiaryActionError =
  | "stale"
  | "idempotency"
  | "allowance"
  | "read_only"
  | "state"
  | "generic";

export function toClientAstroDiaryActionError(error: unknown): ClientAstroDiaryActionError {
  if (!(error instanceof HttpError)) return "generic";
  const code = readCode(error.body);
  if (code === "stale_version") return "stale";
  if (code === "idempotency_conflict") return "idempotency";
  if (code === "allowance_exhausted") return "allowance";
  if (code === "no_open_cycle" || code === "journal_state_conflict") return "state";
  if (
    error.status === 403 ||
    code === "paid_access_ended" ||
    code === "journal_not_writable" ||
    code === "finance_denied"
  ) return "read_only";
  return "generic";
}

function readCode(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("code" in body)) return null;
  return typeof body.code === "string" ? body.code : null;
}
