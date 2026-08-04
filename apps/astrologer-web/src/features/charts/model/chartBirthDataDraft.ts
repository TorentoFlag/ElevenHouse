import {
  clientBirthDataUpsertRequestSchema,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest
} from "@elevenhouse/contracts";

export type ChartBirthDataDraft = {
  readonly clientId: string;
  readonly values: ClientBirthDataUpsertRequest;
};

export function createChartBirthDataDraft(
  clientId: string,
  birthData: ClientBirthDataResponse | null
): ChartBirthDataDraft {
  if (birthData !== null && birthData.clientUserId !== clientId) {
    throw new Error("CHART_BIRTH_DATA_SOURCE_CLIENT_MISMATCH");
  }

  return {
    clientId,
    values: clientBirthDataUpsertRequestSchema.parse(
      birthData === null
        ? {
            label: null,
            birthDate: null,
            birthTime: null,
            birthTimePrecision: "unknown",
            birthPlaceText: null,
            birthCountryCode: null,
            birthCity: null,
            birthRegion: null,
            birthTimezone: null,
            birthTimeDstOccurrence: null,
            birthLatitude: null,
            birthLongitude: null,
            isPrimary: true
          }
        : {
            label: birthData.label,
            birthDate: birthData.birthDate,
            birthTime: birthData.birthTime,
            birthTimePrecision: birthData.birthTimePrecision,
            birthPlaceText: birthData.birthPlaceText,
            birthCountryCode: birthData.birthCountryCode,
            birthCity: birthData.birthCity,
            birthRegion: birthData.birthRegion,
            birthTimezone: birthData.birthTimezone,
            birthTimeDstOccurrence: birthData.birthTimeDstOccurrence,
            birthLatitude: birthData.birthLatitude,
            birthLongitude: birthData.birthLongitude,
            isPrimary: birthData.isPrimary
          }
    )
  };
}

export function reinitializeChartBirthDataDraft(
  current: ChartBirthDataDraft,
  clientId: string,
  birthData: ClientBirthDataResponse | null
): ChartBirthDataDraft {
  return current.clientId === clientId ? current : createChartBirthDataDraft(clientId, birthData);
}

export function updateChartBirthDataDraft(
  current: ChartBirthDataDraft,
  patch: Partial<ClientBirthDataUpsertRequest>
): ChartBirthDataDraft {
  const civilChanged = civilFieldChanged(current.values, patch);
  const next = {
    ...current.values,
    ...patch,
    ...(civilChanged ? { birthTimeDstOccurrence: null } : {}),
    ...(patch.birthTimePrecision === "unknown"
      ? { birthTime: null, birthTimeDstOccurrence: null }
      : {})
  };

  return {
    clientId: current.clientId,
    values: clientBirthDataUpsertRequestSchema.parse(next)
  };
}

export function toBirthDataUpsertRequest(
  draft: ChartBirthDataDraft,
  submitClientId: string
): ClientBirthDataUpsertRequest {
  if (draft.clientId !== submitClientId) {
    throw new Error("CHART_BIRTH_DATA_DRAFT_CLIENT_MISMATCH");
  }
  return clientBirthDataUpsertRequestSchema.parse(draft.values);
}

function civilFieldChanged(
  current: ClientBirthDataUpsertRequest,
  patch: Partial<ClientBirthDataUpsertRequest>
): boolean {
  return (["birthDate", "birthTime", "birthTimePrecision", "birthTimezone"] as const).some(
    (key) => patch[key] !== undefined && patch[key] !== current[key]
  );
}
