import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse,
  NumerologyResult
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { MotionContent } from "@elevenhouse/design-system/motion";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { NumerologyResultPanel } from "../../features/numerology/components/NumerologyResultPanel";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import type { NumerologyFormState } from "../../features/numerology/model/numerologyFormModel";
import type { NumerologyParticipantFormState } from "../../features/numerology/model/numerologyFormModel";
import { toClientOptionFromNumerologyParticipant } from "../../features/numerology/model/numerologyCompatibilityFlowModel";
import { buildNumerologyPageViewModel } from "../../features/numerology/model/numerologyPageModel";
import {
  getActiveNumerologyCalculations,
  toSavedCalculationListItem,
  type NumerologyEditorState
} from "../../features/numerology/model/numerologySavedWorkspaceModel";
import { NumerologyArchiveDialog } from "./NumerologyArchiveDialog";
import { NumerologyCalculationEditor } from "./NumerologyCalculationEditor";
import { NumerologyCalculationMenu } from "./NumerologyCalculationMenu";
import { NumerologyPresentationDialog } from "./NumerologyPresentationDialog";
import { NumerologyYearPicker } from "./NumerologyYearPicker";
import styles from "./NumerologyPage.module.css";

export type NumerologyPageViewProps = {
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedResponse: NumerologyCalculationResponse | null;
  readonly previewResult: NumerologyResult | null;
  readonly formState: NumerologyFormState;
  readonly selectedYear: number;
  readonly isPeriodVisible: boolean;
  readonly isYearPickerOpen: boolean;
  readonly isPresentationOpen: boolean;
  readonly selectedDetailSelector: string | null;
  readonly interpretationText: string;
  readonly errorMessage: string | null;
  readonly periodErrorMessage: string | null;
  readonly aiDraftErrorMessage: string | null;
  readonly isBusy: boolean;
  readonly isPreviewPending: boolean;
  readonly isCreatingAiDraft: boolean;
  readonly editorState: NumerologyEditorState | null;
  readonly editorErrors: readonly string[];
  readonly archiveTarget: CalculationRecordResponse | null;
  readonly onSelectSubjectClient: (client: ClientSelectOption) => void;
  readonly onSelectPartnerClient: (client: ClientSelectOption) => void;
  readonly onSelectSaved: (calculation: CalculationRecordResponse) => void;
  readonly onOpenCreate: () => void;
  readonly onOpenRecalculate: () => void;
  readonly onEditorFormChange: (patch: Partial<NumerologyFormState>) => void;
  readonly onEditorParticipantChange: (
    participantKey: "subject" | "partner",
    patch: Partial<NumerologyParticipantFormState>
  ) => void;
  readonly onEditorSelectClient: (
    participantKey: "subject" | "partner",
    client: ClientSelectOption
  ) => void;
  readonly onSubmitEditor: () => void;
  readonly onCancelEditor: () => void;
  readonly onRequestArchive: () => void;
  readonly onCloseArchive: () => void;
  readonly onConfirmArchive: () => void;
  readonly onSelectDetail: (selector: string) => void;
  readonly onToggleYearPicker: () => void;
  readonly onApplyYear: (year: number) => void;
  readonly onHidePeriod: () => void;
  readonly onRetryPeriod: () => void;
  readonly onToggleCompatibilityMode: () => void;
  readonly onOpenPresentation: () => void;
  readonly onClosePresentation: () => void;
  readonly onLink: () => void;
  readonly onPublish: () => void;
  readonly onInterpretationChange: (value: string) => void;
  readonly onCreateAiDraft: () => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
};

export function NumerologyPageView({
  calculations,
  selectedResponse,
  previewResult,
  formState,
  selectedYear,
  isPeriodVisible,
  isYearPickerOpen,
  isPresentationOpen,
  selectedDetailSelector,
  interpretationText,
  errorMessage,
  periodErrorMessage,
  aiDraftErrorMessage,
  isBusy,
  isPreviewPending,
  isCreatingAiDraft,
  editorState,
  editorErrors,
  archiveTarget,
  onSelectSubjectClient,
  onSelectPartnerClient,
  onSelectSaved,
  onOpenCreate,
  onOpenRecalculate,
  onEditorFormChange,
  onEditorParticipantChange,
  onEditorSelectClient,
  onSubmitEditor,
  onCancelEditor,
  onRequestArchive,
  onCloseArchive,
  onConfirmArchive,
  onSelectDetail,
  onToggleYearPicker,
  onApplyYear,
  onHidePeriod,
  onRetryPeriod,
  onToggleCompatibilityMode,
  onOpenPresentation,
  onClosePresentation,
  onLink,
  onInterpretationChange,
  onCreateAiDraft,
  onSaveInterpretation,
  onApproveInterpretation
}: NumerologyPageViewProps) {
  const pageModel = buildNumerologyPageViewModel(
    selectedResponse,
    previewResult,
    formState,
    selectedDetailSelector,
    interpretationText,
    isBusy || Boolean(editorState)
  );
  const savedItems = getActiveNumerologyCalculations(calculations).map(toSavedCalculationListItem);
  const isCompatibilityMode = formState.mode === "compatibility";
  const selectedSubjectClient =
    pageModel.selectedSubjectClient ?? toClientOptionFromNumerologyParticipant(formState.subject);
  const selectedPartnerClient =
    pageModel.selectedPartnerClient ?? toClientOptionFromNumerologyParticipant(formState.partner);
  const subjectClientId = formState.subject.clientId || pageModel.subject?.clientId || "";
  const partnerClientId = formState.partner.clientId || pageModel.partner?.clientId || "";
  const workspaceTransitionKey = getNumerologyWorkspaceTransitionKey(
    selectedResponse,
    previewResult,
    formState
  );

  return (
    <section className={styles.page} aria-labelledby="numerology-title">
      <header className={styles.toolbar} role="toolbar" aria-label="Инструменты нумерологии">
        <div className={styles.titleGroup}>
          <span className={styles.iconBox}>#</span>
          <h1 className={styles.title} id="numerology-title">
            Нумерология
          </h1>
        </div>
        <NumerologyCalculationMenu
          items={savedItems}
          selectedCalculationId={selectedResponse?.calculation.id ?? null}
          disabled={isBusy}
          onSelect={onSelectSaved}
          onCreate={onOpenCreate}
          onRecalculate={onOpenRecalculate}
          onArchive={onRequestArchive}
        />
        <div className={styles.clientStrip}>
          <ClientSearchCombobox
            label="Клиент"
            value={subjectClientId}
            placeholder="Выбрать клиента"
            selectedClient={selectedSubjectClient}
            excludeClientIds={partnerClientId ? [partnerClientId] : []}
            disabled={pageModel.isClientSelectionDisabled}
            onSelect={onSelectSubjectClient}
          />
          {isCompatibilityMode ? (
            <>
              <span className={styles.clientPlus}>+</span>
              <ClientSearchCombobox
                label="Партнер"
                value={partnerClientId}
                placeholder="Выбрать партнера"
                selectedClient={selectedPartnerClient}
                excludeClientIds={subjectClientId ? [subjectClientId] : []}
                disabled={pageModel.isClientSelectionDisabled}
                onSelect={onSelectPartnerClient}
              />
            </>
          ) : null}
        </div>
        <div className={styles.toolbarSpacer} />
        <NumerologyYearPicker
          selectedYear={selectedYear}
          isOpen={isYearPickerOpen && !isCompatibilityMode}
          isPeriodVisible={isPeriodVisible}
          isPreviewPending={isPreviewPending}
          errorMessage={isCompatibilityMode ? null : periodErrorMessage}
          disabled={!pageModel.model || isCompatibilityMode}
          onToggle={onToggleYearPicker}
          onApply={onApplyYear}
          onHide={onHidePeriod}
          onRetry={onRetryPeriod}
        />
        <button
          type="button"
          className={isCompatibilityMode ? styles.toolButtonActive : styles.toolButton}
          aria-pressed={isCompatibilityMode}
          disabled={!pageModel.model}
          onClick={onToggleCompatibilityMode}
          title="Нумерологическая совместимость пары"
        >
          <Icon iconName="users" width={15} height={15} aria-hidden="true" />
          Совместимость
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled={!pageModel.model}
          onClick={onOpenPresentation}
          title="Полноэкранный показ для сессии"
        >
          <Icon iconName="arrowUpRight" width={15} height={15} aria-hidden="true" />
          Презентация
        </button>
        <button
          type="button"
          className={pageModel.isCalculationLinked ? styles.toolButtonLinked : styles.toolButton}
          disabled={pageModel.linkDisabled}
          onClick={onLink}
          title={pageModel.linkableClientId ? undefined : "Нужен CRM-участник"}
        >
          <Icon
            iconName={pageModel.isCalculationLinked ? "check" : "pin"}
            width={15}
            height={15}
            aria-hidden="true"
          />
          {pageModel.isCalculationLinked ? "Привязана" : "Привязать"}
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled
          title="PDF-экспорт подключим после backend export endpoint"
        >
          <Icon iconName="doc" width={15} height={15} aria-hidden="true" />
          PDF
        </button>
      </header>
      <div className={styles.body}>
        <main className={`${styles.workspace}${editorState ? ` ${styles.workspaceEditor}` : ""}`}>
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          <MotionContent className={styles.workspaceMotion} transitionKey={workspaceTransitionKey}>
            {editorState ? (
              <NumerologyCalculationEditor
                editor={editorState}
                errors={editorErrors}
                isBusy={isBusy}
                onFormChange={onEditorFormChange}
                onParticipantChange={onEditorParticipantChange}
                onSelectClient={onEditorSelectClient}
                onSubmit={onSubmitEditor}
                onCancel={onCancelEditor}
              />
            ) : pageModel.model ? (
              <div className={styles.workspaceGrid}>
                <NumerologyResultPanel
                  model={pageModel.model}
                  detail={pageModel.detail}
                  selectedSelector={pageModel.effectiveSelector}
                  isPeriodVisible={isPeriodVisible}
                  interpretationText={interpretationText}
                  isCreatingAiDraft={isCreatingAiDraft}
                  aiDraftErrorMessage={aiDraftErrorMessage}
                  isAiDraftDisabled={pageModel.isAiDraftDisabled}
                  aiDraftDisabledReason={pageModel.aiDraftDisabledReason}
                  isApproveInterpretationDisabled={pageModel.isApproveInterpretationDisabled}
                  isSaveInterpretationDisabled={pageModel.isSaveInterpretationDisabled}
                  onInterpretationChange={onInterpretationChange}
                  onCreateAiDraft={onCreateAiDraft}
                  onSaveInterpretation={onSaveInterpretation}
                  onApproveInterpretation={onApproveInterpretation}
                  onSelect={onSelectDetail}
                />
              </div>
            ) : (
              <section className={styles.emptyState} aria-label="Пустое состояние нумерологии">
                <span className={styles.emptyIcon}>#</span>
                <div className={styles.emptyCopy}>
                  <h2>Выберите клиента для нумерологии</h2>
                  <p>
                    Выберите клиента в панели выше, чтобы увидеть ключевые числа, психоматрицу и
                    трактовку.
                  </p>
                </div>
              </section>
            )}
          </MotionContent>
        </main>
      </div>
      {isPresentationOpen && pageModel.model ? (
        <NumerologyPresentationDialog
          model={pageModel.model}
          isPeriodVisible={isPeriodVisible}
          interpretationText={interpretationText}
          onClose={onClosePresentation}
        />
      ) : null}
      {archiveTarget ? (
        <NumerologyArchiveDialog
          calculationTitle={archiveTarget.title}
          isPending={isBusy}
          onConfirm={onConfirmArchive}
          onClose={onCloseArchive}
        />
      ) : null}
    </section>
  );
}

function getNumerologyWorkspaceTransitionKey(
  selectedResponse: NumerologyCalculationResponse | null,
  previewResult: NumerologyResult | null,
  formState: NumerologyFormState
): string {
  if (!selectedResponse) {
    return previewResult
      ? `${previewResult.mode}:${formState.subject.clientId}:${formState.partner.clientId}:preview`
      : `${formState.mode}:empty`;
  }

  return [
    selectedResponse.calculation.mode,
    selectedResponse.calculation.id,
    selectedResponse.calculation.resultChecksum
  ].join(":");
}
