import type { FlowGraphV2, FlowPresentationV1, FlowSourceHandleV2 } from "@elevenhouse/contracts";
import { flowNodeKindLabel, flowSourceHandleLabel } from "../model/flowDisplay";
import { getRequiredSourceHandles } from "../model/flowDraftEditor";

export type FlowConnectionSource = {
  readonly nodeId: string;
  readonly handle: FlowSourceHandleV2;
};

export type FlowBuilderCanvasProps = {
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1;
  readonly locale: "ru" | "en";
  readonly editable: boolean;
  readonly selectedNodeId: string | null;
  readonly connectionSource: FlowConnectionSource | null;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onSelectSourceHandle: (nodeId: string, handle: FlowSourceHandleV2) => void;
  readonly onMoveNode: (
    nodeId: string,
    position: { readonly x: number; readonly y: number }
  ) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilderCanvas({
  graph,
  presentation,
  locale,
  editable,
  selectedNodeId,
  connectionSource,
  onSelectNode,
  onSelectSourceHandle,
  onMoveNode,
  classNames
}: FlowBuilderCanvasProps) {
  const selectedNodeIndex = graph.nodes.findIndex((node) => node.id === selectedNodeId);
  const selectedNode = selectedNodeIndex >= 0 ? graph.nodes[selectedNodeIndex] : null;
  const selectedPosition = selectedNode
    ? nodePosition(presentation, selectedNode.id, selectedNodeIndex)
    : null;
  const copy = canvasCopy[locale];
  const positionedNodes = graph.nodes.map((node, index) => ({
    node,
    position: nodePosition(presentation, node.id, index)
  }));
  const positionsByNodeId = new Map(
    positionedNodes.map(({ node, position }) => [node.id, position] as const)
  );
  const canvasWidth = Math.max(
    880,
    ...positionedNodes.map(({ position }) => position.x + nodeWidth + 80)
  );
  const canvasHeight = Math.max(
    620,
    ...positionedNodes.map(({ position }) => position.y + nodeHeight + 80)
  );

  return (
    <section className={classNames?.builderCanvas ?? ""} aria-label={copy.canvas}>
      {editable && selectedNode && selectedPosition ? (
        <div className={classNames?.builderCanvasControls ?? ""}>
          <button
            type="button"
            onClick={() =>
              onMoveNode(selectedNode.id, {
                x: selectedPosition.x + 40,
                y: selectedPosition.y
              })
            }
            aria-label={`${copy.moveRight}: ${selectedNode.displayTitle}`}
          >
            {copy.moveRight}
          </button>
        </div>
      ) : null}
      <div className={classNames?.builderEdges ?? ""} aria-label={copy.edges}>
        {graph.edges.map((edge) => {
          const source = graph.nodes.find((node) => node.id === edge.sourceNodeId);
          const target = graph.nodes.find((node) => node.id === edge.targetNodeId);
          return source && target ? (
            <span key={edge.id}>
              {source.displayTitle} — {flowSourceHandleLabel(edge.sourceHandle, locale)} →{" "}
              {target.displayTitle}
            </span>
          ) : null;
        })}
      </div>
      <div
        className={classNames?.builderNodeGrid ?? ""}
        style={{ minWidth: canvasWidth, minHeight: canvasHeight }}
      >
        <svg
          className={classNames?.builderEdgeLayer ?? ""}
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          width={canvasWidth}
          height={canvasHeight}
          aria-hidden="true"
        >
          {graph.edges.map((edge) => {
            const source = positionsByNodeId.get(edge.sourceNodeId);
            const target = positionsByNodeId.get(edge.targetNodeId);
            return source && target ? (
              <path
                key={edge.id}
                className={classNames?.builderEdgePath ?? ""}
                data-flow-edge-id={edge.id}
                data-source-handle={edge.sourceHandle}
                d={edgePath(source, target)}
              />
            ) : null;
          })}
        </svg>
        {positionedNodes.map(({ node, position }) => {
          const occupiedHandles = new Set(
            graph.edges
              .filter((edge) => edge.sourceNodeId === node.id)
              .map((edge) => edge.sourceHandle)
          );

          return (
            <article
              key={node.id}
              className={classNames?.builderNode ?? ""}
              style={{ left: position.x, top: position.y }}
              data-selected={selectedNodeId === node.id ? "true" : undefined}
            >
              <button
                className={classNames?.builderNodeSelect ?? ""}
                type="button"
                aria-label={`${copy.selectNode}: ${node.displayTitle}`}
                onClick={() => onSelectNode(node.id)}
              >
                <span>{flowNodeKindLabel(node.kind, locale)}</span>
                <strong>{node.displayTitle}</strong>
              </button>
              {getRequiredSourceHandles(node).length > 0 ? (
                <div className={classNames?.builderNodeHandles ?? ""}>
                  {getRequiredSourceHandles(node).map((handle) => {
                    const occupied = occupiedHandles.has(handle);
                    const selected =
                      connectionSource?.nodeId === node.id && connectionSource.handle === handle;
                    const label = flowSourceHandleLabel(handle, locale);
                    return (
                      <button
                        key={handle}
                        type="button"
                        data-selected={selected ? "true" : undefined}
                        aria-label={
                          occupied
                            ? `${copy.occupied}: ${node.displayTitle}, ${label}`
                            : `${copy.continueFrom} ${node.displayTitle}: ${label}`
                        }
                        disabled={!editable || occupied}
                        onClick={() => onSelectSourceHandle(node.id, handle)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const nodeWidth = 210;
const nodeHeight = 112;

function edgePath(
  source: { readonly x: number; readonly y: number },
  target: { readonly x: number; readonly y: number }
): string {
  const startX = source.x + nodeWidth;
  const startY = source.y + nodeHeight / 2;
  const endX = target.x;
  const endY = target.y + nodeHeight / 2;
  const direction = endX >= startX ? 1 : -1;
  const controlDistance = Math.max(40, Math.abs(endX - startX) / 2);
  const firstControlX = startX + controlDistance * direction;
  const secondControlX = endX - controlDistance * direction;

  return `M ${startX} ${startY} C ${firstControlX} ${startY} ${secondControlX} ${endY} ${endX} ${endY}`;
}

function nodePosition(
  presentation: FlowPresentationV1,
  nodeId: string,
  index: number
): { readonly x: number; readonly y: number } {
  return (
    presentation.nodes.find((node) => node.nodeId === nodeId)?.position ?? {
      x: 80 + index * 320,
      y: 120
    }
  );
}

const canvasCopy = {
  ru: {
    canvas: "Схема воронки",
    edges: "Связи воронки",
    moveRight: "Сместить вправо",
    selectNode: "Выбрать узел",
    continueFrom: "Продолжить из",
    occupied: "Связь занята"
  },
  en: {
    canvas: "Flow graph",
    edges: "Flow connections",
    moveRight: "Move right",
    selectNode: "Select node",
    continueFrom: "Continue from",
    occupied: "Connection occupied"
  }
} as const;
