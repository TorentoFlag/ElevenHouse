import type {
  FlowApproval,
  FlowApprovalDecision,
  FlowGraph,
  FlowResponse,
  FlowRunResponse,
  FlowTemplate,
  SimulateFlowRunResponse
} from "@elevenhouse/contracts";
import { FlowBuilder } from "../../features/flows/ui/FlowBuilder";
import { FlowGallery } from "../../features/flows/ui/FlowGallery";
import { FlowsMobileList } from "../../features/flows/ui/FlowsMobileList";
import styles from "./FlowsPage.module.css";

export type FlowsPageViewProps = {
  readonly flows: readonly FlowResponse[];
  readonly templates: readonly FlowTemplate[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly selectedFlow?: FlowResponse | null;
  readonly selectedFlowId?: string | null;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onCreateFlow?: () => void;
  readonly onAutomationToggle?: (flowId: string, activate: boolean) => void;
  readonly onCloseBuilder?: () => void;
  readonly onUpdateDraft?: (flowId: string, graph: FlowGraph) => void;
  readonly onPublish?: (flowId: string, graph: FlowGraph) => void;
  readonly runs?: readonly FlowRunResponse[];
  readonly approvals?: readonly FlowApproval[];
  readonly simulation?: SimulateFlowRunResponse | null;
  readonly onSimulate?: (flowId: string) => void;
  readonly onCreateManualRun?: (flowId: string) => void;
  readonly onApprovalDecision?: (approvalId: string, decision: FlowApprovalDecision) => void;
  readonly isLoadingRuns?: boolean;
  readonly isLoadingApprovals?: boolean;
  readonly isUpdatingDraft?: boolean;
  readonly isPublishing?: boolean;
  readonly isSimulating?: boolean;
  readonly isCreatingManualRun?: boolean;
  readonly isDecidingApproval?: boolean;
  readonly isCreating?: boolean;
  readonly isTogglingAutomation?: boolean;
  readonly createError?: Error | null;
  readonly draftUpdateError?: Error | null;
  readonly publishError?: Error | null;
  readonly runtimeError?: Error | null;
  readonly approvalsError?: Error | null;
};

export function FlowsPageView({
  flows,
  templates,
  isLoading,
  isError,
  selectedFlow: selectedFlowFromMutation = null,
  selectedFlowId = null,
  onCreateFlow,
  onOpenFlow,
  onAutomationToggle,
  onCloseBuilder,
  onUpdateDraft,
  onPublish,
  runs = [],
  approvals = [],
  simulation = null,
  onSimulate,
  onCreateManualRun,
  onApprovalDecision,
  isLoadingRuns,
  isLoadingApprovals,
  isUpdatingDraft,
  isPublishing,
  isSimulating,
  isCreatingManualRun,
  isDecidingApproval,
  isCreating,
  isTogglingAutomation,
  createError = null,
  draftUpdateError = null,
  publishError = null,
  runtimeError = null,
  approvalsError = null
}: FlowsPageViewProps) {
  const selectedFlow = selectedFlowFromMutation ?? flows.find((flow) => flow.id === selectedFlowId) ?? null;

  if (selectedFlow && onCloseBuilder && onUpdateDraft && onPublish) {
    return (
      <FlowBuilder
        flow={selectedFlow}
        onBack={onCloseBuilder}
        onUpdateDraft={onUpdateDraft}
        onPublish={onPublish}
        runs={runs}
        approvals={approvals}
        simulation={simulation}
        onSimulate={onSimulate}
        onCreateManualRun={onCreateManualRun}
        onApprovalDecision={onApprovalDecision}
        isLoadingRuns={isLoadingRuns}
        isLoadingApprovals={isLoadingApprovals}
        isUpdatingDraft={isUpdatingDraft}
        isPublishing={isPublishing}
        isSimulating={isSimulating}
        isCreatingManualRun={isCreatingManualRun}
        isDecidingApproval={isDecidingApproval}
        draftUpdateError={draftUpdateError}
        publishError={publishError}
        runtimeError={runtimeError}
        approvalsError={approvalsError}
        classNames={styles}
      />
    );
  }

  return (
    <section className={styles.page} aria-labelledby="flows-title">
      {isLoading ? <p className={styles.state}>Загружаем воронки</p> : null}
      {!isLoading && isError ? <p className={styles.error} role="alert">Не удалось загрузить воронки</p> : null}
      {!isLoading && !isError && flows.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.state}>Создайте первую воронку</p>
          <button className={styles.createButton} type="button" onClick={onCreateFlow} disabled={!onCreateFlow || isCreating}>
            Новая воронка
          </button>
          {createError ? <p className={styles.error} role="alert">{createError.message}</p> : null}
        </div>
      ) : null}
      {!isLoading && !isError && flows.length > 0 ? (
        <>
          {createError ? <p className={styles.error} role="alert">{createError.message}</p> : null}
          <FlowGallery
            flows={flows}
            templates={templates}
            onCreateFlow={onCreateFlow}
            isCreating={isCreating}
            onOpenFlow={onOpenFlow}
            onAutomationToggle={onAutomationToggle}
            isTogglingAutomation={isTogglingAutomation}
            classNames={styles}
          />
          <FlowsMobileList
            flows={flows}
            onOpenFlow={onOpenFlow}
            onAutomationToggle={onAutomationToggle}
            isTogglingAutomation={isTogglingAutomation}
            classNames={styles}
          />
        </>
      ) : null}
    </section>
  );
}
