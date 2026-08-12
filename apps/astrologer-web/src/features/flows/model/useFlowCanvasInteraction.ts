import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { FlowPresentationV1 } from "@elevenhouse/contracts";
import {
  fitFlowCanvasViewport,
  panFlowCanvasViewport,
  zoomFlowCanvasAtPoint,
  type FlowCanvasBounds,
  type FlowCanvasPoint
} from "./flowCanvasViewport";

type Viewport = FlowPresentationV1["viewport"];

type CanvasInteraction =
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly startClient: FlowCanvasPoint;
      readonly startViewport: Viewport;
    }
  | {
      readonly kind: "node";
      readonly pointerId: number;
      readonly nodeId: string;
      readonly startClient: FlowCanvasPoint;
      readonly startPosition: FlowCanvasPoint;
      readonly startViewport: Viewport;
    };

export type FlowCanvasDraggedNodePosition = {
  readonly nodeId: string;
  readonly position: FlowCanvasPoint;
};

export type UseFlowCanvasInteractionInput = {
  readonly canvasRef: RefObject<HTMLElement | null>;
  readonly flowId?: string;
  readonly presentation: FlowPresentationV1;
  readonly editable: boolean;
  readonly onChangeViewport?: (viewport: Viewport) => void;
  readonly onMoveNode: (nodeId: string, position: FlowCanvasPoint) => void;
  readonly onSelectNode: (nodeId: string) => void;
};

export function useFlowCanvasInteraction({
  canvasRef,
  flowId,
  presentation,
  editable,
  onChangeViewport,
  onMoveNode,
  onSelectNode
}: UseFlowCanvasInteractionInput) {
  const [viewport, setViewport] = useState(presentation.viewport);
  const [draggedNodePosition, setDraggedNodePosition] =
    useState<FlowCanvasDraggedNodePosition | null>(null);
  const viewportRef = useRef(presentation.viewport);
  const presentationViewportRef = useRef(presentation.viewport);
  const editableRef = useRef(editable);
  const onChangeViewportRef = useRef(onChangeViewport);
  const interactionRef = useRef<CanvasInteraction | null>(null);
  const wheelCompletionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelStartViewportRef = useRef<Viewport | null>(null);

  editableRef.current = editable;
  onChangeViewportRef.current = onChangeViewport;

  const cancelWheelPersistence = () => {
    if (wheelCompletionTimer.current !== null) clearTimeout(wheelCompletionTimer.current);
    wheelCompletionTimer.current = null;
    wheelStartViewportRef.current = null;
  };

  const cancelInteraction = (pointerId?: number, releaseCapture = true) => {
    const interaction = interactionRef.current;
    if (!interaction || (pointerId !== undefined && interaction.pointerId !== pointerId)) return;
    interactionRef.current = null;
    setDraggedNodePosition(null);
    if (releaseCapture) canvasRef.current?.releasePointerCapture?.(interaction.pointerId);
  };

  useEffect(() => {
    cancelWheelPersistence();
    cancelInteraction();
    presentationViewportRef.current = presentation.viewport;
    viewportRef.current = presentation.viewport;
    setViewport(presentation.viewport);
    setDraggedNodePosition(null);
  }, [flowId, presentation]);

  useEffect(() => {
    cancelWheelPersistence();
    if (!editable) cancelInteraction();
  }, [editable]);

  useEffect(
    () => () => {
      cancelWheelPersistence();
      cancelInteraction();
    },
    []
  );

  const updateViewport = (nextViewport: Viewport): boolean => {
    if (sameViewport(viewportRef.current, nextViewport)) return false;
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
    return true;
  };

  const persistViewportIfChanged = (startViewport: Viewport) => {
    const currentViewport = viewportRef.current;
    if (
      !editableRef.current ||
      sameViewport(currentViewport, startViewport) ||
      sameViewport(currentViewport, presentationViewportRef.current)
    ) {
      return;
    }
    onChangeViewportRef.current?.(currentViewport);
  };

  const scheduleWheelPersistence = () => {
    if (wheelCompletionTimer.current !== null) clearTimeout(wheelCompletionTimer.current);
    wheelCompletionTimer.current = setTimeout(() => {
      const startViewport = wheelStartViewportRef.current;
      wheelCompletionTimer.current = null;
      wheelStartViewportRef.current = null;
      if (startViewport) persistViewportIfChanged(startViewport);
    }, 160);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event: Event) => {
      const wheelEvent = event as WheelEvent;
      wheelEvent.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const currentViewport = viewportRef.current;
      const nextViewport = zoomFlowCanvasAtPoint(
        currentViewport,
        currentViewport.zoom * (wheelEvent.deltaY < 0 ? 1.1 : 0.9),
        { x: wheelEvent.clientX - rect.left, y: wheelEvent.clientY - rect.top }
      );
      if (!updateViewport(nextViewport)) {
        if (wheelStartViewportRef.current) scheduleWheelPersistence();
        return;
      }
      wheelStartViewportRef.current ??= currentViewport;
      scheduleWheelPersistence();
    };

    const options = { passive: false } as const;
    const listenerOptions = options as unknown as EventListenerOptions;
    canvas.addEventListener("wheel", handleWheel, listenerOptions);
    return () => {
      canvas.removeEventListener("wheel", handleWheel, listenerOptions);
      cancelWheelPersistence();
    };
  }, [canvasRef]);

  const zoomAtCanvasCenter = (factor: number, fallbackCenter: FlowCanvasPoint) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const point = rect ? { x: rect.width / 2, y: rect.height / 2 } : fallbackCenter;
    const startViewport = viewportRef.current;
    const nextViewport = zoomFlowCanvasAtPoint(startViewport, startViewport.zoom * factor, point);
    if (!updateViewport(nextViewport)) return;
    persistViewportIfChanged(startViewport);
  };

  const fitViewport = (bounds: FlowCanvasBounds) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startViewport = viewportRef.current;
    const nextViewport = fitFlowCanvasViewport({
      container: { width: rect.width, height: rect.height },
      bounds,
      padding: 40
    });
    if (!updateViewport(nextViewport)) return;
    persistViewportIfChanged(startViewport);
  };

  const beginPan = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("[data-flow-node], button")) return;
    interactionRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClient: pointFromPointerEvent(event),
      startViewport: viewportRef.current
    };
    canvasRef.current?.setPointerCapture?.(event.pointerId);
  };

  const beginNodeDrag = (
    event: PointerEvent<HTMLElement>,
    nodeId: string,
    position: FlowCanvasPoint
  ) => {
    if (!editableRef.current || event.button !== 0) return;
    event.stopPropagation();
    onSelectNode(nodeId);
    interactionRef.current = {
      kind: "node",
      pointerId: event.pointerId,
      nodeId,
      startClient: pointFromPointerEvent(event),
      startPosition: position,
      startViewport: viewportRef.current
    };
    canvasRef.current?.setPointerCapture?.(event.pointerId);
  };

  const moveInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const delta = subtractPoints(pointFromPointerEvent(event), interaction.startClient);

    if (interaction.kind === "pan") {
      updateViewport(panFlowCanvasViewport(interaction.startViewport, delta));
      return;
    }

    setDraggedNodePosition({
      nodeId: interaction.nodeId,
      position: nodePositionAfterDelta(interaction, delta)
    });
  };

  const completeInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);

    if (interaction.kind === "pan") {
      persistViewportIfChanged(interaction.startViewport);
      return;
    }

    const position = nodePositionAfterDelta(
      interaction,
      subtractPoints(pointFromPointerEvent(event), interaction.startClient)
    );
    if (!editableRef.current || samePoint(position, interaction.startPosition)) {
      setDraggedNodePosition(null);
      return;
    }
    onMoveNode(interaction.nodeId, position);
  };

  const cancelPointerInteraction = (event: PointerEvent<HTMLElement>) => {
    cancelInteraction(event.pointerId);
  };

  const cancelLostPointerCapture = (event: PointerEvent<HTMLElement>) => {
    cancelInteraction(event.pointerId, false);
  };

  return {
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
  };
}

function nodePositionAfterDelta(
  interaction: Extract<CanvasInteraction, { readonly kind: "node" }>,
  delta: FlowCanvasPoint
): FlowCanvasPoint {
  return {
    x: interaction.startPosition.x + delta.x / interaction.startViewport.zoom,
    y: interaction.startPosition.y + delta.y / interaction.startViewport.zoom
  };
}

function pointFromPointerEvent(event: PointerEvent<HTMLElement>): FlowCanvasPoint {
  return { x: event.clientX, y: event.clientY };
}

function subtractPoints(left: FlowCanvasPoint, right: FlowCanvasPoint): FlowCanvasPoint {
  return { x: left.x - right.x, y: left.y - right.y };
}

function samePoint(left: FlowCanvasPoint, right: FlowCanvasPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameViewport(left: Viewport, right: Viewport): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}
