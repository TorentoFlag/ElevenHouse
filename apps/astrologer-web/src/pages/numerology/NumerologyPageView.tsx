import type { CalculationRecordResponse, NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { SavedCalculationPicker } from "../../features/calculations/components/SavedCalculationPicker";
import {
  canLinkCalculation,
  canPublishCalculation,
  getFirstLinkableClientId,
  getLatestCalculationVersion,
  hasApprovedCurrentInterpretation,
  isCalculationLinked
} from "../../features/calculations/model/calculationStatus";
import { NumerologyAiDraftPanel } from "../../features/numerology/components/NumerologyAiDraftPanel";
import { NumerologyResultPanel } from "../../features/numerology/components/NumerologyResultPanel";
import { NumerologySetupModal } from "../../features/numerology/components/NumerologySetupModal";
import type { NumerologyFormState } from "../../features/numerology/model/numerologyFormModel";
import styles from "./NumerologyPage.module.css";

export type NumerologyPageViewProps = {
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedResponse: NumerologyCalculationResponse | null;
  readonly formState: NumerologyFormState;
  readonly isSetupOpen: boolean;
  readonly interpretationText: string;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly onOpenSetup: () => void;
  readonly onCloseSetup: () => void;
  readonly onFormChange: (state: NumerologyFormState) => void;
  readonly onCreate: () => void;
  readonly onRecalculate: () => void;
  readonly onSelectSaved: (calculation: CalculationRecordResponse) => void;
  readonly onLink: () => void;
  readonly onPublish: () => void;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
};

export function NumerologyPageView({
  calculations,
  selectedResponse,
  formState,
  isSetupOpen,
  interpretationText,
  errorMessage,
  isBusy,
  onOpenSetup,
  onCloseSetup,
  onFormChange,
  onCreate,
  onRecalculate,
  onSelectSaved,
  onLink,
  onPublish,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: NumerologyPageViewProps) {
  const calculation = selectedResponse?.calculation ?? null;
  const latestVersion = calculation ? getLatestCalculationVersion(calculation) : null;
  const linkableClientId = getFirstLinkableClientId(calculation);
  const linkDisabled = !canLinkCalculation(calculation) || isCalculationLinked(calculation) || isBusy;
  const publishDisabled = !canPublishCalculation(calculation) || isBusy;

  return (
    <section className={styles.page} aria-labelledby="numerology-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.iconBox}>9</span>
          <h1 className={styles.title} id="numerology-title">
            Нумерология
          </h1>
        </div>
        <div className={styles.toolbarSpacer} />
        <button type="button" className="eh-button eh-button--secondary" onClick={onOpenSetup}>
          Новый расчет
        </button>
        <button
          type="button"
          className="eh-button eh-button--ghost"
          disabled={!selectedResponse || isBusy}
          onClick={onRecalculate}
        >
          Пересчитать
        </button>
        <button
          type="button"
          className="eh-button eh-button--ghost"
          disabled={linkDisabled}
          onClick={onLink}
          title={linkableClientId ? undefined : "Нужен CRM-участник"}
        >
          Привязать
        </button>
        <button
          type="button"
          className="eh-button eh-button--primary"
          disabled={publishDisabled}
          onClick={onPublish}
          title={
            hasApprovedCurrentInterpretation(calculation)
              ? undefined
              : "Нужна утвержденная трактовка"
          }
        >
          Опубликовать
        </button>
      </header>
      <div className={styles.body}>
        <SavedCalculationPicker
          calculations={calculations}
          selectedCalculationId={calculation?.id ?? null}
          onSelect={onSelectSaved}
        />
        <main className={styles.workspace}>
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          <div className={styles.statusBar}>
            <span className={styles.statusBadge}>
              {calculation ? calculation.status : "нет расчета"}
            </span>
            {latestVersion ? (
              <span className={styles.statusBadge}>версия {latestVersion.versionNumber}</span>
            ) : null}
            {calculation?.mode === "compatibility" ? (
              <span className={styles.statusBadge}>совместимость</span>
            ) : null}
          </div>
          <NumerologyResultPanel response={selectedResponse} />
        </main>
        <div className={styles.sidePanel}>
          <NumerologyAiDraftPanel
            response={selectedResponse}
            text={interpretationText}
            isSaving={isBusy}
            isApproving={isBusy}
            onTextChange={onInterpretationChange}
            onSave={onSaveInterpretation}
            onApprove={onApproveInterpretation}
          />
        </div>
      </div>
      {isSetupOpen ? (
        <NumerologySetupModal
          state={formState}
          isSubmitting={isBusy}
          onChange={onFormChange}
          onClose={onCloseSetup}
          onSubmit={onCreate}
        />
      ) : null}
    </section>
  );
}
