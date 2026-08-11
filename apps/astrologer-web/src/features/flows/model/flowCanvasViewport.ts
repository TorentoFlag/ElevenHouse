import type { FlowPresentationV1 } from "@elevenhouse/contracts";

export const FLOW_CANVAS_MIN_ZOOM = 0.35;
export const FLOW_CANVAS_MAX_ZOOM = 1.6;

export type FlowCanvasPoint = Readonly<{
  x: number;
  y: number;
}>;

export type FlowCanvasBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type FlowCanvasContainer = Readonly<{
  width: number;
  height: number;
}>;

const defaultViewport: FlowPresentationV1["viewport"] = { x: 0, y: 0, zoom: 1 };

export function clampFlowCanvasZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return defaultViewport.zoom;
  return Math.min(FLOW_CANVAS_MAX_ZOOM, Math.max(FLOW_CANVAS_MIN_ZOOM, zoom));
}

export function panFlowCanvasViewport(
  viewport: FlowPresentationV1["viewport"],
  delta: FlowCanvasPoint
): FlowPresentationV1["viewport"] {
  return normalizeViewport({
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
    zoom: viewport.zoom
  });
}

export function zoomFlowCanvasAtPoint(
  viewport: FlowPresentationV1["viewport"],
  nextZoom: number,
  point: FlowCanvasPoint
): FlowPresentationV1["viewport"] {
  const zoom = clampFlowCanvasZoom(nextZoom);
  const graphPoint = {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom
  };

  return normalizeViewport({
    x: point.x - graphPoint.x * zoom,
    y: point.y - graphPoint.y * zoom,
    zoom
  });
}

export function fitFlowCanvasViewport(input: {
  readonly container: FlowCanvasContainer;
  readonly bounds: FlowCanvasBounds;
  readonly padding: number;
}): FlowPresentationV1["viewport"] {
  const { container, bounds, padding } = input;

  if (container.width <= 0 || container.height <= 0) {
    return { ...defaultViewport };
  }
  if (
    !Number.isFinite(container.width) ||
    !Number.isFinite(container.height) ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    !Number.isFinite(padding) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return { ...defaultViewport };
  }

  const availableWidth = container.width - padding * 2;
  const availableHeight = container.height - padding * 2;

  if (availableWidth <= 0 || availableHeight <= 0) {
    return { ...defaultViewport };
  }

  const zoom = clampFlowCanvasZoom(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
  );
  const boundsCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };

  return normalizeViewport({
    x: container.width / 2 - boundsCenter.x * zoom,
    y: container.height / 2 - boundsCenter.y * zoom,
    zoom
  });
}

function normalizeViewport(
  viewport: FlowPresentationV1["viewport"]
): FlowPresentationV1["viewport"] {
  return Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom)
    ? viewport
    : { ...defaultViewport };
}
