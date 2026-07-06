import {
  createNumerologyCalculationRequestSchema,
  type CreateNumerologyCalculationRequest
} from "@elevenhouse/contracts";

export type NumerologyParticipantFormState = {
  readonly source: "manual" | "crm_client";
  readonly clientId: string;
  readonly displayName: string;
  readonly fullName: string;
  readonly birthDate: string;
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
    birthDate: ""
  };
}

export function getNumerologyFormErrors(state: NumerologyFormState): readonly string[] {
  const errors: string[] = [];
  if (!state.title.trim()) errors.push("Введите название расчета");
  addParticipantErrors(errors, state.subject, "Клиент");

  if (state.mode === "compatibility") {
    addParticipantErrors(errors, state.partner, "Партнер");
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
    birthDate: participant.birthDate
  };
}

function addParticipantErrors(
  errors: string[],
  participant: NumerologyParticipantFormState,
  label: string
): void {
  if (participant.source === "crm_client" && !participant.clientId.trim()) {
    errors.push(`${label}: выберите CRM-клиента`);
  }
  if (!participant.fullName.trim()) errors.push(`${label}: введите полное имя`);
  if (!participant.birthDate.trim()) errors.push(`${label}: укажите дату рождения`);
}
