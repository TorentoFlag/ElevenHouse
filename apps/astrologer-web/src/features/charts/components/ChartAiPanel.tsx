import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalculationInterpretationResponse,
  CalculationRecordResponse,
  ChartResult,
  DictionaryLocale
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";
import {
  approveCalculationInterpretation,
  createCalculationInterpretationIdempotencyKey,
  getCalculation,
  saveCalculationInterpretation
} from "../../calculations/api/calculationsApi";
import {
  getManualInterpretationSaveAttempt,
  shouldRetainManualInterpretationSaveAttempt,
  type ManualInterpretationSaveAttempt
} from "../../calculations/model/manualInterpretationSaveAttempt";
import { createChartAiDraft, createChartAiDraftIdempotencyKey } from "../api/chartsApi";
import { chartEngineCopyByLocale, type ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartEnginePage.module.css";

type ChartAiPanelProps = {
  readonly calculationId: string | null;
  readonly isBusy: boolean;
  readonly isResultStale: boolean;
  readonly locale?: DictionaryLocale;
  readonly result: ChartResult | null;
};

export function ChartAiPanel({
  calculationId,
  isBusy,
  isResultStale,
  locale = "ru",
  result
}: ChartAiPanelProps) {
  const copy = chartEngineCopyByLocale[locale].ai;
  const generationAttemptRef = useRef<{
    readonly calculationId: string;
    readonly resultChecksum: string;
    readonly idempotencyKey: string;
  } | null>(null);
  const manualSaveAttemptRef = useRef<ManualInterpretationSaveAttempt | null>(null);
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
    copy,
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
    generationAttemptRef.current = null;
    manualSaveAttemptRef.current = null;
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
        setLoadErrorMessage(copy.loadError);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [calculationId, copy.loadError]);

  async function generateDraft() {
    if (!calculationId || disabledReason) return;
    if (!calculation) {
      setActionErrorMessage(copy.loadError);
      return;
    }
    setIsGenerating(true);
    setActionErrorMessage(null);
    const currentAttempt = generationAttemptRef.current;
    const attempt =
      currentAttempt?.calculationId === calculationId &&
      currentAttempt.resultChecksum === calculation.resultChecksum
        ? currentAttempt
        : {
            calculationId,
            resultChecksum: calculation.resultChecksum,
            idempotencyKey: createChartAiDraftIdempotencyKey()
          };
    generationAttemptRef.current = attempt;
    try {
      const response = await createChartAiDraft({
        calculationId,
        idempotencyKey: attempt.idempotencyKey,
        body: { expectedResultChecksum: calculation.resultChecksum }
      });
      setCalculation(response);
      const interpretation = getLatestInterpretation(response.interpretations);
      const text = interpretation?.text ?? "";
      setDraftText(text);
      setSavedText(text);
      generationAttemptRef.current = null;
    } catch (error) {
      if (!shouldRetainChartAiDraftAttempt(error)) {
        generationAttemptRef.current = null;
      }
      setActionErrorMessage(getChartAiDraftErrorMessage(error, copy));
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraft() {
    if (!calculationId || !calculation || !draftText.trim()) return;
    setIsSaving(true);
    setActionErrorMessage(null);
    const attempt = getManualInterpretationSaveAttempt(manualSaveAttemptRef.current, {
      calculationId,
      resultChecksum: calculation.resultChecksum,
      text: draftText,
      createId: createCalculationInterpretationIdempotencyKey
    });
    manualSaveAttemptRef.current = attempt;
    try {
      const response = await saveCalculationInterpretation({
        calculationId,
        idempotencyKey: attempt.idempotencyKey,
        body: {
          expectedResultChecksum: calculation.resultChecksum,
          text: attempt.text
        }
      });
      setCalculation(response);
      const interpretation = getLatestInterpretation(response.interpretations);
      const savedResponseText = interpretation?.text ?? attempt.text;
      setDraftText(savedResponseText);
      setSavedText(savedResponseText);
      manualSaveAttemptRef.current = null;
    } catch (error) {
      if (!shouldRetainManualInterpretationSaveAttempt(error)) {
        manualSaveAttemptRef.current = null;
      }
      setActionErrorMessage(getManualSaveErrorMessage(error, copy));
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
    } catch {
      setActionErrorMessage(copy.approveError);
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
          <h2 id="chart-ai-heading">{copy.heading}</h2>
          <p>{copy.description}</p>
        </div>
        {latestInterpretation ? (
          <b>{latestInterpretation.status === "approved" ? copy.approved : copy.draft}</b>
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
              {isGenerating ? copy.generating : draftText ? copy.regenerate : copy.generate}
            </button>
            <button
              className={styles.chartAiSecondaryButton}
              type="button"
              disabled={controlsDisabled || !draftText.trim() || !hasUnsavedChanges}
              onClick={() => void saveDraft()}
            >
              {isSaving ? copy.saving : copy.save}
            </button>
            <button
              className={styles.chartAiSecondaryButton}
              type="button"
              disabled={controlsDisabled || !latestInterpretation || hasUnsavedChanges}
              onClick={() => void approveDraft()}
            >
              {isApproving ? copy.approving : copy.approve}
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
            placeholder={isLoading ? copy.loadingPlaceholder : copy.placeholder}
            disabled={controlsDisabled && !draftText}
            onChange={(event) => {
              const nextText = event.currentTarget.value;
              if (
                manualSaveAttemptRef.current &&
                manualSaveAttemptRef.current.text !== nextText.trim()
              ) {
                manualSaveAttemptRef.current = null;
              }
              setDraftText(nextText);
            }}
          />
        </>
      )}
    </section>
  );
}

function shouldRetainChartAiDraftAttempt(error: unknown): boolean {
  if (!(error instanceof HttpError)) return true;
  const code = readChartAiErrorCode(error.body);
  if (code === "CHART_AI_DRAFT_IN_PROGRESS" || code === "CHART_AI_DRAFT_OUTCOME_UNKNOWN") {
    return true;
  }
  if (code) return false;
  return error.status === 409 || error.status === 503;
}

function readChartAiErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const code = (body as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

function getLatestInterpretation(
  interpretations: readonly CalculationInterpretationResponse[]
): CalculationInterpretationResponse | null {
  return interpretations.length ? (interpretations[interpretations.length - 1] ?? null) : null;
}

function getDisabledReason(input: {
  readonly copy: ChartEngineCopy["ai"];
  readonly calculationId: string | null;
  readonly isResultStale: boolean;
  readonly result: ChartResult | null;
  readonly unsupportedMethod: boolean;
}): string | null {
  if (!input.result) return input.copy.noResult;
  if (input.isResultStale) return input.copy.stale;
  if (!input.calculationId) return input.copy.saveCalculation;
  if (input.unsupportedMethod) {
    return input.copy.unsupported;
  }
  return null;
}

function getChartAiDraftErrorMessage(error: unknown, copy: ChartEngineCopy["ai"]): string {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return copy.conflict;
    }
    if (error.status === 422) {
      return copy.invalid;
    }
    if (error.status === 429) {
      return copy.limit;
    }
    if (error.status === 502) {
      return copy.malformed;
    }
    if (error.status === 503) {
      return copy.unavailable;
    }
  }
  return copy.generic;
}

function getManualSaveErrorMessage(error: unknown, copy: ChartEngineCopy["ai"]): string {
  if (!(error instanceof HttpError)) return copy.saveError;
  const code = readChartAiErrorCode(error.body);
  if (code === "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT") return copy.manualConflict;
  if (error.status === 409) return copy.resultChanged;
  if (error.status >= 500) return copy.storageUnavailable;
  return copy.saveError;
}
