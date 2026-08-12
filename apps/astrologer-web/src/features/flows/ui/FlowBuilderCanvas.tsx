import { useRef } from "react";
import type { FlowGraphV2, FlowPresentationV1, FlowSourceHandleV2 } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useFlowCanvasInteraction } from "../model/useFlowCanvasInteraction";
import { flowSourceHandleLabel } from "../model/flowDisplay";
import { getRequiredSourceHandles } from "../model/flowDraftEditor";
import { getFlowNodeVisual } from "./flowsVisualModel";

export type FlowConnectionSource = {
  readonly nodeId: string;
  readonly handle: FlowSourceHandleV2;
};

export type FlowBuilderCanvasProps = {
  readonly flowId?: string;
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
  readonly onChangeViewport?: (viewport: FlowPresentationV1["viewport"]) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilderCanvas({
  flowId,
  graph,
  presentation,
  locale,
  editable,
  selectedNodeId,
  connectionSource,
  onSelectNode,
  onSelectSourceHandle,
  onMoveNode,
  onChangeViewport,
  classNames
}: FlowBuilderCanvasProps) {
  const canvasRef = useRef<HTMLElement>(null);
  const copy = canvasCopy[locale];
  const {
    viewport,
    draggedNodePosition,
    beginPan,
    beginNodeDrag,
    moveInteraction,
    completeInteraction,
    cancelPointerInteraction,
    cancelLostPointerCapture,
    zoomAtCanvasCenter,
    fitViewport
  } = useFlowCanvasInteraction({
    canvasRef,
    flowId,
    presentation,
    editable,
    onChangeViewport,
    onMoveNode,
    onSelectNode
  });
  const positionedNodes = graph.nodes.map((node, index) => ({
    node,
    position:
      draggedNodePosition?.nodeId === node.id
        ? draggedNodePosition.position
        : nodePosition(presentation, node.id, index)
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
  const gridSize = Math.round(24 * viewport.zoom * 100) / 100;
  const bounds = graphBounds(positionedNodes.map(({ position }) => position));

  return (
    <section
      ref={canvasRef}
      className={classNames?.builderCanvas ?? ""}
      aria-label={copy.canvas}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`
      }}
      onPointerDown={beginPan}
      onPointerMove={moveInteraction}
      onPointerUp={completeInteraction}
      onPointerCancel={cancelPointerInteraction}
      onLostPointerCapture={cancelLostPointerCapture}
    >
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
        className={classNames?.builderCanvasViewport ?? ""}
        data-testid="flow-canvas-viewport"
        style={{ transform: viewportTransform(viewport) }}
      >
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
            const visual = getFlowNodeVisual(node.kind, locale);

            return (
              <article
                key={node.id}
                className={classNames?.builderNode ?? ""}
                style={{ left: position.x, top: position.y }}
                data-flow-node
                data-selected={selectedNodeId === node.id ? "true" : undefined}
                data-tone={visual.tone}
                onPointerDown={(event) => beginNodeDrag(event, node.id, position)}
              >
                <button
                  className={classNames?.builderNodeSelect ?? ""}
                  type="button"
                  aria-label={`${copy.selectNode}: ${node.displayTitle}`}
                  onClick={() => onSelectNode(node.id)}
                >
                  <span>{visual.label}</span>
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
                          onPointerDown={(event) => event.stopPropagation()}
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
      </div>
      <div
        className={classNames?.builderCanvasControls ?? ""}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={copy.zoomOut}
          onClick={() => zoomAtCanvasCenter(1 / 1.2, { x: canvasWidth / 2, y: canvasHeight / 2 })}
        >
          −
        </button>
        <span data-flow-canvas-zoom aria-label={copy.zoomLevel}>
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label={copy.zoomIn}
          onClick={() => zoomAtCanvasCenter(1.2, { x: canvasWidth / 2, y: canvasHeight / 2 })}
        >
          <Icon iconName="plus" width={16} height={16} aria-hidden="true" />
        </button>
        <span aria-hidden="true" />
        <button type="button" aria-label={copy.fitLabel} onClick={() => fitViewport(bounds)}>
          {copy.fit}
        </button>
      </div>
    </section>
  );
}

const nodeWidth = 264;
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
  const controlDistance = Math.max(46, Math.abs(endX - startX) * 0.45);
  return `M ${startX} ${startY} C ${startX + controlDistance * direction} ${startY} ${endX - controlDistance * direction} ${endY} ${endX} ${endY}`;
}

function graphBounds(positions: readonly { readonly x: number; readonly y: number }[]) {
  const left = Math.min(...positions.map((position) => position.x));
  const top = Math.min(...positions.map((position) => position.y));
  const right = Math.max(...positions.map((position) => position.x + nodeWidth));
  const bottom = Math.max(...positions.map((position) => position.y + nodeHeight));
  return { x: left, y: top, width: right - left, height: bottom - top };
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

function viewportTransform(viewport: FlowPresentationV1["viewport"]): string {
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
}

const canvasCopy = {
  ru: {
    canvas: "Схема воронки",
    edges: "Связи воронки",
    zoomOut: "Уменьшить масштаб",
    zoomIn: "Увеличить масштаб",
    zoomLevel: "Масштаб схемы",
    fit: "Уместить",
    fitLabel: "Уместить схему",
    selectNode: "Выбрать узел",
    continueFrom: "Продолжить из",
    occupied: "Связь занята"
  },
  en: {
    canvas: "Flow graph",
    edges: "Flow connections",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    zoomLevel: "Graph zoom level",
    fit: "Fit",
    fitLabel: "Fit graph",
    selectNode: "Select node",
    continueFrom: "Continue from",
    occupied: "Connection occupied"
  }
} as const;
