import {
  createNumerologyCalculationRequestSchema,
  previewNumerologyRequestSchema,
  type CreateNumerologyCalculationRequest,
  type NumerologyParticipantRequest,
  type PreviewNumerologyRequest
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
  const common = {
    methodCode: "pythagorean" as const,
    title: state.title.trim(),
    periodRequest: toPeriodRequest(state.forecastDate)
  };
  const request =
    state.mode === "individual"
      ? {
          ...common,
          mode: "individual" as const,
          participants: [toParticipantRequest(state.subject, "subject")] as const
        }
      : {
          ...common,
          mode: "compatibility" as const,
          participants: [
            toParticipantRequest(state.subject, "subject"),
            toParticipantRequest(state.partner, "partner")
          ] as const
        };
  return createNumerologyCalculationRequestSchema.parse(
    request
  ) as CreateNumerologyCalculationRequest;
}

export function toPreviewNumerologyRequest(state: NumerologyFormState): PreviewNumerologyRequest {
  const persisted = toCreateNumerologyRequest(state) as unknown as Record<string, unknown>;
  const request = { ...persisted };
  delete request.title;
  return previewNumerologyRequestSchema.parse(request) as PreviewNumerologyRequest;
}

function toParticipantRequest(
  participant: NumerologyParticipantFormState,
  role: "subject" | "partner"
): NumerologyParticipantRequest {
  if (participant.source === "crm_client") {
    return { role, source: "crm_client", clientId: participant.clientId.trim() };
  }
  const calculationName = participant.fullName.trim();
  return {
    role,
    source: "manual",
    clientId: null,
    displayName: participant.displayName.trim() || calculationName,
    calculationName,
    calculationNameSource: "manual_entry",
    birthDate: participant.birthDate
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
  if (participant.source === "crm_client") return;
  if (!participant.fullName.trim()) errors.push(`${label}: введите полное имя`);
  if (!participant.birthDate.trim()) errors.push(`${label}: укажите дату рождения`);
}

function toPeriodRequest(
  forecastDate: string
): CreateNumerologyCalculationRequest["periodRequest"] {
  if (!forecastDate) return { kind: "current_year" };
  const year = Number(forecastDate.slice(0, 4));
  return {
    kind: "explicit",
    personalYear: { year },
    personalMonths: { year },
    personalDay: { date: forecastDate }
  };
}
