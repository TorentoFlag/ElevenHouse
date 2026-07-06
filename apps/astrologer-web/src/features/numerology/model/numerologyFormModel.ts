import {
  createNumerologyCalculationRequestSchema,
  type CreateNumerologyCalculationRequest
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";

export type NumerologyParticipantFormState = {
  readonly source: "manual" | "crm_client";
  readonly clientId: string;
  readonly displayName: string;
  readonly fullName: string;
  readonly birthDate: string;
  readonly birthTime: string;
  readonly birthTimePrecision: "exact" | "approximate" | "unknown";
  readonly birthPlaceText: string;
  readonly birthCountryCode: string;
  readonly birthCity: string;
  readonly birthRegion: string;
  readonly birthTimezone: string;
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
};

export type NumerologyFormState = {
  readonly mode: "individual" | "compatibility";
  readonly title: string;
  readonly subject: NumerologyParticipantFormState;
  readonly partner: NumerologyParticipantFormState;
  readonly includeNameNumbers: boolean;
  readonly includePsychomatrix: boolean;
  readonly includeStrengthLines: boolean;
  readonly forecastDate: string;
};

export function createInitialNumerologyForm(): NumerologyFormState {
  return {
    mode: "individual",
    title: "",
    subject: createParticipantFormState("manual"),
    partner: createParticipantFormState("manual"),
    includeNameNumbers: true,
    includePsychomatrix: true,
    includeStrengthLines: true,
    forecastDate: ""
  };
}

export function createParticipantFormState(
  source: NumerologyParticipantFormState["source"]
): NumerologyParticipantFormState {
  return {
    source,
    clientId: "",
    displayName: "",
    fullName: "",
    birthDate: "",
    birthTime: "",
    birthTimePrecision: "unknown",
    birthPlaceText: "",
    birthCountryCode: "",
    birthCity: "",
    birthRegion: "",
    birthTimezone: "",
    birthLatitude: null,
    birthLongitude: null
  };
}

export function toClientParticipantFormState(
  option: ClientSelectOption,
  previous: NumerologyParticipantFormState
): NumerologyParticipantFormState {
  const birthData = option.birthData;

  return {
    ...previous,
    source: "crm_client",
    clientId: option.value,
    displayName: option.label,
    fullName: option.label,
    birthDate: birthData?.birthDate ?? "",
    birthTime: birthData?.birthTime ?? "",
    birthTimePrecision: birthData?.birthTimePrecision ?? "unknown",
    birthPlaceText: birthData?.birthPlaceText ?? "",
    birthCountryCode: birthData?.birthCountryCode ?? "",
    birthCity: birthData?.birthCity ?? "",
    birthRegion: birthData?.birthRegion ?? "",
    birthTimezone: birthData?.birthTimezone ?? "",
    birthLatitude: birthData?.birthLatitude ?? null,
    birthLongitude: birthData?.birthLongitude ?? null
  };
}

export function getNumerologyFormErrors(state: NumerologyFormState): readonly string[] {
  const errors: string[] = [];
  if (!state.title.trim()) errors.push("Введите название расчета");
  addParticipantErrors(errors, state.subject, "Клиент");

  if (state.mode === "compatibility") {
    addParticipantErrors(errors, state.partner, "Партнер");
    if (
      state.subject.source === "crm_client" &&
      state.partner.source === "crm_client" &&
      state.subject.clientId &&
      state.subject.clientId === state.partner.clientId
    ) {
      errors.push("Клиент и партнер должны быть разными");
    }
  }

  return errors;
}

export function toCreateNumerologyRequest(
  state: NumerologyFormState
): CreateNumerologyCalculationRequest {
  const request = {
    mode: state.mode,
    methodCode: "pythagorean",
    title: state.title.trim(),
    participants:
      state.mode === "individual"
        ? [toParticipantRequest(state.subject, "subject")]
        : [
            toParticipantRequest(state.subject, "subject"),
            toParticipantRequest(state.partner, "partner")
          ],
    settings: {
      masterNumbers: { mode: "preserve_selected", values: [11, 22, 33] },
      nameNormalization: { yoPolicy: "separate", shortIPolicy: "as_i" },
      includeNameNumbers: state.includeNameNumbers,
      includePsychomatrix: state.includePsychomatrix,
      includeStrengthLines: state.includeStrengthLines,
      ...(state.forecastDate ? { forecastDate: state.forecastDate } : {})
    }
  } satisfies CreateNumerologyCalculationRequest;

  return createNumerologyCalculationRequestSchema.parse(request);
}

function toParticipantRequest(
  participant: NumerologyParticipantFormState,
  role: "subject" | "partner"
): CreateNumerologyCalculationRequest["participants"][number] {
  return {
    role,
    source: participant.source,
    clientId: participant.source === "crm_client" ? participant.clientId.trim() : null,
    displayName: participant.displayName.trim() || participant.fullName.trim(),
    fullName: participant.fullName.trim(),
    birthDate: participant.birthDate,
    ...(participant.birthTime ? { birthTime: participant.birthTime } : {}),
    birthTimePrecision: participant.birthTimePrecision,
    ...(participant.birthPlaceText ? { birthPlaceText: participant.birthPlaceText.trim() } : {}),
    ...(participant.birthCountryCode
      ? { birthCountryCode: participant.birthCountryCode.trim().toUpperCase() }
      : {}),
    ...(participant.birthCity ? { birthCity: participant.birthCity.trim() } : {}),
    ...(participant.birthRegion ? { birthRegion: participant.birthRegion.trim() } : {}),
    ...(participant.birthTimezone ? { birthTimezone: participant.birthTimezone.trim() } : {}),
    ...(participant.birthLatitude !== null ? { birthLatitude: participant.birthLatitude } : {}),
    ...(participant.birthLongitude !== null ? { birthLongitude: participant.birthLongitude } : {})
  };
}

function addParticipantErrors(
  errors: string[],
  participant: NumerologyParticipantFormState,
  label: string
): void {
  if (participant.source === "crm_client" && !participant.clientId.trim()) {
    errors.push(`${label}: выберите клиента`);
    return;
  }
  if (
    participant.source === "crm_client" &&
    participant.clientId.trim() &&
    !participant.birthDate.trim()
  ) {
    errors.push(`${label}: у выбранного клиента нет даты рождения`);
    return;
  }
  if (!participant.fullName.trim()) errors.push(`${label}: введите полное имя`);
  if (!participant.birthDate.trim()) errors.push(`${label}: укажите дату рождения`);
}
