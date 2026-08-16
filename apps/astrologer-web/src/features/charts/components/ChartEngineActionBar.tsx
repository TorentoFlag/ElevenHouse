import type { ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartEnginePage.module.css";

export function ChartEngineActionBar({
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
  onPresentation,
  onToggleBirthDataEditor,
  onToggleSettings,
  presentationDisabled,
  pdfDisabled,
  pdfErrorMessage,
  pdfLabel,
  pdfTitle,
  showCalculate = true,
  showUtilities = true
}: {
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
  readonly onPresentation?: () => void;
  readonly onToggleBirthDataEditor: () => void;
  readonly onToggleSettings: () => void;
  readonly presentationDisabled: boolean;
  readonly pdfDisabled: boolean;
  readonly pdfErrorMessage: string | null;
  readonly pdfLabel: string;
  readonly pdfTitle: string;
  readonly showCalculate?: boolean;
  readonly showUtilities?: boolean;
}) {
  const pdfReason = getPdfDisabledReason({
    pdfErrorMessage,
    pdfTitle
  });
  const isPdfDisabled = pdfDisabled;
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
        <>
          <button
            aria-describedby={presentationDisabled ? "chart-export-disabled-reason" : undefined}
            aria-label={copy.actionBar.exportLabel}
            className={styles.toolButton}
            type="button"
            disabled={presentationDisabled}
            title={presentationDisabled ? undefined : copy.actionBar.exportTitle}
            onClick={onPresentation}
          >
            ↗
          </button>
          {presentationDisabled ? (
            <span className={styles.visuallyHidden} id="chart-export-disabled-reason">
              {copy.actionBar.exportUnavailable}
            </span>
          ) : null}
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
      ) : null}
    </>
  );
}

function getPdfDisabledReason({
  pdfErrorMessage,
  pdfTitle
}: {
  readonly pdfErrorMessage: string | null;
  readonly pdfTitle: string;
}): string {
  return pdfErrorMessage ?? pdfTitle;
}
