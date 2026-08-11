import { describe, expect, it } from "vitest";
import {
  clampFlowCanvasZoom,
  fitFlowCanvasViewport,
  panFlowCanvasViewport,
  zoomFlowCanvasAtPoint
} from "./flowCanvasViewport";

describe("flow canvas viewport mathematics", () => {
  it("clamps zoom to the supported canvas range", () => {
    expect(clampFlowCanvasZoom(0.1)).toBe(0.35);
    expect(clampFlowCanvasZoom(2)).toBe(1.6);
    expect(clampFlowCanvasZoom(Number.NaN)).toBe(1);
  });

  it("pans by the supplied screen-space delta", () => {
    expect(panFlowCanvasViewport({ x: 10, y: 20, zoom: 1 }, { x: 5, y: -4 })).toEqual({
      x: 15,
      y: 16,
      zoom: 1
    });
  });

  it("keeps the graph point under the cursor while zooming", () => {
    expect(zoomFlowCanvasAtPoint({ x: 10, y: 20, zoom: 1 }, 1.4, { x: 110, y: 120 })).toEqual({
      x: -30,
      y: -20,
      zoom: 1.4
    });
  });

  it("fits padded graph bounds in the container and centers them", () => {
    expect(
      fitFlowCanvasViewport({
        container: { width: 800, height: 600 },
        bounds: { x: 100, y: 50, width: 400, height: 200 },
        padding: 40
      })
    ).toEqual({
      x: -80,
      y: 60,
      zoom: 1.6
    });
  });

  it("falls back to the default viewport for a zero-size container", () => {
    expect(
      fitFlowCanvasViewport({
        container: { width: 0, height: 600 },
        bounds: { x: 100, y: 50, width: 400, height: 200 },
        padding: 40
      })
    ).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("normalizes non-finite transform results instead of returning them", () => {
    expect(panFlowCanvasViewport({ x: Number.NaN, y: 20, zoom: 1 }, { x: 5, y: -4 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1
    });
    expect(zoomFlowCanvasAtPoint({ x: 10, y: 20, zoom: 0 }, 2, { x: 110, y: 120 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1
    });
  });
});
