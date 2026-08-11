import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { FlowGraphV2, FlowPresentationV1, FlowSourceHandleV2 } from "@elevenhouse/contracts";
import {
  fitFlowCanvasViewport,
  panFlowCanvasViewport,
  zoomFlowCanvasAtPoint
} from "../model/flowCanvasViewport";
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
  readonly onChangeViewport?: (viewport: FlowPresentationV1["viewport"]) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

type CanvasInteraction =
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly startClient: CanvasPoint;
      readonly startViewport: FlowPresentationV1["viewport"];
    }
  | {
      readonly kind: "node";
      readonly pointerId: number;
      readonly nodeId: string;
      readonly startClient: CanvasPoint;
      readonly startPosition: CanvasPoint;
      readonly startViewport: FlowPresentationV1["viewport"];
    };

type CanvasPoint = { readonly x: number; readonly y: number };

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
  onChangeViewport,
  classNames
}: FlowBuilderCanvasProps) {
  const canvasRef = useRef<HTMLElement>(null);
  const viewportRef = useRef(presentation.viewport);
  const interactionRef = useRef<CanvasInteraction | null>(null);
  const wheelCompletionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport, setViewport] = useState(presentation.viewport);
  const [draggedNodePosition, setDraggedNodePosition] = useState<{
    readonly nodeId: string;
    readonly position: CanvasPoint;
  } | null>(null);
  const copy = canvasCopy[locale];

  useEffect(() => {
    viewportRef.current = presentation.viewport;
    setViewport(presentation.viewport);
    setDraggedNodePosition(null);
  }, [presentation]);

  useEffect(
    () => () => {
      if (wheelCompletionTimer.current !== null) clearTimeout(wheelCompletionTimer.current);
    },
    []
  );

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
  const gridSize = Math.round(13.2 * viewport.zoom * 100) / 100;

  const updateViewport = (nextViewport: FlowPresentationV1["viewport"]) => {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  };

  const persistViewport = () => {
    if (editable) onChangeViewport?.(viewportRef.current);
  };

  const completeWheelViewport = () => {
    if (wheelCompletionTimer.current !== null) clearTimeout(wheelCompletionTimer.current);
    wheelCompletionTimer.current = setTimeout(() => {
      wheelCompletionTimer.current = null;
      persistViewport();
    }, 160);
  };

  const zoomAtCanvasCenter = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const point = rect
      ? { x: rect.width / 2, y: rect.height / 2 }
      : { x: canvasWidth / 2, y: canvasHeight / 2 };
    updateViewport(
      zoomFlowCanvasAtPoint(viewportRef.current, viewportRef.current.zoom * factor, point)
    );
    persistViewport();
  };

  const fitGraph = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const bounds = graphBounds(positionedNodes.map(({ position }) => position));
    updateViewport(
      fitFlowCanvasViewport({
        container: { width: rect.width, height: rect.height },
        bounds,
        padding: 80
      })
    );
    persistViewport();
  };

  const beginPan = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("[data-flow-node], button")) return;
    interactionRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClient: pointerPosition(event),
      startViewport: viewportRef.current
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const beginNodeDrag = (
    event: PointerEvent<HTMLElement>,
    nodeId: string,
    position: CanvasPoint
  ) => {
    if (!editable || event.button !== 0) return;
    event.stopPropagation();
    onSelectNode(nodeId);
    interactionRef.current = {
      kind: "node",
      pointerId: event.pointerId,
      nodeId,
      startClient: pointerPosition(event),
      startPosition: position,
      startViewport: viewportRef.current
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const delta = subtractPoints(pointerPosition(event), interaction.startClient);

    if (interaction.kind === "pan") {
      updateViewport(panFlowCanvasViewport(interaction.startViewport, delta));
      return;
    }

    setDraggedNodePosition({
      nodeId: interaction.nodeId,
      position: {
        x: interaction.startPosition.x + delta.x / interaction.startViewport.zoom,
        y: interaction.startPosition.y + delta.y / interaction.startViewport.zoom
      }
    });
  };

  const completeInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (interaction.kind === "pan") {
      persistViewport();
      return;
    }

    if (!editable) return;
    const delta = subtractPoints(pointerPosition(event), interaction.startClient);
    onMoveNode(interaction.nodeId, {
      x: interaction.startPosition.x + delta.x / interaction.startViewport.zoom,
      y: interaction.startPosition.y + delta.y / interaction.startViewport.zoom
    });
  };

  const cancelInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setDraggedNodePosition(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const zoomWithWheel = (event: WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    updateViewport(
      zoomFlowCanvasAtPoint(viewportRef.current, viewportRef.current.zoom * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      })
    );
    completeWheelViewport();
  };

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
      onPointerCancel={cancelInteraction}
      onWheel={zoomWithWheel}
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

            return (
              <article
                key={node.id}
                className={classNames?.builderNode ?? ""}
                style={{ left: position.x, top: position.y }}
                data-flow-node
                data-selected={selectedNodeId === node.id ? "true" : undefined}
                data-tone={flowNodeTone(node.kind)}
                onPointerDown={(event) => beginNodeDrag(event, node.id, position)}
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
        <button type="button" aria-label={copy.zoomOut} onClick={() => zoomAtCanvasCenter(1 / 1.2)}>
          -
        </button>
        <span data-flow-canvas-zoom aria-label={copy.zoomLevel}>
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button type="button" aria-label={copy.zoomIn} onClick={() => zoomAtCanvasCenter(1.2)}>
          +
        </button>
        <span aria-hidden="true" />
        <button type="button" aria-label={copy.fit} onClick={fitGraph}>
          {copy.fit}
        </button>
      </div>
    </section>
  );
}

const nodeWidth = 210;
const nodeHeight = 112;

function edgePath(source: CanvasPoint, target: CanvasPoint): string {
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

function graphBounds(positions: readonly CanvasPoint[]) {
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
): CanvasPoint {
  return (
    presentation.nodes.find((node) => node.nodeId === nodeId)?.position ?? {
      x: 80 + index * 320,
      y: 120
    }
  );
}

function pointerPosition(event: PointerEvent<HTMLElement>): CanvasPoint {
  return { x: event.clientX, y: event.clientY };
}

function subtractPoints(left: CanvasPoint, right: CanvasPoint): CanvasPoint {
  return { x: left.x - right.x, y: left.y - right.y };
}

function viewportTransform(viewport: FlowPresentationV1["viewport"]): string {
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
}

function flowNodeTone(kind: string): "trigger" | "communication" | "logic" | "calculation" | "manual" | "outcome" {
  switch (kind) {
    case "manual_client":
      return "trigger";
    case "send_message":
      return "communication";
    case "birth_data_available":
      return "logic";
    case "natal_chart_calculation":
    case "ai_interpretation_draft":
      return "calculation";
    case "astrologer_work_item":
    case "astrologer_approval":
      return "manual";
    default:
      return "outcome";
  }
}

const canvasCopy = {
  ru: {
    canvas: "Схема воронки",
    edges: "Связи воронки",
    zoomOut: "Уменьшить масштаб",
    zoomIn: "Увеличить масштаб",
    zoomLevel: "Масштаб схемы",
    fit: "Уместить схему",
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
    fit: "Fit graph",
    selectNode: "Select node",
    continueFrom: "Continue from",
    occupied: "Connection occupied"
  }
} as const;
