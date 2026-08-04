import type { ChartResult } from "@elevenhouse/contracts";

export type ChartEngineMode =
  | "natal"
  | "child_chart"
  | "transit"
  | "progression"
  | "synastry"
  | "composite"
  | "solar_return"
  | "astrocartography"
  | "horary";

export type ChartEnginePageJobState = "idle" | "calculating" | "succeeded" | "failed";

export const primaryChartModes: readonly ChartEngineMode[] = ["natal", "child_chart", "transit"];

export const overflowChartModes: readonly ChartEngineMode[] = [
  "progression",
  "synastry",
  "composite",
  "solar_return",
  "horary",
  "astrocartography"
];

export function getChartResultMethodForMode(mode: ChartEngineMode): ChartResult["method"] {
  return mode === "child_chart" ? "natal" : mode;
}
