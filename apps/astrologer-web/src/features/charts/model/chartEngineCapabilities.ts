import type {
  CalculationStatus,
  ChartCalculationMethod,
  ChartInterpretationMode,
  ChartResult
} from "@elevenhouse/contracts";
import { chartResultSchema, isReproducibleChartResult } from "@elevenhouse/contracts";
import type { ChartCalculationIdentityState } from "./chartCalculationIdentity";
import type { ChartEngineMode } from "./chartEngineUrlState";

export type ChartCapabilityResult = ChartResult;

export type ChartApproximateBirthTimeWarning = {
  readonly code: "approximate_birth_time";
  readonly participants: readonly {
    readonly role: "subject" | "partner";
    readonly label: string | null;
  }[];
};

export type ChartEngineCapabilities = {
  readonly view: "none" | "legacy" | "current";
  readonly canRecalculate: boolean;
  readonly canRequestAi: boolean;
  readonly canRequestPdf: boolean;
  readonly canLink: boolean;
  readonly canPublish: boolean;
  readonly warnings: readonly ChartApproximateBirthTimeWarning[];
};

const unavailableCapabilities: ChartEngineCapabilities = {
  view: "none",
  canRecalculate: false,
  canRequestAi: false,
  canRequestPdf: false,
  canLink: false,
  canPublish: false,
  warnings: []
};

export function getChartEngineCapabilities(input: {
  readonly mode: ChartEngineMode;
  readonly interpretationMode: ChartInterpretationMode;
  readonly result: unknown;
  readonly calculationStatus: CalculationStatus;
  readonly identity: ChartCalculationIdentityState;
  readonly participantLabels?: Partial<Record<"subject" | "partner", string>>;
}): ChartEngineCapabilities {
  const parsedResult = chartResultSchema.safeParse(input.result);
  if (
    !parsedResult.success ||
    input.identity.kind !== "ready" ||
    input.calculationStatus === "archived" ||
    !methodMatchesMode(parsedResult.data.method, input.mode)
  ) {
    return unavailableCapabilities;
  }

  const result = parsedResult.data;
  if (
    (result.method === "natal" &&
      input.mode !== (input.interpretationMode === "child" ? "child_chart" : "natal")) ||
    (result.method !== "natal" && input.interpretationMode !== "legacy_unclassified")
  ) {
    return unavailableCapabilities;
  }
  const warnings = getApproximateWarnings(result, input.participantLabels);
  if (result.schemaVersion === "chart-result.v1") {
    return {
      view: "legacy",
      canRecalculate: true,
      canRequestAi: false,
      canRequestPdf: false,
      canLink: false,
      canPublish: false,
      warnings
    };
  }

  if (!isReproducibleChartResult(result)) return unavailableCapabilities;
  if (result.method === "natal") {
    if (input.interpretationMode === "legacy_unclassified") {
      return {
        view: "current",
        canRecalculate: true,
        canRequestAi: false,
        canRequestPdf: false,
        canLink: false,
        canPublish: false,
        warnings
      };
    }
  }
  return {
    view: "current",
    canRecalculate: true,
    canRequestAi: true,
    canRequestPdf: result.method === "natal",
    canLink: true,
    canPublish: true,
    warnings
  };
}

function getApproximateWarnings(
  result: ChartResult,
  labels: Partial<Record<"subject" | "partner", string>> | undefined
): readonly ChartApproximateBirthTimeWarning[] {
  const participants: Array<{
    readonly role: "subject" | "partner";
    readonly label: string | null;
  }> = [];
  if ("inputSnapshot" in result && result.inputSnapshot.birthTimePrecision === "approximate") {
    participants.push({ role: "subject", label: normalizeLabel(labels?.subject) });
  }
  if (
    "partnerInputSnapshot" in result &&
    result.partnerInputSnapshot.birthTimePrecision === "approximate"
  ) {
    participants.push({ role: "partner", label: normalizeLabel(labels?.partner) });
  }
  return participants.length > 0 ? [{ code: "approximate_birth_time", participants }] : [];
}

function methodMatchesMode(method: ChartCalculationMethod, mode: ChartEngineMode): boolean {
  return method === (mode === "child_chart" ? "natal" : mode);
}

function normalizeLabel(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
