import { useEffect, useRef, useState } from "react";
import type {
  FlowApproval,
  FlowApprovalDecision,
  FlowGraph,
  FlowNode,
  FlowRunResponse,
  FlowRuntimeAvailability,
  SimulateFlowRunResponse,
  FlowResponse
} from "@elevenhouse/contracts";
import {
  appendFlowNodeFromPalette,
  moveFlowNode,
  renameFlowNode,
  updateFlowNodeConfig,
  type FlowPaletteNodeId
} from "../model/flowDraftEditor";
import { flowStatusLabelRu } from "../model/flowDisplay";
import { buildFlowRuntimePresentation } from "../model/flowRuntimePresentation";
import { FlowApprovalQueue } from "./FlowApprovalQueue";
import { FlowBuilderCanvas } from "./FlowBuilderCanvas";
import { FlowBuilderInspector } from "./FlowBuilderInspector";
import { FlowNodePalette } from "./FlowNodePalette";
import { FlowRuntimePanel } from "./FlowRuntimePanel";

export type FlowBuilderProps = {
  readonly flow: FlowResponse;
  readonly onBack: () => void;
  readonly onUpdateDraft: (flowId: string, graph: FlowGraph) => void;
  readonly onPublish: (flowId: string, graph: FlowGraph) => void;
  readonly runs?: readonly FlowRunResponse[];
  readonly approvals?: readonly FlowApproval[];
  readonly simulation?: SimulateFlowRunResponse | null;
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly approvalRuntimeAvailability?: FlowRuntimeAvailability | null;
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
  runtimeAvailability = null,
  approvalRuntimeAvailability = null,
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
  const currentFlowId = useRef(flow.id);
  const selectedNode = draftGraph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const hasPublishedVersion = flow.publishedVersionId !== null;
  const runtime = buildFlowRuntimePresentation(runtimeAvailability);
  const canRunPublishedVersion = hasPublishedVersion && runtime.executionAvailable;
  const canPublishDraft = flow.status === "draft";

  useEffect(() => {
    const isSameFlow = currentFlowId.current === flow.id;

    currentFlowId.current = flow.id;
    setDraftGraph(flow.draftGraph);
    setSelectedNodeId((currentSelectedNodeId) => {
      if (
        isSameFlow &&
        currentSelectedNodeId &&
        flow.draftGraph.nodes.some((node) => node.id === currentSelectedNodeId)
      ) {
        return currentSelectedNodeId;
      }

      return flow.draftGraph.nodes[0]?.id ?? null;
    });
  }, [flow.id, flow.draftGraph]);

  const updateDraft = (graph: FlowGraph) => {
    setDraftGraph(graph);
    onUpdateDraft(flow.id, graph);
  };
  const addPaletteNode = (paletteNodeId: FlowPaletteNodeId) => {
    const updated = appendFlowNodeFromPalette(draftGraph, { selectedNodeId, paletteNodeId });
    const addedNode = findAddedNode(draftGraph.nodes, updated.nodes);

    setDraftGraph(updated);
    setSelectedNodeId(addedNode?.id ?? null);
    onUpdateDraft(flow.id, updated);
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
            onClick={() => {
              if (canRunPublishedVersion) onSimulate?.(flow.id);
            }}
          >
            {isSimulating ? "Проверяем" : "Тестовый прогон"}
          </button>
          <button
            className={classNames?.builderPublishButton ?? ""}
            type="button"
            disabled={!canPublishDraft || isPublishing || isUpdatingDraft}
            onClick={() => onPublish(flow.id, draftGraph)}
          >
            {isPublishing ? "Публикуем" : canPublishDraft ? "Опубликовать" : "Опубликована"}
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
        <FlowNodePalette
          onAddNode={addPaletteNode}
          isDisabled={!canPublishDraft || isUpdatingDraft}
          classNames={classNames}
        />
        <FlowBuilderCanvas
          graph={draftGraph}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onMoveNode={(nodeId, position) => updateDraft(moveFlowNode(draftGraph, nodeId, position))}
          classNames={classNames}
        />
        <aside className={classNames?.builderInspector ?? ""}>
          <FlowBuilderInspector
            graph={draftGraph}
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
            runtimeAvailability={runtimeAvailability}
            onSimulate={
              hasPublishedVersion && onSimulate ? () => onSimulate(flow.id) : undefined
            }
            onCreateManualRun={
              hasPublishedVersion && onCreateManualRun ? () => onCreateManualRun(flow.id) : undefined
            }
            isLoadingRuns={isLoadingRuns}
            isSimulating={isSimulating}
            isCreatingManualRun={isCreatingManualRun}
            error={hasPublishedVersion ? runtimeError : null}
            unavailableReason={
              hasPublishedVersion
                ? null
                : "Опубликуйте воронку, чтобы запускать тесты и ручные запуски."
            }
            classNames={classNames}
          />
          <FlowApprovalQueue
            approvals={approvals}
            runtimeAvailability={approvalRuntimeAvailability}
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

function findAddedNode(previousNodes: readonly FlowNode[], nextNodes: readonly FlowNode[]): FlowNode | null {
  return nextNodes.find((node) => !previousNodes.some((previousNode) => previousNode.id === node.id)) ?? null;
}
