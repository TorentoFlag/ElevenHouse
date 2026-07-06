import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { NumerologyResultPanel } from "../../features/numerology/components/NumerologyResultPanel";
import { NumerologySetupModal } from "../../features/numerology/components/NumerologySetupModal";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import type { NumerologyFormState } from "../../features/numerology/model/numerologyFormModel";
import { buildNumerologyPageViewModel } from "../../features/numerology/model/numerologyPageModel";
import { NumerologyPresentation } from "./NumerologyPresentation";
import styles from "./NumerologyPage.module.css";

export type NumerologyPageViewProps = {
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedResponse: NumerologyCalculationResponse | null;
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
  readonly onSelectSubjectClient: (client: ClientSelectOption) => void;
  readonly onSelectPartnerClient: (client: ClientSelectOption) => void;
  readonly onCreate: () => void;
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
  selectedResponse,
  formState,
  isSetupOpen,
  isYearMode,
  isPresentationOpen,
  selectedDetailSelector,
  interpretationText,
  errorMessage,
  isBusy,
  onCloseSetup,
  onFormChange,
  onSelectSubjectClient,
  onSelectPartnerClient,
  onCreate,
  onSelectDetail,
  onToggleYearMode,
  onToggleCompatibilityMode,
  onOpenPresentation,
  onClosePresentation,
  onLink,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: NumerologyPageViewProps) {
  const pageModel = buildNumerologyPageViewModel(selectedResponse, selectedDetailSelector, isBusy);

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
          <ClientSearchCombobox
            label="Клиент"
            value={pageModel.subject?.clientId ?? ""}
            placeholder="Выбрать клиента"
            selectedClient={pageModel.selectedSubjectClient}
            excludeClientIds={pageModel.partner?.clientId ? [pageModel.partner.clientId] : []}
            disabled={pageModel.isClientSelectionDisabled}
            onSelect={onSelectSubjectClient}
          />
          {pageModel.isCompatibility ? (
            <>
              <span className={styles.clientPlus}>+</span>
              <ClientSearchCombobox
                label="Партнер"
                value={pageModel.partner?.clientId ?? ""}
                placeholder="Выбрать партнера"
                selectedClient={pageModel.selectedPartnerClient}
                excludeClientIds={pageModel.subject?.clientId ? [pageModel.subject.clientId] : []}
                disabled={pageModel.isClientSelectionDisabled}
                onSelect={onSelectPartnerClient}
              />
            </>
          ) : null}
        </div>
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          className={isYearMode ? styles.toolButtonActive : styles.toolButton}
          disabled={!pageModel.model || pageModel.isCompatibility}
          onClick={onToggleYearMode}
          title="Личные год и месяцы"
        >
          <Icon iconName="clock" width={15} height={15} aria-hidden="true" />
          Год
        </button>
        <button
          type="button"
          className={pageModel.isCompatibility ? styles.toolButtonActive : styles.toolButton}
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
          disabled={!pageModel.model || pageModel.isCompatibility}
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
        <main className={styles.workspace}>
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          <div className={styles.workspaceGrid}>
            <NumerologyResultPanel
              model={pageModel.model}
              detail={pageModel.detail}
              selectedSelector={pageModel.effectiveSelector}
              isYearMode={isYearMode}
              interpretationText={interpretationText}
              isBusy={isBusy}
              isApproveInterpretationDisabled={pageModel.isApproveInterpretationDisabled}
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
          isSubmitting={isBusy}
          onChange={onFormChange}
          onClose={onCloseSetup}
          onSubmit={onCreate}
        />
      ) : null}
      {isPresentationOpen && pageModel.model ? (
        <NumerologyPresentation model={pageModel.model} onClose={onClosePresentation} />
      ) : null}
    </section>
  );
}
