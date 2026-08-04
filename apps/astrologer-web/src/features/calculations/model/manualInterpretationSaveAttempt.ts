import { HttpError } from "../../../common/http/HttpError";

export type ManualInterpretationSaveAttempt = {
  readonly calculationId: string;
  readonly resultChecksum: string;
  readonly text: string;
  readonly idempotencyKey: string;
};

export function getManualInterpretationSaveAttempt(
  current: ManualInterpretationSaveAttempt | null,
  input: {
    readonly calculationId: string;
    readonly resultChecksum: string;
    readonly text: string;
    readonly createId?: () => string;
  }
): ManualInterpretationSaveAttempt {
  const text = input.text.trim();
  if (
    current?.calculationId === input.calculationId &&
    current.resultChecksum === input.resultChecksum &&
    current.text === text
  ) {
    return current;
  }
  return {
    calculationId: input.calculationId,
    resultChecksum: input.resultChecksum,
    text,
    idempotencyKey: (input.createId ?? (() => crypto.randomUUID()))()
  };
}

export function shouldRetainManualInterpretationSaveAttempt(error: unknown): boolean {
  if (!(error instanceof HttpError)) return true;
  const code = readErrorCode(error.body);
  if (
    code === "CALCULATION_INTERPRETATION_SAVE_IN_PROGRESS" ||
    code === "CALCULATION_INTERPRETATION_SAVE_OUTCOME_UNKNOWN"
  ) {
    return true;
  }
  if (code) return false;
  return error.status >= 500;
}

function readErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const code = (body as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}
