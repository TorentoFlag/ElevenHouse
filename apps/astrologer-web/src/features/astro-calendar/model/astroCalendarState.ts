import type {
  AstroCalendarEventType,
  AstroCalendarRangeQuery,
  AstroCalendarRangeResponse,
  AstroCalendarWarning,
  DictionaryEffectiveEntryResponse,
  DictionaryEntriesResponse
} from "@elevenhouse/contracts";

type AstroCalendarLocalFilters = {
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
  readonly scope: AstroCalendarRangeQuery["scope"];
  readonly clientIds: readonly string[];
  readonly eventTypes: readonly AstroCalendarEventType[];
};

export type AstroCalendarGenerationSummary = {
  readonly status: AstroCalendarRangeResponse["generation"]["status"] | "no-data";
  readonly canGenerate: boolean;
  readonly canRetry: boolean;
  readonly canRecalculate: boolean;
  readonly hasCurrentResult: boolean;
  readonly primaryAction: "generate" | "retry" | "recalculate" | "none";
  readonly isCompletionClaimed: boolean;
  readonly readiness: AstroCalendarReadinessState;
};

export type AstroCalendarReadinessState = {
  readonly status: "none" | "ready" | "partial";
  readonly clientsTotal: number;
  readonly clientsReady: number;
  readonly missingBirthData: number;
  readonly unknownBirthTime: number;
  readonly approximateBirthTime: number;
  readonly warnings: readonly AstroCalendarWarning[];
};

export type AstroCalendarInterpretations = {
  readonly entriesByCode: Record<string, DictionaryEffectiveEntryResponse>;
  readonly missing: readonly AstroCalendarMissingInterpretation[];
  readonly status: "none" | "complete" | "partial";
};

export type AstroCalendarMissingInterpretation = {
  readonly code: string;
  readonly suggestedCategory: "planet-sign" | "planet-house" | "aspect" | "calendar";
  readonly createSearchParams: {
    readonly code: string;
    readonly category: "planet-sign" | "planet-house" | "aspect" | "calendar";
  };
};

export function createAstroCalendarRangeQuery(
  filters: AstroCalendarLocalFilters
): AstroCalendarRangeQuery {
  return {
    start: filters.start,
    end: filters.end,
    timeZone: filters.timeZone,
    scope: filters.scope,
    clientIds: uniqueSorted(filters.clientIds),
    eventTypes: uniqueInInputOrder(filters.eventTypes)
  };
}

export function summarizeAstroCalendarState(
  response: AstroCalendarRangeResponse | null
): AstroCalendarGenerationSummary {
  if (!response) {
    return {
      status: "no-data",
      canGenerate: true,
      canRetry: false,
      canRecalculate: false,
      hasCurrentResult: false,
      primaryAction: "generate",
      isCompletionClaimed: false,
      readiness: emptyReadiness()
    };
  }

  const status = response.generation.status;
  const hasCurrentResult = status === "ready";

  return {
    status,
    canGenerate: status === "stale" || status === "failed",
    canRetry: status === "failed" && response.generation.generationId !== null,
    canRecalculate: status === "stale",
    hasCurrentResult,
    primaryAction: primaryActionForStatus(status, response.generation.generationId),
    isCompletionClaimed: hasCurrentResult,
    readiness: summarizeReadiness(response)
  };
}

export function resolveAstroCalendarInterpretations(
  response: AstroCalendarRangeResponse,
  dictionary: DictionaryEntriesResponse | null
): AstroCalendarInterpretations {
  const entriesByCode = Object.fromEntries(
    (dictionary?.entries ?? []).map((entry) => [entry.code, entry])
  );
  const missing = response.dictionaryCodes
    .filter((code) => entriesByCode[code] === undefined)
    .map((code) => createMissingInterpretation(code, response.warnings));

  return {
    entriesByCode,
    missing,
    status:
      response.dictionaryCodes.length === 0
        ? "none"
        : missing.length === 0
          ? "complete"
          : "partial"
  };
}

function summarizeReadiness(response: AstroCalendarRangeResponse): AstroCalendarReadinessState {
  const warnings = response.warnings.filter((warning) =>
    [
      "CLIENT_BIRTH_DATA_MISSING",
      "CLIENT_BIRTH_TIME_UNKNOWN",
      "CLIENT_BIRTH_TIME_APPROXIMATE"
    ].includes(warning.code)
  );

  return {
    status: readinessStatus(response),
    clientsTotal: response.readiness.clientsTotal,
    clientsReady: response.readiness.clientsReady,
    missingBirthData: response.readiness.clientsWithMissingBirthData,
    unknownBirthTime: response.readiness.clientsWithUnknownBirthTime,
    approximateBirthTime: response.readiness.clientsWithApproximateBirthTime,
    warnings
  };
}

function readinessStatus(
  response: AstroCalendarRangeResponse
): AstroCalendarReadinessState["status"] {
  if (response.readiness.clientsTotal === 0) return "none";
  if (
    response.readiness.clientsWithMissingBirthData === 0 &&
    response.readiness.clientsWithUnknownBirthTime === 0 &&
    response.readiness.clientsWithApproximateBirthTime === 0
  ) {
    return "ready";
  }
  return "partial";
}

function primaryActionForStatus(
  status: AstroCalendarRangeResponse["generation"]["status"],
  generationId: string | null
): AstroCalendarGenerationSummary["primaryAction"] {
  if (status === "stale") return "recalculate";
  if (status === "failed" && generationId !== null) return "retry";
  return "none";
}

function createMissingInterpretation(
  code: string,
  warnings: readonly AstroCalendarWarning[]
): AstroCalendarMissingInterpretation {
  const action = warnings.find((warning) => warning.dictionaryCode === code)?.action;
  const suggestedCategory = action?.suggestedCategory ?? "calendar";

  return {
    code,
    suggestedCategory,
    createSearchParams: {
      code,
      category: suggestedCategory
    }
  };
}

function emptyReadiness(): AstroCalendarReadinessState {
  return {
    status: "none",
    clientsTotal: 0,
    clientsReady: 0,
    missingBirthData: 0,
    unknownBirthTime: 0,
    approximateBirthTime: 0,
    warnings: []
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function uniqueInInputOrder<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}
