import { useEffect, useState } from "react";
import type {
  FlowApproval,
  FlowApprovalDecision,
  FlowGraph,
  FlowRunResponse,
  SimulateFlowRunResponse,
  FlowResponse
} from "@elevenhouse/contracts";
import { moveFlowNode, renameFlowNode, updateFlowNodeConfig } from "../model/flowDraftEditor";
import { flowStatusLabelRu } from "../model/flowDisplay";
import { FlowApprovalQueue } from "./FlowApprovalQueue";
import { FlowBuilderCanvas } from "./FlowBuilderCanvas";
import { FlowBuilderInspector } from "./FlowBuilderInspector";
import { FlowRuntimePanel } from "./FlowRuntimePanel";

const paletteCategories = ["Триггеры", "Действия", "AI-узлы", "Логика", "Человек"] as const;

export type FlowBuilderProps = {
  readonly flow: FlowResponse;
  readonly onBack: () => void;
  readonly onUpdateDraft: (flowId: string, graph: FlowGraph) => void;
  readonly onPublish: (flowId: string, graph: FlowGraph) => void;
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
  readonly draftUpdateError?: Error | null;
  readonly publishError?: Error | null;
  readonly runtimeError?: Error | null;
  readonly approvalsError?: Error | null;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilder({
  flow,
  onBack,
  onUpdateDraft,
  onPublish,
  runs = [],
  approvals = [],
  simulation = null,
  onSimulate,
  onCreateManualRun,
  onApprovalDecision,
  isLoadingRuns = false,
  isLoadingApprovals = false,
  isUpdatingDraft = false,
  isPublishing = false,
  isSimulating = false,
  isCreatingManualRun = false,
  isDecidingApproval = false,
  draftUpdateError = null,
  publishError = null,
  runtimeError = null,
  approvalsError = null,
  classNames
}: FlowBuilderProps) {
  const [draftGraph, setDraftGraph] = useState(flow.draftGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(flow.draftGraph.nodes[0]?.id ?? null);
  const selectedNode = draftGraph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const canRunPublishedVersion = flow.publishedVersionId !== null;

  useEffect(() => {
    setDraftGraph(flow.draftGraph);
    setSelectedNodeId(flow.draftGraph.nodes[0]?.id ?? null);
  }, [flow.id, flow.draftGraph]);

  const updateDraft = (graph: FlowGraph) => {
    setDraftGraph(graph);
    onUpdateDraft(flow.id, graph);
  };

  return (
    <section className={classNames?.builderPage ?? ""} aria-label="Конструктор воронки">
      <header className={classNames?.builderHeader ?? ""}>
        <button className={classNames?.builderBackButton ?? ""} type="button" onClick={onBack}>
          Все воронки
        </button>
        <div className={classNames?.builderTitleGroup ?? ""}>
          <p>{flowStatusLabelRu[flow.status]}</p>
          <h1>{flow.name}</h1>
        </div>
        <div className={classNames?.builderActions ?? ""}>
          <button
            className={classNames?.builderTestRunButton ?? ""}
            type="button"
            disabled={!canRunPublishedVersion || !onSimulate || isSimulating}
            onClick={() => onSimulate?.(flow.id)}
          >
            {isSimulating ? "Проверяем" : "Тестовый прогон"}
          </button>
          <button
            className={classNames?.builderPublishButton ?? ""}
            type="button"
            disabled={isPublishing || isUpdatingDraft}
            onClick={() => onPublish(flow.id, draftGraph)}
          >
            {isPublishing ? "Публикуем" : "Опубликовать"}
          </button>
        </div>
      </header>
      {draftUpdateError ? (
        <div className={classNames?.builderMutationError ?? ""} role="alert">
          <span>{draftUpdateError.message}</span>
          <button type="button" onClick={() => onUpdateDraft(flow.id, draftGraph)}>Повторить сохранение</button>
        </div>
      ) : null}
      {publishError ? (
        <div className={classNames?.builderMutationError ?? ""} role="alert">
          <span>{publishError.message}</span>
          <button type="button" onClick={() => onPublish(flow.id, draftGraph)}>Повторить публикацию</button>
        </div>
      ) : null}
      <section className={classNames?.builder ?? ""}>
        <aside className={classNames?.builderPalette ?? ""} aria-label="Палитра узлов">
          <h2>Узлы</h2>
          <ul>
            {paletteCategories.map((category) => <li key={category}>{category}</li>)}
          </ul>
        </aside>
        <FlowBuilderCanvas
          graph={draftGraph}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onMoveNode={(nodeId, position) => updateDraft(moveFlowNode(draftGraph, nodeId, position))}
          classNames={classNames}
        />
        <aside className={classNames?.builderInspector ?? ""}>
          <FlowBuilderInspector
            selectedNode={selectedNode}
            onTitleChange={(nodeId, title) =>
              setDraftGraph((graph) => renameFlowNode(graph, nodeId, title))
            }
            onCommitTitle={(nodeId, title) => updateDraft(renameFlowNode(draftGraph, nodeId, title))}
            onUpdateConfig={(nodeId, config) => updateDraft(updateFlowNodeConfig(draftGraph, nodeId, config))}
            classNames={classNames}
          />
          <FlowRuntimePanel
            runs={runs}
            simulation={canRunPublishedVersion ? simulation : null}
            onSimulate={
              canRunPublishedVersion && onSimulate ? () => onSimulate(flow.id) : undefined
            }
            onCreateManualRun={
              canRunPublishedVersion && onCreateManualRun ? () => onCreateManualRun(flow.id) : undefined
            }
            isLoadingRuns={isLoadingRuns}
            isSimulating={isSimulating}
            isCreatingManualRun={isCreatingManualRun}
            error={canRunPublishedVersion ? runtimeError : null}
            unavailableReason={
              canRunPublishedVersion
                ? null
                : "Опубликуйте воронку, чтобы запускать тесты и ручные запуски."
            }
            classNames={classNames}
          />
          <FlowApprovalQueue
            approvals={approvals}
            onDecision={onApprovalDecision}
            isLoading={isLoadingApprovals}
            isDeciding={isDecidingApproval}
            error={approvalsError}
            classNames={classNames}
          />
        </aside>
      </section>
    </section>
  );
}
