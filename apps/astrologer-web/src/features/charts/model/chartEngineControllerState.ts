import {
  chartResultSchema,
  type CalculationRecordResponse,
  type ChartCalculationCapability,
  type ChartInterpretationMode,
  type ChartResult,
  type ChartSettings,
  type DictionaryLocale
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";
import type { ChartCalculationRead } from "../api/chartsApi";
import {
  resolveChartCalculationIdentity,
  type ChartCalculationIdentityState
} from "./chartCalculationIdentity";
import {
  getChartEngineCapabilities,
  type ChartEngineCapabilities
} from "./chartEngineCapabilities";
import { chartEngineCopyByLocale, type ChartEngineCopy } from "./chartEngineCopy";
import type { ChartHoraryQuestionInput, ChartTransitMomentInput } from "./chartEngineInput";
import type { ChartEngineMode, ChartEnginePageJobState } from "./chartEngineMode";
import {
  readChartEngineUrlState,
  type ChartEngineMode as SafeChartEngineMode
} from "./chartEngineUrlState";

export const defaultChartEngineSettings: ChartSettings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
};

export function createInitialChartEngineControllerState(search: string) {
  const urlState = readChartEngineUrlState(search);

  return {
    urlState,
    mode: urlState.mode,
    jobId: urlState.jobId,
    calculationId: urlState.calculationId,
    transitMoment: {
      ...getDefaultTransitMoment(),
      ...(urlState.transitDate === null ? {} : { date: urlState.transitDate }),
      ...(urlState.transitTime === null ? {} : { time: urlState.transitTime })
    },
    solarReturnYear: urlState.solarReturnYear ?? new Date().getFullYear(),
    progressionTargetDate: urlState.progressionTargetDate ?? getDefaultProgressionTargetDate(),
    horaryQuestion: getDefaultHoraryQuestion()
  };
}

type ChartEngineCalculationState = {
  readonly identity: ChartCalculationIdentityState;
  readonly result: ChartResult | null;
  readonly interpretationMode: ChartInterpretationMode | null;
  readonly mode: SafeChartEngineMode | null;
  readonly linkableClientId: string | null;
  readonly capabilities: ChartEngineCapabilities;
};

export function resolveChartEngineCalculationState(input: {
  readonly mode: SafeChartEngineMode;
  readonly selectedClientId: string | null;
  readonly selectedPartnerClientId: string | null;
  readonly chartCalculation: ChartCalculationRead | null | undefined;
  readonly savedCalculation: CalculationRecordResponse | null | undefined;
}): ChartEngineCalculationState {
  if (input.chartCalculation === undefined || input.savedCalculation === undefined) {
    return unavailableCalculationState({ kind: "pending" });
  }
  if (
    input.chartCalculation === null ||
    input.savedCalculation === null ||
    input.chartCalculation.calculationId !== input.savedCalculation.id
  ) {
    return unavailableCalculationState({ kind: "unavailable" });
  }

  const savedResult = chartResultSchema.safeParse(input.savedCalculation.resultData);
  const strictResult = chartResultSchema.safeParse(input.chartCalculation.result);
  if (
    !savedResult.success ||
    !strictResult.success ||
    savedResult.data.method !== input.savedCalculation.methodCode ||
    !sameCanonicalResult(savedResult.data, strictResult.data)
  ) {
    return unavailableCalculationState({ kind: "unavailable" });
  }

  const savedInterpretationMode =
    input.savedCalculation.interpretationMode ?? "legacy_unclassified";
  const interpretationMode = input.chartCalculation.interpretationMode;
  const authoritativeMode = resolveAuthoritativeChartEngineMode(
    strictResult.data,
    interpretationMode
  );
  if (savedInterpretationMode !== interpretationMode || authoritativeMode === null) {
    return unavailableCalculationState({ kind: "unavailable" });
  }

  const identity = resolveChartCalculationIdentity({
    calculation: input.savedCalculation,
    mode: authoritativeMode,
    selectedClientId: input.selectedClientId,
    selectedPartnerClientId: input.selectedPartnerClientId
  });
  if (
    !backendCapabilitiesMatchResult(
      input.chartCalculation.capabilities,
      strictResult.data,
      interpretationMode
    )
  ) {
    return unavailableCalculationState(identity);
  }

  const capabilities = getChartEngineCapabilities({
    mode: authoritativeMode,
    interpretationMode,
    result: strictResult.data,
    calculationStatus: input.savedCalculation.status,
    identity,
    participantLabels: {
      subject:
        input.savedCalculation.participants.find((participant) => participant.role === "subject")
          ?.displayName ?? undefined,
      partner:
        input.savedCalculation.participants.find((participant) => participant.role === "partner")
          ?.displayName ?? undefined
    }
  });
  if (capabilities.view === "none" || identity.kind !== "ready") {
    return unavailableCalculationState(identity);
  }

  return {
    identity,
    result: strictResult.data,
    interpretationMode,
    mode: authoritativeMode,
    linkableClientId: capabilities.canLink ? identity.subjectClientId : null,
    capabilities
  };
}

export function deriveChartEngineJobState(input: {
  readonly isSubmitting: boolean;
  readonly jobId: string | null;
  readonly jobStatus: "calculating" | "succeeded" | "failed" | undefined;
  readonly pollError: unknown;
  readonly calculationId: string | null;
  readonly isResultLoading: boolean;
  readonly resultError: unknown;
  readonly isSavedCalculationLoading: boolean;
  readonly savedCalculationError: unknown;
  readonly identityKind: ChartCalculationIdentityState["kind"];
  readonly result: ChartResult | null;
}): ChartEnginePageJobState {
  if (input.isSubmitting) return "calculating";
  if (input.pollError || input.jobStatus === "failed") return "failed";
  if (input.jobId || input.jobStatus === "calculating") return "calculating";
  if (input.resultError || input.savedCalculationError) return "failed";
  if (input.result) return "succeeded";
  if (input.calculationId) {
    if (
      input.isResultLoading ||
      input.isSavedCalculationLoading ||
      input.identityKind === "pending"
    ) {
      return "calculating";
    }
    return "failed";
  }
  return "idle";
}

export function shouldCommitTerminalJobRecovery(input: {
  readonly localJobId: string | null;
  readonly localCalculationId: string | null;
  readonly urlJobId: string | null;
  readonly urlCalculationId: string | null;
  readonly terminalCalculationId: string;
}): boolean {
  return (
    input.localJobId !== null ||
    input.localCalculationId !== input.terminalCalculationId ||
    input.urlJobId !== null ||
    input.urlCalculationId !== input.terminalCalculationId
  );
}

export function errorMessageFrom(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export function getChartIdentityErrorMessage(
  identity: ChartCalculationIdentityState,
  copy: ChartEngineCopy["controller"] = chartEngineCopyByLocale.ru.controller
): string | null {
  switch (identity.kind) {
    case "client_mismatch":
      return copy.identityWrongClient;
    case "partner_mismatch":
      return copy.identityWrongPartner;
    case "unavailable":
      return copy.identityUnavailable;
    case "pending":
    case "ready":
      return null;
  }
}

export type ChartEngineSubmissionAuthority =
  | {
      readonly kind: "create";
      readonly calculationId: null;
      readonly expectedResultChecksum: null;
    }
  | {
      readonly kind: "recalculate";
      readonly calculationId: string;
      readonly expectedResultChecksum: string;
    }
  | {
      readonly kind: "blocked";
      readonly message: string;
    };

export function resolveChartEngineSubmissionAuthority(input: {
  readonly calculationId: string | null;
  readonly expectedResultChecksum: string | null;
  readonly canRecalculate: boolean;
  readonly locale?: DictionaryLocale;
}): ChartEngineSubmissionAuthority {
  const copy = chartEngineCopyByLocale[input.locale ?? "ru"].controller;
  if (!input.calculationId) {
    return { kind: "create", calculationId: null, expectedResultChecksum: null };
  }
  if (!input.canRecalculate) {
    return { kind: "blocked", message: copy.cannotRecalculate };
  }
  if (!input.expectedResultChecksum) {
    return { kind: "blocked", message: copy.cannotConfirmVersion };
  }
  return {
    kind: "recalculate",
    calculationId: input.calculationId,
    expectedResultChecksum: input.expectedResultChecksum
  };
}

export function getChartLinkableClientId(
  calculation: Pick<CalculationRecordResponse, "participants"> | null
) {
  return (
    calculation?.participants.find(
      (participant) => participant.source === "crm_client" && participant.clientId
    )?.clientId ?? null
  );
}

export function restoreChartEngineViewState(
  result: ChartResult,
  options: {
    readonly interpretationMode?: ChartInterpretationMode;
    readonly partnerClientId?: string | null;
  } = {}
): {
  readonly mode: ChartEngineMode;
  readonly settings: ChartSettings;
  readonly transitMoment?: ChartTransitMomentInput;
  readonly partnerClientId?: string;
  readonly solarReturnYear?: number;
  readonly progressionTargetDate?: string;
  readonly horaryQuestion?: ChartHoraryQuestionInput;
} {
  if (result.method === "horary") {
    return { mode: "horary", settings: result.settings, horaryQuestion: result.questionSnapshot };
  }
  if (result.method === "astrocartography") {
    return { mode: "astrocartography", settings: result.settings };
  }
  if (result.method === "synastry" || result.method === "composite") {
    return {
      mode: result.method,
      settings: result.settings,
      ...(options.partnerClientId ? { partnerClientId: options.partnerClientId } : {})
    };
  }
  if (result.method === "solar_return") {
    return {
      mode: "solar_return",
      settings: result.settings,
      solarReturnYear: result.solarReturnSnapshot.year
    };
  }
  if (result.method === "progression") {
    return {
      mode: "progression",
      settings: result.settings,
      progressionTargetDate: result.progressionSnapshot.targetDate
    };
  }
  if (result.method !== "transit") {
    return {
      mode: options.interpretationMode === "child" ? "child_chart" : "natal",
      settings: result.settings
    };
  }
  return {
    mode: "transit",
    settings: result.settings,
    transitMoment: {
      date: result.transitSnapshot.date,
      time: result.transitSnapshot.time,
      ...(result.transitSnapshot.dstOccurrence
        ? { dstOccurrence: result.transitSnapshot.dstOccurrence }
        : {})
    }
  };
}

export function getDefaultTransitMoment(now: Date = new Date()): ChartTransitMomentInput {
  return {
    date: formatLocalCalendarDate(now),
    time: `${padDatePart(now.getHours())}:${padDatePart(now.getMinutes())}`
  };
}

export function getDefaultProgressionTargetDate(now: Date = new Date()): string {
  return formatLocalCalendarDate(now);
}

export function getDefaultHoraryQuestion(now: Date = new Date()): ChartHoraryQuestionInput {
  const moment = getDefaultTransitMoment(now);
  return {
    question: "",
    category: "other",
    date: moment.date,
    time: moment.time,
    timezone: getBrowserTimezone() ?? "",
    latitude: "",
    longitude: ""
  };
}

export function getBrowserTimezone(
  resolveOptions: () => Intl.ResolvedDateTimeFormatOptions = () =>
    Intl.DateTimeFormat().resolvedOptions()
): string | null {
  try {
    const timezone = resolveOptions().timeZone?.trim();
    return timezone ? timezone : null;
  } catch {
    return null;
  }
}

export function getHoraryPlaceReferenceErrorMessage(
  error: unknown,
  copy: ChartEngineCopy
): string | null {
  if (!error) return null;
  if (error instanceof HttpError) {
    const code = readHttpErrorCode(error.body);
    if (error.status === 429 || code === "BIRTH_PLACE_RATE_LIMITED") {
      return copy.horary.placeRateLimited;
    }
    if (error.status === 404 || code === "BIRTH_PLACE_NOT_FOUND") {
      return copy.horary.placeNotFound;
    }
    if (error.status === 400 || error.status === 422 || code === "BIRTH_PLACE_REFERENCE_INVALID") {
      return copy.horary.placeInvalid;
    }
  }
  return copy.horary.placeUnavailable;
}

function unavailableCalculationState(
  identity: ChartCalculationIdentityState
): ChartEngineCalculationState {
  return {
    identity,
    result: null,
    interpretationMode: null,
    mode: null,
    linkableClientId: null,
    capabilities: {
      view: "none",
      canRecalculate: false,
      canRequestAi: false,
      canRequestPdf: false,
      canLink: false,
      canPublish: false,
      warnings: []
    }
  };
}

function backendCapabilitiesMatchResult(
  capabilities: readonly ChartCalculationCapability[],
  result: ChartResult,
  interpretationMode: ChartInterpretationMode
): boolean {
  const expected: readonly ChartCalculationCapability[] =
    result.schemaVersion === "chart-result.v1"
      ? ["view_legacy", "recalculate"]
      : result.method === "natal" && interpretationMode === "legacy_unclassified"
        ? ["view_current", "recalculate"]
        : result.method === "natal" && interpretationMode === "child"
          ? ["view_current", "recalculate", "link"]
          : [
              "view_current",
              "recalculate",
              "link",
              "publish",
              ...(result.method === "natal" ? (["ai_draft", "pdf"] as const) : [])
            ];
  return (
    capabilities.length === expected.length &&
    new Set(capabilities).size === capabilities.length &&
    expected.every((capability) => capabilities.includes(capability))
  );
}

function resolveAuthoritativeChartEngineMode(
  result: ChartResult,
  interpretationMode: ChartInterpretationMode
): SafeChartEngineMode | null {
  if (result.method === "natal") {
    return interpretationMode === "child" ? "child_chart" : "natal";
  }
  return interpretationMode === "legacy_unclassified" ? result.method : null;
}

function sameCanonicalResult(left: ChartResult, right: ChartResult): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatLocalCalendarDate(date: Date): string {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join(
    "-"
  );
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function readHttpErrorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const code = (body as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}
