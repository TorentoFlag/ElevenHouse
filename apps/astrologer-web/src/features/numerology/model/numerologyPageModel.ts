import {
  numerologyCalculationResponseSchema,
  numerologyResultSchema,
  type CalculationInterpretationResponse,
  type CalculationRecordResponse,
  type NumerologyCalculationResponse,
  type NumerologyResult
} from "@elevenhouse/contracts";
import {
  canLinkCalculation,
  canPublishCalculation,
  getFirstLinkableClientId,
  hasApprovedCurrentInterpretation,
  isCalculationLinked
} from "../../calculations/model/calculationStatus";
import {
  formatBirthDate,
  getClientInitials,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";
import {
  createInitialNumerologyForm,
  createParticipantFormState,
  getNumerologyCalculationTitle,
  type NumerologyFormState,
  type NumerologyParticipantFormState
} from "./numerologyFormModel";
import { getNumerologyInterpretationState } from "./numerologyInterpretationModel";
import {
  buildNumerologyWorkspaceModel,
  getNumerologyDetail,
  type NumerologyWorkspaceModel,
  type NumerologyWorkspaceParticipant
} from "./numerologyWorkspaceModel";

export type NumerologyPageViewModel = {
  readonly calculation: CalculationRecordResponse | null;
  readonly linkableClientId: string | null;
  readonly isCalculationLinked: boolean;
  readonly linkDisabled: boolean;
  readonly publishDisabled: boolean;
  readonly publishDisabledReason: string | undefined;
  readonly isClientSelectionDisabled: boolean;
  readonly isApproveInterpretationDisabled: boolean;
  readonly isSaveInterpretationDisabled: boolean;
  readonly isAiDraftDisabled: boolean;
  readonly aiDraftDisabledReason: string | null;
  readonly model: NumerologyWorkspaceModel | null;
  readonly effectiveSelector: string | null;
  readonly detail: ReturnType<typeof getNumerologyDetail>;
  readonly isCompatibility: boolean;
  readonly subject: NumerologyWorkspaceParticipant | null | undefined;
  readonly partner: NumerologyWorkspaceParticipant | null | undefined;
  readonly selectedSubjectClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
};

export function buildNumerologyPageViewModel(
  selectedResponse: NumerologyCalculationResponse | null,
  previewResult: NumerologyResult | null,
  formState: NumerologyFormState,
  selectedDetailSelector: string | null,
  interpretationText: string,
  isBusy: boolean
): NumerologyPageViewModel {
  const calculation = selectedResponse?.calculation ?? null;
  const linkableClientId = getFirstLinkableClientId(calculation) ?? firstCrmClientId(formState);
  const interpretationState = getNumerologyInterpretationState(
    calculation,
    interpretationText,
    isBusy
  );
  const model = buildNumerologyWorkspaceModel(selectedResponse, previewResult, formState);
  const effectiveSelector = selectedDetailSelector ?? model?.defaultSelector ?? null;
  const detail = getNumerologyDetail(model, effectiveSelector);
  const isCompatibility = model?.mode === "compatibility";

  return {
    calculation,
    linkableClientId,
    isCalculationLinked: isCalculationLinked(calculation),
    linkDisabled:
      isBusy ||
      !linkableClientId ||
      (!previewResult && (!canLinkCalculation(calculation) || isCalculationLinked(calculation))),
    publishDisabled: !canPublishCalculation(calculation) || isBusy,
    publishDisabledReason: getPublishDisabledReason(calculation, isBusy),
    isClientSelectionDisabled: isBusy,
    isApproveInterpretationDisabled: interpretationState.approveDisabled,
    isSaveInterpretationDisabled: interpretationState.saveDisabled,
    isAiDraftDisabled: interpretationState.aiDisabled,
    aiDraftDisabledReason: interpretationState.aiDisabledReason,
    model,
    effectiveSelector,
    detail,
    isCompatibility,
    subject: model?.subject,
    partner: model?.partner,
    selectedSubjectClient: toClientOptionFromParticipant(model?.subject),
    selectedPartnerClient: toClientOptionFromParticipant(model?.partner)
  };
}

export const getCalculationTitle = getNumerologyCalculationTitle;

export function getCurrentInterpretation(
  calculation: CalculationRecordResponse | null
): CalculationInterpretationResponse | null {
  return calculation?.interpretations.at(-1) ?? null;
}

function getPublishDisabledReason(
  calculation: CalculationRecordResponse | null,
  isBusy: boolean
): string | undefined {
  if (!calculation) return "Сначала привяжите расчет к клиенту";
  if (isBusy) return "Действие выполняется";
  if (calculation.status === "archived") return "Архивный расчет нельзя публиковать";
  if (!isCalculationLinked(calculation)) return "Сначала привяжите расчет к клиенту";
  if (!hasApprovedCurrentInterpretation(calculation)) return "Нужна утвержденная трактовка";
  return undefined;
}

export function toNumerologyResponse(
  calculation: CalculationRecordResponse
): NumerologyCalculationResponse {
  return numerologyCalculationResponseSchema.parse({
    calculation,
    result: numerologyResultSchema.parse(calculation.resultData)
  });
}

export function toNumerologyFormState(
  response: NumerologyCalculationResponse
): NumerologyFormState {
  const input = asRecord(response.calculation.inputData);
  const inputParticipants = Array.isArray(input?.participants) ? input.participants : [];
  const participantByRole = (role: "subject" | "partner") =>
    inputParticipants.map(asRecord).find((participant) => participant?.role === role) ?? null;
  const periodData = asRecord(input?.periods);
  const personalDay = asRecord(periodData?.personalDay);

  return {
    ...createInitialNumerologyForm(),
    mode: response.calculation.mode,
    title: response.calculation.title,
    subject: toParticipantFormState(response, "subject", participantByRole("subject")),
    partner: toParticipantFormState(response, "partner", participantByRole("partner")),
    forecastDate: typeof personalDay?.date === "string" ? personalDay.date : ""
  };
}

function toParticipantFormState(
  response: NumerologyCalculationResponse,
  role: "subject" | "partner",
  input: Record<string, unknown> | null
): NumerologyParticipantFormState {
  const saved = response.calculation.participants.find((participant) => participant.role === role);
  if (!saved) return createParticipantFormState("manual");
  const calculationName = typeof input?.calculationName === "string" ? input.calculationName : "";
  const birthDate = typeof input?.birthDate === "string" ? input.birthDate : "";
  return {
    ...createParticipantFormState(saved.source),
    source: saved.source,
    clientId: saved.clientId ?? "",
    displayName: saved.displayName,
    fullName: calculationName || saved.displayName,
    birthDate
  };
}

function firstCrmClientId(state: NumerologyFormState): string | null {
  return (
    [state.subject, state.partner].find(
      (participant) => participant.source === "crm_client" && participant.clientId
    )?.clientId ?? null
  );
}

function toClientOptionFromParticipant(
  participant: NumerologyWorkspaceParticipant | null | undefined
): ClientSelectOption | null {
  if (!participant?.clientId) return null;
  const birthDateDisplay = formatBirthDate(participant.birthDate);
  return {
    value: participant.clientId,
    label: participant.displayName,
    initials: participant.initials || getClientInitials(participant.displayName),
    subtitle: birthDateDisplay || participant.birthDate || "Дата рождения не заполнена",
    birthDateDisplay: birthDateDisplay || "—",
    hasBirthDate: Boolean(participant.birthDate),
    birthData: null
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
