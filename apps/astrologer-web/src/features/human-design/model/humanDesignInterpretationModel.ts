import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type HumanDesignInterpretationState = {
  readonly latestText: string;
  readonly latestStatus: "draft" | "approved" | null;
  readonly aiDisabled: boolean;
  readonly aiDisabledReason: string | null;
};

export function getHumanDesignInterpretationState(
  calculation: CalculationRecordResponse | null,
  isBusy: boolean
): HumanDesignInterpretationState {
  const latest = calculation?.interpretations.at(-1) ?? null;
  const aiDisabledReason = getAiDisabledReason(calculation, isBusy);

  return {
    latestText: latest?.text ?? "",
    latestStatus: latest?.status ?? null,
    aiDisabled: aiDisabledReason !== null,
    aiDisabledReason
  };
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
