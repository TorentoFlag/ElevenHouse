import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type HumanDesignInterpretationState = {
  readonly isDirty: boolean;
  readonly latestText: string;
  readonly latestStatus: "draft" | "approved" | null;
  readonly aiDisabled: boolean;
  readonly aiDisabledReason: string | null;
  readonly saveDisabled: boolean;
  readonly approveDisabled: boolean;
};

export function getHumanDesignInterpretationState(
  calculation: CalculationRecordResponse | null,
  editorText: string,
  isBusy: boolean
): HumanDesignInterpretationState {
  const latest = calculation?.interpretations.at(-1) ?? null;
  const latestText = latest?.text ?? "";
  const isDirty = editorText !== latestText;
  const aiDisabledReason = getAiDisabledReason(calculation, isBusy);

  return {
    isDirty,
    latestText,
    latestStatus: latest?.status ?? null,
    aiDisabled: aiDisabledReason !== null,
    aiDisabledReason,
    saveDisabled:
      !calculation ||
      calculation.status === "archived" ||
      !isDirty ||
      !editorText.trim() ||
      isBusy,
    approveDisabled:
      !calculation ||
      calculation.status === "archived" ||
      !latest ||
      latest.status === "approved" ||
      isDirty ||
      isBusy
  };
}

export function getCurrentHumanDesignInterpretation(calculation: CalculationRecordResponse | null) {
  return calculation?.interpretations.at(-1) ?? null;
}

export function getHumanDesignAiDraftErrorMessage(error: unknown): string {
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
  isBusy: boolean
): string | null {
  if (!calculation) return "Сначала сохраните расчёт";
  if (calculation.status === "archived") return "Архивный расчёт нельзя изменять";
  if (isBusy) return "Дождитесь завершения текущего действия";
  return null;
}
