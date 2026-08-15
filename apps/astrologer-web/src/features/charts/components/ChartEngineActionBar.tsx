import type { ChartEngineCopy } from "../model/chartEngineCopy";
import type { ChartEngineMode } from "../model/chartEngineMode";
import styles from "./ChartEnginePage.module.css";

export function ChartEngineActionBar({
  activeMode,
  birthDataEditorAvailable,
  calculateLabel,
  canCalculate,
  copy,
  isBirthDataEditorOpen,
  isCalculationLinked,
  isSettingsPanelOpen,
  linkDisabled,
  onCalculate,
  onLink,
  onPdf,
  onToggleBirthDataEditor,
  onToggleSettings,
  pdfDisabled,
  pdfErrorMessage,
  pdfLabel,
  pdfTitle,
  compactUtilities = false,
  showCalculate = true,
  showUtilities = true
}: {
  readonly activeMode: ChartEngineMode;
  readonly birthDataEditorAvailable: boolean;
  readonly calculateLabel: string;
  readonly canCalculate: boolean;
  readonly copy: ChartEngineCopy;
  readonly isBirthDataEditorOpen: boolean;
  readonly isCalculationLinked: boolean;
  readonly isSettingsPanelOpen: boolean;
  readonly linkDisabled: boolean;
  readonly onCalculate: () => void;
  readonly onLink?: () => void | Promise<void>;
  readonly onPdf?: () => void | Promise<void>;
  readonly onToggleBirthDataEditor: () => void;
  readonly onToggleSettings: () => void;
  readonly pdfDisabled: boolean;
  readonly pdfErrorMessage: string | null;
  readonly pdfLabel: string;
  readonly pdfTitle: string;
  readonly compactUtilities?: boolean;
  readonly showCalculate?: boolean;
  readonly showUtilities?: boolean;
}) {
  const pdfReason = getPdfDisabledReason({
    activeMode,
    copy,
    pdfErrorMessage,
    pdfTitle
  });
  const isPdfDisabled = activeMode !== "natal" || pdfDisabled;
  const isLinkDisabled = isCalculationLinked || linkDisabled;

  return (
    <>
      {showCalculate ? (
        <button
          className={styles.calculateButton}
          type="button"
          disabled={!canCalculate}
          onClick={onCalculate}
        >
          <span aria-hidden="true">⚡</span>
          {calculateLabel}
        </button>
      ) : null}
      {showUtilities ? (
        compactUtilities ? (
          <>
            <button
              aria-describedby="chart-export-disabled-reason"
              aria-label={copy.actionBar.exportLabel}
              className={styles.toolButton}
              type="button"
              disabled
            >
              ↗
            </button>
            <span className={styles.visuallyHidden} id="chart-export-disabled-reason">
              {copy.actionBar.exportUnavailable}
            </span>
            <button
              aria-label={copy.actionBar.settings}
              aria-pressed={isSettingsPanelOpen}
              className={isSettingsPanelOpen ? styles.toolButtonActive : styles.toolButton}
              type="button"
              onClick={onToggleSettings}
            >
              <span aria-hidden="true">☼</span>
            </button>
          </>
        ) : (
          <>
            <button
              aria-describedby="chart-export-disabled-reason"
              aria-label={copy.actionBar.exportLabel}
              className={styles.toolButton}
              type="button"
              disabled
            >
              ↗
            </button>
            <span className={styles.visuallyHidden} id="chart-export-disabled-reason">
              {copy.actionBar.exportUnavailable}
            </span>
            <button
              aria-describedby={
                isLinkDisabled && !isCalculationLinked ? "chart-link-disabled-reason" : undefined
              }
              className={styles.toolButton}
              type="button"
              disabled={isLinkDisabled}
              onClick={() => void onLink?.()}
            >
              {isCalculationLinked ? copy.actionBar.linked : copy.actionBar.link}
            </button>
            {isLinkDisabled && !isCalculationLinked ? (
              <span className={styles.visuallyHidden} id="chart-link-disabled-reason">
                {copy.actionBar.linkUnavailable}
              </span>
            ) : null}
            <button
              aria-describedby={isPdfDisabled ? "chart-pdf-disabled-reason" : undefined}
              className={styles.toolButton}
              type="button"
              disabled={isPdfDisabled}
              title={isPdfDisabled ? undefined : pdfTitle}
              onClick={() => void onPdf?.()}
            >
              {pdfLabel}
            </button>
            {isPdfDisabled ? (
              <span className={styles.visuallyHidden} id="chart-pdf-disabled-reason">
                {pdfReason}
              </span>
            ) : null}
            {birthDataEditorAvailable ? (
              <button
                aria-pressed={isBirthDataEditorOpen}
                className={isBirthDataEditorOpen ? styles.toolButtonActive : styles.toolButton}
                type="button"
                onClick={onToggleBirthDataEditor}
              >
                {copy.actionBar.birthData}
              </button>
            ) : null}
            <button
              aria-pressed={isSettingsPanelOpen}
              className={isSettingsPanelOpen ? styles.toolButtonActive : styles.toolButton}
              type="button"
              onClick={onToggleSettings}
            >
              <span aria-hidden="true">☼</span>
              {copy.actionBar.settings}
            </button>
          </>
        )
      ) : null}
    </>
  );
}

function getPdfDisabledReason({
  activeMode,
  copy,
  pdfErrorMessage,
  pdfTitle
}: {
  readonly activeMode: ChartEngineMode;
  readonly copy: ChartEngineCopy;
  readonly pdfErrorMessage: string | null;
  readonly pdfTitle: string;
}): string {
  if (activeMode === "child_chart") return copy.actionBar.childPdfUnavailable;
  if (activeMode === "horary") return copy.actionBar.horaryPdfUnavailable;
  if (activeMode !== "natal") return copy.actionBar.methodPdfUnavailable;
  return pdfErrorMessage ?? pdfTitle;
}
