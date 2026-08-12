import type {
  FlowDefinitionDetail,
  FlowDefinitionSummary,
  FlowDefinitionTemplateDescriptorV2,
  FlowDefinitionValidationIssue,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";
import type { ProductResponse } from "@elevenhouse/contracts";
import type { ReactNode } from "react";
import type { FlowDefinitionGalleryTab } from "../../features/flows/model/flowDisplay";
import type {
  CurrentFlowDefinitionDetail,
  FlowDraftCommandPayload,
  FlowNextDraftCommandPayload,
  FlowPublishCommandPayload,
  FlowRevisionConflict
} from "../../features/flows/ui/FlowBuilder";
import { FlowBuilder } from "../../features/flows/ui/FlowBuilder";
import { FlowCreateDialog } from "../../features/flows/ui/FlowCreateDialog";
import { FlowGallery, type FlowDefinitionLifecycleAction } from "../../features/flows/ui/FlowGallery";
import { FlowsMobileList } from "../../features/flows/ui/FlowsMobileList";
import styles from "./FlowsPage.module.css";

export type FlowsPageViewProps = {
  readonly locale: "ru" | "en";
  readonly flows: readonly FlowDefinitionSummary[];
  readonly totalFlowCount?: number;
  readonly activeFlowFilter?: FlowDefinitionGalleryTab;
  readonly flowSearch?: string;
  readonly emptyMessage?: string;
  readonly onFlowFilterChange?: (filter: FlowDefinitionGalleryTab) => void;
  readonly onFlowSearchChange?: (search: string) => void;
  readonly templates: readonly FlowDefinitionTemplateDescriptorV2[];
  readonly products?: readonly ProductResponse[];
  readonly creationAllowed?: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly templateError?: Error | null;
  readonly templatesLoading?: boolean;
  readonly onRetryList?: () => void;
  readonly onRetryTemplates?: () => void;
  readonly selectedFlowId?: string | null;
  readonly selectedFlow?: FlowDefinitionDetail | null;
  readonly isLoadingSelectedFlow?: boolean;
  readonly selectedFlowError?: Error | null;
  readonly createDialogOpen?: boolean;
  readonly requestedTemplateKey?: string | null;
  readonly onRequestCreate?: () => void;
  readonly onCloseCreate?: () => void;
  readonly onCreateTemplate?: (
    template: FlowDefinitionTemplateDescriptorV2,
    parameters: Record<string, string[]>
  ) => void;
  readonly onCreateBlank?: () => void;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onCloseBuilder?: () => void;
  readonly onReloadSelectedFlow?: () => Promise<CurrentFlowDefinitionDetail | null>;
  readonly onSaveDraft?: (input: FlowDraftCommandPayload) => void;
  readonly onPublish?: (input: FlowPublishCommandPayload) => void;
  readonly onCreateNextDraft?: (input: FlowNextDraftCommandPayload) => void;
  readonly onAutomationAction?: (
    flowId: string,
    action: "review_activation" | "pause_enrollment"
  ) => void;
  readonly onLifecycleAction?: (flowId: string, action: FlowDefinitionLifecycleAction) => void;
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onCreateManualRun?: (flowId: string) => void;
  readonly isCreating?: boolean;
  readonly isSaving?: boolean;
  readonly isPublishing?: boolean;
  readonly isCreatingNextDraft?: boolean;
  readonly isTogglingAutomation?: boolean;
  readonly isLifecycleActionPending?: boolean;
  readonly isCreatingManualRun?: boolean;
  readonly isValidating?: boolean;
  readonly createError?: Error | null;
  readonly saveError?: Error | null;
  readonly publishError?: Error | null;
  readonly nextDraftError?: Error | null;
  readonly revisionConflict?: FlowRevisionConflict | null;
  readonly validationIssues?: readonly FlowDefinitionValidationIssue[];
  readonly validationError?: Error | null;
  readonly runHistory?: ReactNode;
  readonly approvalQueue?: ReactNode;
  readonly workItemQueue?: ReactNode;
};

export function FlowsPageView({
  locale,
  flows,
  totalFlowCount = flows.length,
  activeFlowFilter = "all",
  flowSearch = "",
  emptyMessage,
  onFlowFilterChange,
  onFlowSearchChange,
  templates,
  products = [],
  creationAllowed = false,
  isLoading,
  isError,
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
  onAutomationAction,
  onLifecycleAction,
  runtimeAvailability = null,
  onCreateManualRun,
  isCreating = false,
  isSaving = false,
  isPublishing = false,
  isCreatingNextDraft = false,
  isTogglingAutomation = false,
  isLifecycleActionPending = false,
  isCreatingManualRun = false,
  isValidating = false,
  createError = null,
  saveError = null,
  publishError = null,
  nextDraftError = null,
  revisionConflict = null,
  validationIssues = [],
  validationError = null,
  runHistory = null,
  approvalQueue = null,
  workItemQueue = null
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
        onCreateManualRun={onCreateManualRun}
        isSaving={isSaving}
        isPublishing={isPublishing}
        isCreatingNextDraft={isCreatingNextDraft}
        isCreatingManualRun={isCreatingManualRun}
        isValidating={isValidating}
        saveError={saveError}
        publishError={publishError}
        nextDraftError={nextDraftError}
        revisionConflict={revisionConflict}
        onReloadServer={onReloadSelectedFlow}
        validationIssues={validationIssues}
        validationError={validationError}
        runHistory={runHistory}
        classNames={styles}
      />
    );
  }

  return (
    <section className={styles.page} aria-labelledby="flows-title">
      {approvalQueue}
      {workItemQueue}
      {isLoading ? <p className={styles.state}>{copy.loading}</p> : null}
      {!isLoading && isError ? (
        <div className={styles.retryState} role="alert">
          <p className={styles.error}>{copy.loadFailed}</p>
          {onRetryList ? (
            <button className={styles.retryButton} type="button" onClick={onRetryList}>
              {copy.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      {!isLoading && !isError ? (
        <>
          {createError ? (
            <p className={styles.error} role="alert">
              {createError.message}
            </p>
          ) : null}
          <FlowListToolbar
            locale={locale}
            totalFlowCount={totalFlowCount}
            visibleFlowCount={flows.length}
            activeFilter={activeFlowFilter}
            search={flowSearch}
            onFilterChange={onFlowFilterChange}
            onSearchChange={onFlowSearchChange}
          />
          <FlowGallery
            flows={flows}
            locale={locale}
            onCreateFlow={onRequestCreate}
            isCreating={isCreating}
            emptyMessage={flows.length === 0 ? (emptyMessage ?? copy.empty) : undefined}
            onOpenFlow={onOpenFlow}
            onAutomationAction={onAutomationAction}
            onLifecycleAction={onLifecycleAction}
            isTogglingAutomation={isTogglingAutomation}
            isLifecycleActionPending={isLifecycleActionPending}
            classNames={styles}
          />
          <FlowsMobileList
            flows={flows}
            locale={locale}
            onCreateFlow={onRequestCreate}
            isCreating={isCreating}
            emptyMessage={flows.length === 0 ? (emptyMessage ?? copy.empty) : undefined}
            onOpenFlow={onOpenFlow}
            onAutomationAction={onAutomationAction}
            onLifecycleAction={onLifecycleAction}
            isTogglingAutomation={isTogglingAutomation}
            isLifecycleActionPending={isLifecycleActionPending}
            classNames={styles}
          />
          <FlowCreateDialog
            templates={templates}
            products={products}
            creationAllowed={creationAllowed}
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

function FlowListToolbar({
  locale,
  totalFlowCount,
  visibleFlowCount,
  activeFilter,
  search,
  onFilterChange,
  onSearchChange
}: {
  readonly locale: "ru" | "en";
  readonly totalFlowCount: number;
  readonly visibleFlowCount: number;
  readonly activeFilter: FlowDefinitionGalleryTab;
  readonly search: string;
  readonly onFilterChange?: (filter: FlowDefinitionGalleryTab) => void;
  readonly onSearchChange?: (search: string) => void;
}) {
  const copy = toolbarCopy[locale];
  return (
    <div className={styles.listToolbar} aria-label={copy.toolbarLabel}>
      <label className={styles.searchField}>
        <span>{copy.searchLabel}</span>
        <input
          type="search"
          value={search}
          aria-label={copy.searchLabel}
          placeholder={copy.searchPlaceholder}
          onChange={(event) => onSearchChange?.(event.currentTarget.value)}
        />
      </label>
      <div className={styles.filterTabs} role="group" aria-label={copy.filtersLabel}>
        {flowFilterTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={styles.filterTab}
            aria-pressed={activeFilter === tab}
            onClick={() => onFilterChange?.(tab)}
          >
            {copy.tabs[tab]}
          </button>
        ))}
      </div>
      <p className={styles.filterSummary} aria-live="polite">
        {copy.summary(visibleFlowCount, totalFlowCount)}
      </p>
    </div>
  );
}

const flowFilterTabs: readonly FlowDefinitionGalleryTab[] = [
  "all",
  "active",
  "disabled",
  "draft",
  "archived"
];

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

const toolbarCopy = {
  ru: {
    toolbarLabel: "Фильтры списка воронок",
    filtersLabel: "Статус воронки",
    searchLabel: "Поиск по названию воронки",
    searchPlaceholder: "Найти воронку",
    tabs: {
      all: "Все",
      active: "Активные",
      disabled: "Отключенные",
      draft: "Черновики",
      archived: "Архив"
    },
    summary: (visible: number, total: number) => `Показано ${visible} из ${total}`
  },
  en: {
    toolbarLabel: "Flow list filters",
    filtersLabel: "Flow status",
    searchLabel: "Search by flow name",
    searchPlaceholder: "Find a flow",
    tabs: {
      all: "All",
      active: "Active",
      disabled: "Disabled",
      draft: "Drafts",
      archived: "Archived"
    },
    summary: (visible: number, total: number) => `Showing ${visible} of ${total}`
  }
} as const;
