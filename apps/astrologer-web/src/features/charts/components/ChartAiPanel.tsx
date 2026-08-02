import { useEffect, useMemo, useState } from "react";
import type {
  CalculationInterpretationResponse,
  CalculationRecordResponse,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";
import {
  approveCalculationInterpretation,
  getCalculation,
  saveCalculationInterpretation
} from "../../calculations/api/calculationsApi";
import { createChartAiDraft } from "../api/chartsApi";
import styles from "./ChartEnginePage.module.css";

type ChartAiPanelProps = {
  readonly calculationId: string | null;
  readonly isBusy: boolean;
  readonly isResultStale: boolean;
  readonly result: StoredChartCalculationPayload | null;
};

export function ChartAiPanel({
  calculationId,
  isBusy,
  isResultStale,
  result
}: ChartAiPanelProps) {
  const [calculation, setCalculation] = useState<CalculationRecordResponse | null>(null);
  const [draftText, setDraftText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const latestInterpretation = useMemo(
    () => getLatestInterpretation(calculation?.interpretations ?? []),
    [calculation]
  );
  const unsupportedMethod = result && result.method !== "natal";
  const disabledReason = getDisabledReason({
    calculationId,
    isResultStale,
    result,
    unsupportedMethod: Boolean(unsupportedMethod)
  });

  useEffect(() => {
    let active = true;
    setLoadErrorMessage(null);
    setActionErrorMessage(null);
    setCalculation(null);
    setDraftText("");
    setSavedText("");
    if (!calculationId) return undefined;

    setIsLoading(true);
    getCalculation(calculationId)
      .then((response) => {
        if (!active) return;
        setCalculation(response);
        const interpretation = getLatestInterpretation(response.interpretations);
        const text = interpretation?.text ?? "";
        setDraftText(text);
        setSavedText(text);
      })
      .catch(() => {
        if (!active) return;
        setLoadErrorMessage(getChartAiLoadErrorMessage());
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [calculationId]);

  async function generateDraft() {
    if (!calculationId || disabledReason) return;
    if (!calculation) {
      setActionErrorMessage(getChartAiLoadErrorMessage());
      return;
    }
    setIsGenerating(true);
    setActionErrorMessage(null);
    try {
      const response = await createChartAiDraft({
        calculationId,
        body: { expectedResultChecksum: calculation.resultChecksum }
      });
      setCalculation(response);
      const interpretation = getLatestInterpretation(response.interpretations);
      const text = interpretation?.text ?? "";
      setDraftText(text);
      setSavedText(text);
    } catch (error) {
      setActionErrorMessage(getChartAiDraftErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraft() {
    if (!calculationId || !calculation || !draftText.trim()) return;
    setIsSaving(true);
    setActionErrorMessage(null);
    try {
      const response = await saveCalculationInterpretation({
        calculationId,
        body: {
          expectedResultChecksum: calculation.resultChecksum,
          text: draftText
        }
      });
      setCalculation(response);
      const interpretation = getLatestInterpretation(response.interpretations);
      const text = interpretation?.text ?? draftText;
      setDraftText(text);
      setSavedText(text);
    } catch (error) {
      setActionErrorMessage(
        error instanceof Error ? error.message : "Не удалось сохранить черновик"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function approveDraft() {
    if (!calculationId || !latestInterpretation) return;
    setIsApproving(true);
    setActionErrorMessage(null);
    try {
      const response = await approveCalculationInterpretation({
        calculationId,
        interpretationId: latestInterpretation.id
      });
      setCalculation(response);
      const interpretation = getLatestInterpretation(response.interpretations);
      const text = interpretation?.text ?? draftText;
      setDraftText(text);
      setSavedText(text);
    } catch (error) {
      setActionErrorMessage(
        error instanceof Error ? error.message : "Не удалось утвердить трактовку"
      );
    } finally {
      setIsApproving(false);
    }
  }

  const hasUnsavedChanges = draftText.trim() !== savedText.trim();
  const controlsDisabled =
    isBusy || isLoading || !calculation || isGenerating || isSaving || isApproving;
  const visibleErrorMessage = loadErrorMessage ?? actionErrorMessage;

  return (
    <section className={styles.chartAiPanel} aria-labelledby="chart-ai-heading">
      <div className={styles.chartAiHeader}>
        <div>
          <span>AI</span>
          <h2 id="chart-ai-heading">Черновик трактовки</h2>
          <p>Сгенерируйте текст поверх результата расчета, проверьте и утвердите перед клиентом.</p>
        </div>
        {latestInterpretation ? (
          <b>{latestInterpretation.status === "approved" ? "утверждено" : "черновик"}</b>
        ) : null}
      </div>

      {disabledReason ? (
        <div className={styles.chartAiEmpty}>{disabledReason}</div>
      ) : (
        <>
          <div className={styles.chartAiToolbar}>
            <button
              className={styles.chartAiPrimaryButton}
              type="button"
              disabled={controlsDisabled}
              onClick={() => void generateDraft()}
            >
              {isGenerating ? "Генерируем..." : draftText ? "Сгенерировать заново" : "Сгенерировать"}
            </button>
            <button
              className={styles.chartAiSecondaryButton}
              type="button"
              disabled={controlsDisabled || !draftText.trim() || !hasUnsavedChanges}
              onClick={() => void saveDraft()}
            >
              {isSaving ? "Сохраняем..." : "Сохранить правки"}
            </button>
            <button
              className={styles.chartAiSecondaryButton}
              type="button"
              disabled={controlsDisabled || !latestInterpretation || hasUnsavedChanges}
              onClick={() => void approveDraft()}
            >
              {isApproving ? "Утверждаем..." : "Утвердить"}
            </button>
          </div>

          {visibleErrorMessage ? (
            <div className={styles.chartAiError} role="alert">
              {visibleErrorMessage}
            </div>
          ) : null}

          <textarea
            className={styles.chartAiEditor}
            value={draftText}
            placeholder={isLoading ? "Загружаем черновик..." : "AI-черновик появится здесь."}
            disabled={controlsDisabled && !draftText}
            onChange={(event) => setDraftText(event.currentTarget.value)}
          />
        </>
      )}
    </section>
  );
}

function getLatestInterpretation(
  interpretations: readonly CalculationInterpretationResponse[]
): CalculationInterpretationResponse | null {
  return interpretations.length ? interpretations[interpretations.length - 1] ?? null : null;
}

function getDisabledReason(input: {
  readonly calculationId: string | null;
  readonly isResultStale: boolean;
  readonly result: StoredChartCalculationPayload | null;
  readonly unsupportedMethod: boolean;
}): string | null {
  if (!input.result) return "После расчёта натальной карты здесь появится AI-черновик.";
  if (input.isResultStale) return "Результат устарел. Пересчитайте карту перед AI-черновиком.";
  if (!input.calculationId) return "Сначала сохраните расчёт карты.";
  if (input.unsupportedMethod) {
    return "AI-черновик сейчас подключён для натальной карты. Для других методов нужен отдельный контекст и prompt schema.";
  }
  return null;
}

function getChartAiLoadErrorMessage(): string {
  return "Не удалось загрузить расчёт карты. Обновите страницу и повторите";
}

function getChartAiDraftErrorMessage(error: unknown): string {
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
