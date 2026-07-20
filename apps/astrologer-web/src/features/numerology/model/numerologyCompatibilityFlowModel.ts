import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import {
  formatBirthDate,
  getClientInitials,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";
import {
  createParticipantFormState,
  toClientParticipantFormState,
  type NumerologyFormState,
  type NumerologyParticipantFormState
} from "./numerologyFormModel";
import { getCalculationTitle } from "./numerologyPageModel";

export function getFirstCompatibilityPartner(
  clients: readonly ClientSelectOption[],
  subjectClientId: string
): ClientSelectOption | null {
  return clients.find((client) => client.value !== subjectClientId && client.hasBirthDate) ?? null;
}

export function buildCompatibilityFormState(
  currentState: NumerologyFormState,
  subject: ClientSelectOption,
  partner: ClientSelectOption
): NumerologyFormState {
  const nextStateBase = {
    ...currentState,
    mode: "compatibility" as const,
    subject: toClientParticipantFormState(subject, currentState.subject),
    partner: toClientParticipantFormState(partner, currentState.partner)
  };

  return {
    ...nextStateBase,
    title: getCalculationTitle(nextStateBase)
  };
}

export function buildIndividualFormState(
  currentState: NumerologyFormState,
  subject: ClientSelectOption
): NumerologyFormState {
  const nextStateBase = {
    ...currentState,
    mode: "individual" as const,
    subject: toClientParticipantFormState(subject, currentState.subject),
    partner: createParticipantFormState("manual")
  };

  return {
    ...nextStateBase,
    title: getCalculationTitle(nextStateBase)
  };
}

export function findExistingCalculationForParticipants(
  calculations: readonly CalculationRecordResponse[],
  input: {
    readonly mode: "individual" | "compatibility";
    readonly subjectClientId: string;
    readonly partnerClientId?: string;
  }
): CalculationRecordResponse | null {
  return (
    calculations.find((calculation) => {
      if (calculation.module !== "numerology" || calculation.mode !== input.mode) return false;
      const subject = calculation.participants.find(
        (participant) => participant.role === "subject"
      );
      if (subject?.clientId !== input.subjectClientId) return false;
      if (input.mode === "individual") return true;

      const partner = calculation.participants.find(
        (participant) => participant.role === "partner"
      );
      return partner?.clientId === input.partnerClientId;
    }) ?? null
  );
}

export function toClientOptionFromNumerologyParticipant(
  participant: NumerologyParticipantFormState
): ClientSelectOption | null {
  if (participant.source !== "crm_client" || !participant.clientId.trim()) return null;

  const label = participant.displayName.trim() || participant.fullName.trim();
  if (!label) return null;

  const birthDateDisplay = formatBirthDate(participant.birthDate);

  return {
    value: participant.clientId,
    label,
    initials: getClientInitials(label),
    subtitle:
      [birthDateDisplay || participant.birthDate, participant.birthPlaceText]
        .filter(Boolean)
        .join(" · ") || "Дата рождения не заполнена",
    birthDateDisplay: birthDateDisplay || "—",
    hasBirthDate: Boolean(participant.birthDate),
    birthData: {
      id: "00000000-0000-4000-8000-000000000000",
      clientUserId: participant.clientId,
      label: null,
      birthDate: participant.birthDate || null,
      birthTime: participant.birthTime || null,
      birthTimePrecision: participant.birthTimePrecision,
      birthPlaceText: participant.birthPlaceText || null,
      birthCountryCode: participant.birthCountryCode || null,
      birthCity: participant.birthCity || null,
      birthRegion: participant.birthRegion || null,
      birthTimezone: participant.birthTimezone || null,
      birthTimeDstOccurrence: null,
      birthLatitude: participant.birthLatitude,
      birthLongitude: participant.birthLongitude,
      source: "manual",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z"
    }
  };
}
