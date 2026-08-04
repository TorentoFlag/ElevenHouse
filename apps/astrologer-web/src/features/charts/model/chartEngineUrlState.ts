export const chartEngineModes = [
  "natal",
  "child_chart",
  "transit",
  "progression",
  "synastry",
  "composite",
  "solar_return",
  "astrocartography",
  "horary"
] as const;

export type ChartEngineMode = (typeof chartEngineModes)[number];

export type ChartEngineUrlState = {
  readonly mode: ChartEngineMode;
  readonly clientId: string | null;
  readonly partnerClientId: string | null;
  readonly jobId: string | null;
  readonly calculationId: string | null;
  readonly transitDate: string | null;
  readonly transitTime: string | null;
  readonly solarReturnYear: number | null;
  readonly progressionTargetDate: string | null;
  readonly horaryPlaceProvider: "geoapify" | null;
  readonly horaryPlaceId: string | null;
};

type ChartEngineUrlTransition = Partial<
  Pick<ChartEngineUrlState, "mode" | "clientId" | "partnerClientId">
>;

const chartEngineModeSet = new Set<string>(chartEngineModes);
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const allowedPanelSet = new Set(["wheel", "aspects", "interpretations"]);

export function readChartEngineUrlState(search: string): ChartEngineUrlState {
  const params = new URLSearchParams(search);
  const mode = normalizeMode(params.get("mode"));
  const jobId = normalizeUuid(params.get("jobId"));
  const calculationId = jobId ? null : normalizeUuid(params.get("calculationId"));
  const horaryPlace = readHoraryPlace(params, mode);

  return {
    mode,
    clientId: normalizeUuid(params.get("clientId")),
    partnerClientId: isPairMode(mode) ? normalizeUuid(params.get("partnerClientId")) : null,
    jobId,
    calculationId,
    transitDate: mode === "transit" ? normalizeDate(params.get("transitDate")) : null,
    transitTime: mode === "transit" ? normalizeTime(params.get("transitTime")) : null,
    solarReturnYear: mode === "solar_return" ? normalizeYear(params.get("solarReturnYear")) : null,
    progressionTargetDate:
      mode === "progression" ? normalizeDate(params.get("progressionTargetDate")) : null,
    ...horaryPlace
  };
}

export function buildChartEngineSearch(search: string, state: ChartEngineUrlState): string {
  const previous = new URLSearchParams(search);
  const params = new URLSearchParams();
  const panel = previous.get("panel");
  if (panel !== null && allowedPanelSet.has(panel)) params.set("panel", panel);

  const normalized = normalizeState(state);
  if (normalized.mode !== "natal") params.set("mode", normalized.mode);
  setOptionalParam(params, "clientId", normalized.clientId);
  setOptionalParam(params, "partnerClientId", normalized.partnerClientId);
  setOptionalParam(params, "jobId", normalized.jobId);
  setOptionalParam(params, "calculationId", normalized.calculationId);
  setOptionalParam(params, "transitDate", normalized.transitDate);
  setOptionalParam(params, "transitTime", normalized.transitTime);
  setOptionalParam(
    params,
    "solarReturnYear",
    normalized.solarReturnYear === null ? null : String(normalized.solarReturnYear)
  );
  setOptionalParam(params, "progressionTargetDate", normalized.progressionTargetDate);
  setOptionalParam(params, "horaryPlaceProvider", normalized.horaryPlaceProvider);
  setOptionalParam(params, "horaryPlaceId", normalized.horaryPlaceId);

  const value = params.toString();
  return value ? `?${value}` : "";
}

export function transitionChartEngineUrlState(
  current: ChartEngineUrlState,
  change: ChartEngineUrlTransition
): ChartEngineUrlState {
  const nextMode = change.mode ?? current.mode;
  const nextClientId = change.clientId === undefined ? current.clientId : change.clientId;

  if (nextMode !== current.mode) {
    return emptyChartEngineUrlState(nextMode, nextClientId);
  }

  if (change.clientId !== undefined && change.clientId !== current.clientId) {
    return normalizeState({
      ...current,
      clientId: change.clientId,
      partnerClientId: null,
      jobId: null,
      calculationId: null
    });
  }

  if (change.partnerClientId !== undefined && change.partnerClientId !== current.partnerClientId) {
    return normalizeState({
      ...current,
      partnerClientId: change.partnerClientId,
      jobId: null,
      calculationId: null
    });
  }

  return normalizeState(current);
}

function emptyChartEngineUrlState(
  mode: ChartEngineMode,
  clientId: string | null
): ChartEngineUrlState {
  return {
    mode,
    clientId: normalizeUuid(clientId),
    partnerClientId: null,
    jobId: null,
    calculationId: null,
    transitDate: null,
    transitTime: null,
    solarReturnYear: null,
    progressionTargetDate: null,
    horaryPlaceProvider: null,
    horaryPlaceId: null
  };
}

function normalizeState(state: ChartEngineUrlState): ChartEngineUrlState {
  const mode = normalizeMode(state.mode);
  const jobId = normalizeUuid(state.jobId);
  const horaryPlaceId = mode === "horary" ? normalizePlaceId(state.horaryPlaceId) : null;
  const horaryPlaceProvider =
    mode === "horary" && state.horaryPlaceProvider === "geoapify" && horaryPlaceId
      ? "geoapify"
      : null;

  return {
    mode,
    clientId: normalizeUuid(state.clientId),
    partnerClientId: isPairMode(mode) ? normalizeUuid(state.partnerClientId) : null,
    jobId,
    calculationId: jobId ? null : normalizeUuid(state.calculationId),
    transitDate: mode === "transit" ? normalizeDate(state.transitDate) : null,
    transitTime: mode === "transit" ? normalizeTime(state.transitTime) : null,
    solarReturnYear: mode === "solar_return" ? normalizeYear(state.solarReturnYear) : null,
    progressionTargetDate:
      mode === "progression" ? normalizeDate(state.progressionTargetDate) : null,
    horaryPlaceProvider,
    horaryPlaceId: horaryPlaceProvider ? horaryPlaceId : null
  };
}

function readHoraryPlace(
  params: URLSearchParams,
  mode: ChartEngineMode
): Pick<ChartEngineUrlState, "horaryPlaceProvider" | "horaryPlaceId"> {
  if (mode !== "horary" || params.get("horaryPlaceProvider") !== "geoapify") {
    return { horaryPlaceProvider: null, horaryPlaceId: null };
  }
  const horaryPlaceId = normalizePlaceId(params.get("horaryPlaceId"));
  return horaryPlaceId
    ? { horaryPlaceProvider: "geoapify", horaryPlaceId }
    : { horaryPlaceProvider: null, horaryPlaceId: null };
}

function normalizeMode(value: string | null): ChartEngineMode {
  return value !== null && chartEngineModeSet.has(value) ? (value as ChartEngineMode) : "natal";
}

function normalizeUuid(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return canonicalUuidPattern.test(normalized) ? normalized : null;
}

function normalizeDate(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? normalized
    : null;
}

function normalizeTime(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : null;
}

function normalizeYear(value: string | number | null): number | null {
  if (typeof value === "string" && !/^\d{4}$/.test(value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value?.trim() ?? "");
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : null;
}

function normalizePlaceId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length >= 1 && normalized.length <= 200 && /^[A-Za-z0-9._~-]+$/.test(normalized)
    ? normalized
    : null;
}

function isPairMode(mode: ChartEngineMode): boolean {
  return mode === "synastry" || mode === "composite";
}

function setOptionalParam(params: URLSearchParams, key: string, value: string | null): void {
  if (value !== null) params.set(key, value);
}
