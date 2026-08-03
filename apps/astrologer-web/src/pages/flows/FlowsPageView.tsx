import type {
  FlowDefinitionDetailV2,
  FlowDefinitionSummaryV2,
  FlowDefinitionMigrationIssue,
  FlowDefinitionTemplateDescriptorV2,
  FlowDefinitionValidationIssue,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";
import type {
  CurrentFlowDefinitionDetail,
  FlowDraftCommandPayload,
  FlowNextDraftCommandPayload,
  FlowPublishCommandPayload,
  FlowRevisionConflict
} from "../../features/flows/ui/FlowBuilder";
import { FlowBuilder } from "../../features/flows/ui/FlowBuilder";
import { FlowCreateDialog } from "../../features/flows/ui/FlowCreateDialog";
import { FlowGallery } from "../../features/flows/ui/FlowGallery";
import { FlowLegacyMigrationPanel } from "../../features/flows/ui/FlowLegacyMigrationPanel";
import { FlowsMobileList } from "../../features/flows/ui/FlowsMobileList";
import styles from "./FlowsPage.module.css";

export type FlowsPageViewProps = {
  readonly locale: "ru" | "en";
  readonly flows: readonly FlowDefinitionSummaryV2[];
  readonly templates: readonly FlowDefinitionTemplateDescriptorV2[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly listError?: Error | null;
  readonly templateError?: Error | null;
  readonly templatesLoading?: boolean;
  readonly onRetryList?: () => void;
  readonly onRetryTemplates?: () => void;
  readonly selectedFlowId?: string | null;
  readonly selectedFlow?: FlowDefinitionDetailV2 | null;
  readonly isLoadingSelectedFlow?: boolean;
  readonly selectedFlowError?: Error | null;
  readonly createDialogOpen?: boolean;
  readonly requestedTemplateKey?: string | null;
  readonly onRequestCreate?: () => void;
  readonly onCloseCreate?: () => void;
  readonly onCreateTemplate?: (template: FlowDefinitionTemplateDescriptorV2) => void;
  readonly onCreateBlank?: () => void;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onCloseBuilder?: () => void;
  readonly onReloadSelectedFlow?: () => Promise<CurrentFlowDefinitionDetail | null>;
  readonly onSaveDraft?: (input: FlowDraftCommandPayload) => void;
  readonly onPublish?: (input: FlowPublishCommandPayload) => void;
  readonly onCreateNextDraft?: (input: FlowNextDraftCommandPayload) => void;
  readonly onMigrate?: (flowId: string, expectedRevision: number) => void;
  readonly onExportLegacyFlow?: (
    flow: Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v1" }>
  ) => void;
  readonly onAutomationToggle?: (flowId: string, activate: boolean) => void;
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onSimulate?: (flowId: string) => void;
  readonly isCreating?: boolean;
  readonly isSaving?: boolean;
  readonly isPublishing?: boolean;
  readonly isCreatingNextDraft?: boolean;
  readonly isMigrating?: boolean;
  readonly isTogglingAutomation?: boolean;
  readonly isSimulating?: boolean;
  readonly isValidating?: boolean;
  readonly createError?: Error | null;
  readonly saveError?: Error | null;
  readonly publishError?: Error | null;
  readonly nextDraftError?: Error | null;
  readonly migrationError?: Error | null;
  readonly migrationIssues?: readonly FlowDefinitionMigrationIssue[];
  readonly revisionConflict?: FlowRevisionConflict | null;
  readonly validationIssues?: readonly FlowDefinitionValidationIssue[];
  readonly validationError?: Error | null;
};

export function FlowsPageView({
  locale,
  flows,
  templates,
  isLoading,
  isError,
  listError = null,
  templateError = null,
  templatesLoading = false,
  onRetryList,
  onRetryTemplates,
  selectedFlowId = null,
  selectedFlow = null,
  isLoadingSelectedFlow = false,
  selectedFlowError = null,
  createDialogOpen = false,
  requestedTemplateKey = null,
  onRequestCreate,
  onCloseCreate,
  onCreateTemplate,
  onCreateBlank,
  onOpenFlow,
  onCloseBuilder,
  onReloadSelectedFlow,
  onSaveDraft,
  onPublish,
  onCreateNextDraft,
  onMigrate,
  onExportLegacyFlow,
  onAutomationToggle,
  runtimeAvailability = null,
  onSimulate,
  isCreating = false,
  isSaving = false,
  isPublishing = false,
  isCreatingNextDraft = false,
  isMigrating = false,
  isTogglingAutomation = false,
  isSimulating = false,
  isValidating = false,
  createError = null,
  saveError = null,
  publishError = null,
  nextDraftError = null,
  migrationError = null,
  migrationIssues = [],
  revisionConflict = null,
  validationIssues = [],
  validationError = null
}: FlowsPageViewProps) {
  const copy = pageCopy[locale];

  if (selectedFlowId) {
    if (isLoadingSelectedFlow) {
      return <p className={styles.state}>{copy.loadingFlow}</p>;
    }
    if (selectedFlowError || !selectedFlow) {
      return (
        <section className={styles.page}>
          <p className={styles.error} role="alert">
            {selectedFlowError?.message ?? copy.loadFlowFailed}
          </p>
          <button className={styles.createButton} type="button" onClick={onCloseBuilder}>
            {copy.back}
          </button>
        </section>
      );
    }
    if (selectedFlow.graphSchemaVersion === "flow-graph.v1") {
      return (
        <FlowLegacyMigrationPanel
          flow={selectedFlow}
          locale={locale}
          onBack={onCloseBuilder ?? (() => undefined)}
          onMigrate={onMigrate ?? (() => undefined)}
          onExport={onExportLegacyFlow}
          pending={isMigrating}
          error={migrationError}
          issues={migrationIssues}
          classNames={styles}
        />
      );
    }
    if (!onSaveDraft || !onPublish) {
      return (
        <p className={styles.error} role="alert">
          {copy.builderUnavailable}
        </p>
      );
    }
    return (
      <FlowBuilder
        flow={selectedFlow}
        locale={locale}
        onBack={onCloseBuilder ?? (() => undefined)}
        onSaveDraft={onSaveDraft}
        onPublish={onPublish}
        onCreateNextDraft={onCreateNextDraft}
        runtimeAvailability={runtimeAvailability}
        onSimulate={onSimulate}
        isSaving={isSaving}
        isPublishing={isPublishing}
        isCreatingNextDraft={isCreatingNextDraft}
        isSimulating={isSimulating}
        isValidating={isValidating}
        saveError={saveError}
        publishError={publishError}
        nextDraftError={nextDraftError}
        revisionConflict={revisionConflict}
        onReloadServer={onReloadSelectedFlow}
        validationIssues={validationIssues}
        validationError={validationError}
        classNames={styles}
      />
    );
  }

  return (
    <section className={styles.page} aria-labelledby="flows-title">
      {isLoading ? <p className={styles.state}>{copy.loading}</p> : null}
      {!isLoading && isError ? (
        <div className={styles.retryState} role="alert">
          <p className={styles.error}>{listError?.message ?? copy.loadFailed}</p>
          {onRetryList ? (
            <button className={styles.retryButton} type="button" onClick={onRetryList}>
              {copy.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      {!isLoading && !isError ? (
        <>
          {flows.length === 0 ? <p className={styles.state}>{copy.empty}</p> : null}
          {createError ? (
            <p className={styles.error} role="alert">
              {createError.message}
            </p>
          ) : null}
          <FlowGallery
            flows={flows}
            locale={locale}
            runtimeAvailability={runtimeAvailability}
            onCreateFlow={onRequestCreate}
            isCreating={isCreating}
            onOpenFlow={onOpenFlow}
            onAutomationToggle={onAutomationToggle}
            isTogglingAutomation={isTogglingAutomation}
            classNames={styles}
          />
          <FlowsMobileList
            flows={flows}
            locale={locale}
            runtimeAvailability={runtimeAvailability}
            onCreateFlow={onRequestCreate}
            isCreating={isCreating}
            onOpenFlow={onOpenFlow}
            onAutomationToggle={onAutomationToggle}
            isTogglingAutomation={isTogglingAutomation}
            classNames={styles}
          />
          <FlowCreateDialog
            templates={templates}
            locale={locale}
            open={createDialogOpen}
            pending={isCreating}
            loading={templatesLoading}
            error={templateError}
            requestedTemplateKey={requestedTemplateKey}
            onClose={onCloseCreate ?? (() => undefined)}
            onCreateTemplate={onCreateTemplate ?? (() => undefined)}
            onCreateBlank={onCreateBlank ?? (() => undefined)}
            onRetry={onRetryTemplates}
            classNames={styles}
          />
        </>
      ) : null}
    </section>
  );
}

const pageCopy = {
  ru: {
    loading: "Загружаем воронки",
    loadFailed: "Не удалось загрузить воронки",
    empty: "Создайте первую воронку из готового сценария или с нуля.",
    loadingFlow: "Загружаем схему",
    loadFlowFailed: "Не удалось загрузить схему",
    back: "Все воронки",
    builderUnavailable: "Конструктор этой схемы недоступен.",
    retry: "Повторить загрузку"
  },
  en: {
    loading: "Loading flows",
    loadFailed: "Could not load flows",
    empty: "Create your first flow from an available template or from blank.",
    loadingFlow: "Loading graph",
    loadFlowFailed: "Could not load graph",
    back: "All flows",
    builderUnavailable: "The builder is unavailable for this graph.",
    retry: "Retry loading"
  }
} as const;
