import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type NumerologyInterpretationState = {
  readonly isDirty: boolean;
  readonly aiDisabled: boolean;
  readonly aiDisabledReason: string | null;
  readonly approveDisabled: boolean;
  readonly saveDisabled: boolean;
};

export function getNumerologyInterpretationState(
  calculation: CalculationRecordResponse | null,
  editorText: string,
  isBusy: boolean
): NumerologyInterpretationState {
  const latest = calculation?.interpretations.at(-1) ?? null;
  const savedText = latest?.text ?? "";
  const isDirty = editorText !== savedText;
  const aiDisabledReason = getAiDisabledReason(calculation, isDirty, isBusy);

  return {
    isDirty,
    aiDisabled: aiDisabledReason !== null,
    aiDisabledReason,
    approveDisabled:
      !calculation ||
      calculation.status === "archived" ||
      !latest ||
      latest.status === "approved" ||
      isDirty ||
      isBusy,
    saveDisabled:
      !calculation ||
      calculation.status === "archived" ||
      !isDirty ||
      !editorText.trim() ||
      isBusy
  };
}

export function getNumerologyAiDraftErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return "Расчёт изменился. Откройте его заново и повторите генерацию";
    }
    if (error.status === 422) {
      return "AI не смог создать черновик для этих данных. Проверьте расчёт и повторите";
    }
    if (error.status === 429) {
      return "Лимит AI-генераций исчерпан. Повторите позже";
    }
    if (error.status === 502) {
      return "AI вернул некорректный черновик. Повторите генерацию";
    }
    if (error.status === 503) {
      return "AI временно недоступен. Повторите позже";
    }
  }
  return "Не удалось создать AI-черновик";
}

function getAiDisabledReason(
  calculation: CalculationRecordResponse | null,
  isDirty: boolean,
  isBusy: boolean
): string | null {
  if (!calculation) return "Сначала сохраните расчёт";
  if (calculation.status === "archived") return "Архивный расчёт нельзя изменять";
  if (isDirty) return "Сначала сохраните или отмените изменения";
  if (isBusy) return "Дождитесь завершения текущего действия";
  return null;
}
