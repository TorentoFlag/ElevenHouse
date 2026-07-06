import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { createPortal } from "react-dom";
import { SavedCalculationPicker } from "../../features/calculations/components/SavedCalculationPicker";
import {
  canLinkCalculation,
  canPublishCalculation,
  getFirstLinkableClientId,
  getLatestCalculationVersion,
  hasApprovedCurrentInterpretation,
  isCalculationLinked
} from "../../features/calculations/model/calculationStatus";
import { NumerologyResultPanel } from "../../features/numerology/components/NumerologyResultPanel";
import { NumerologySetupModal } from "../../features/numerology/components/NumerologySetupModal";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import type { NumerologyFormState } from "../../features/numerology/model/numerologyFormModel";
import {
  buildNumerologyWorkspaceModel,
  getNumerologyDetail
} from "../../features/numerology/model/numerologyWorkspaceModel";
import styles from "./NumerologyPage.module.css";

export type NumerologyPageViewProps = {
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedResponse: NumerologyCalculationResponse | null;
  readonly clientOptions: readonly ClientSelectOption[];
  readonly formState: NumerologyFormState;
  readonly isSetupOpen: boolean;
  readonly isYearMode: boolean;
  readonly isPresentationOpen: boolean;
  readonly selectedDetailSelector: string | null;
  readonly interpretationText: string;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly onOpenSetup: () => void;
  readonly onCloseSetup: () => void;
  readonly onFormChange: (state: NumerologyFormState) => void;
  readonly onCreate: () => void;
  readonly onRecalculate: () => void;
  readonly onSelectSaved: (calculation: CalculationRecordResponse) => void;
  readonly onSelectDetail: (selector: string) => void;
  readonly onToggleYearMode: () => void;
  readonly onToggleCompatibilityMode: () => void;
  readonly onOpenPresentation: () => void;
  readonly onClosePresentation: () => void;
  readonly onLink: () => void;
  readonly onPublish: () => void;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
};

export function NumerologyPageView({
  calculations,
  selectedResponse,
  clientOptions,
  formState,
  isSetupOpen,
  isYearMode,
  isPresentationOpen,
  selectedDetailSelector,
  interpretationText,
  errorMessage,
  isBusy,
  onOpenSetup,
  onCloseSetup,
  onFormChange,
  onCreate,
  onRecalculate,
  onSelectSaved,
  onSelectDetail,
  onToggleYearMode,
  onToggleCompatibilityMode,
  onOpenPresentation,
  onClosePresentation,
  onLink,
  onPublish,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: NumerologyPageViewProps) {
  const calculation = selectedResponse?.calculation ?? null;
  const latestVersion = calculation ? getLatestCalculationVersion(calculation) : null;
  const linkableClientId = getFirstLinkableClientId(calculation);
  const linkDisabled =
    !canLinkCalculation(calculation) || isCalculationLinked(calculation) || isBusy;
  const publishDisabled = !canPublishCalculation(calculation) || isBusy;
  const model = buildNumerologyWorkspaceModel(selectedResponse);
  const effectiveSelector = selectedDetailSelector ?? model?.defaultSelector ?? null;
  const detail = getNumerologyDetail(model, effectiveSelector);
  const isCompatibility = model?.mode === "compatibility";
  const subject = model?.subject;
  const partner = model?.partner;

  return (
    <section className={styles.page} aria-labelledby="numerology-title">
      <header className={styles.toolbar} role="toolbar" aria-label="Инструменты нумерологии">
        <div className={styles.titleGroup}>
          <span className={styles.iconBox}>#</span>
          <h1 className={styles.title} id="numerology-title">
            Нумерология
          </h1>
        </div>
        <div className={styles.clientStrip}>
          <span className={styles.clientKicker}>Клиент</span>
          <button type="button" className={styles.clientButton} onClick={onOpenSetup}>
            <span>{subject?.initials ?? "К"}</span>
            <strong>{subject?.displayName ?? "Выбрать клиента"}</strong>
            <small>{subject?.birthDate ?? "дата рождения"}</small>
          </button>
          {isCompatibility ? (
            <>
              <span className={styles.clientPlus}>+</span>
              <button type="button" className={styles.clientButton} onClick={onOpenSetup}>
                <span>{partner?.initials ?? "П"}</span>
                <strong>{partner?.displayName ?? "Выбрать партнера"}</strong>
                <small>{partner?.birthDate ?? "дата рождения"}</small>
              </button>
            </>
          ) : null}
        </div>
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          className={isYearMode ? styles.toolButtonActive : styles.toolButton}
          disabled={!model || isCompatibility}
          onClick={onToggleYearMode}
          title="Личные год и месяцы"
        >
          Год
        </button>
        <button
          type="button"
          className={isCompatibility ? styles.toolButtonActive : styles.toolButton}
          disabled={!model}
          onClick={onToggleCompatibilityMode}
          title="Нумерологическая совместимость пары"
        >
          Совместимость
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled={!model || isCompatibility}
          onClick={onOpenPresentation}
          title="Полноэкранный показ для сессии"
        >
          Презентация
        </button>
        <button
          type="button"
          className={isCalculationLinked(calculation) ? styles.toolButtonLinked : styles.toolButton}
          disabled={linkDisabled}
          onClick={onLink}
          title={linkableClientId ? undefined : "Нужен CRM-участник"}
        >
          {isCalculationLinked(calculation) ? "Привязана" : "Привязать"}
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled={!model}
          onClick={onRecalculate}
        >
          Пересчитать
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled
          title="PDF-экспорт подключим после backend export endpoint"
        >
          PDF
        </button>
      </header>
      <div className={styles.historyBar}>
        <SavedCalculationPicker
          calculations={calculations}
          selectedCalculationId={calculation?.id ?? null}
          onSelect={onSelectSaved}
        />
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
        <button type="button" className="eh-button eh-button--secondary" onClick={onOpenSetup}>
          Данные расчета
        </button>
      </div>
      <div className={styles.body}>
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
          <div className={styles.workspaceGrid}>
            <NumerologyResultPanel
              model={model}
              detail={detail}
              selectedSelector={effectiveSelector}
              isYearMode={isYearMode}
              interpretationText={interpretationText}
              isBusy={isBusy}
              onInterpretationChange={onInterpretationChange}
              onSaveInterpretation={onSaveInterpretation}
              onApproveInterpretation={onApproveInterpretation}
              onSelect={onSelectDetail}
            />
          </div>
        </main>
      </div>
      {isSetupOpen ? (
        <NumerologySetupModal
          state={formState}
          clientOptions={clientOptions}
          isSubmitting={isBusy}
          onChange={onFormChange}
          onClose={onCloseSetup}
          onSubmit={onCreate}
        />
      ) : null}
      {isPresentationOpen && model ? (
        <NumerologyPresentation model={model} onClose={onClosePresentation} />
      ) : null}
    </section>
  );
}

function NumerologyPresentation({
  model,
  onClose
}: {
  readonly model: NonNullable<ReturnType<typeof buildNumerologyWorkspaceModel>>;
  readonly onClose: () => void;
}) {
  return createPortal(
    <div
      className={styles.presentationOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Презентация нумерологии"
    >
      <div className={styles.presentationHeader}>
        <div>
          <strong>{model.subject?.displayName ?? model.title}</strong>
          <span>{model.subject?.birthDate ?? model.versionLabel}</span>
        </div>
        <button type="button" className="eh-button eh-button--secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
      <div className={styles.presentationBody}>
        <div className={styles.presentationNumbers}>
          {model.keyNumbers.slice(0, 4).map((item) => (
            <span key={item.code}>
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </span>
          ))}
        </div>
        {model.matrix ? (
          <div className={styles.presentationMatrix}>
            {model.matrix.cells.map((cell) => (
              <span key={cell.digit}>
                <strong>{cell.value || "—"}</strong>
                <small>{cell.label}</small>
              </span>
            ))}
          </div>
        ) : null}
        {model.strengthLines.length > 0 ? (
          <div className={styles.presentationLines}>
            {model.strengthLines.map((line) => (
              <span key={line.code}>
                {line.label}: <strong>{line.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
