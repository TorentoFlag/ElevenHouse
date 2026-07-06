import {
  createNumerologyCalculationRequestSchema,
  numerologyCalculationResponseSchema,
  type CalculationInterpretationResponse,
  type CalculationRecordResponse,
  type CreateNumerologyCalculationRequest,
  type NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import {
  canLinkCalculation,
  canPublishCalculation,
  getFirstLinkableClientId,
  getLatestCalculationVersion,
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
  type NumerologyFormState
} from "./numerologyFormModel";
import {
  buildNumerologyWorkspaceModel,
  getNumerologyDetail,
  type NumerologyWorkspaceModel,
  type NumerologyWorkspaceParticipant
} from "./numerologyWorkspaceModel";

export type NumerologyPageViewModel = {
  readonly calculation: CalculationRecordResponse | null;
  readonly latestVersion: CalculationRecordResponse["versions"][number] | null;
  readonly linkableClientId: string | null;
  readonly isCalculationLinked: boolean;
  readonly linkDisabled: boolean;
  readonly publishDisabled: boolean;
  readonly publishDisabledReason: string | undefined;
  readonly isRecalculateDisabled: boolean;
  readonly isClientSelectionDisabled: boolean;
  readonly isApproveInterpretationDisabled: boolean;
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
  selectedDetailSelector: string | null,
  isBusy: boolean
): NumerologyPageViewModel {
  const calculation = selectedResponse?.calculation ?? null;
  const latestVersion = calculation ? getLatestCalculationVersion(calculation) : null;
  const linkableClientId = getFirstLinkableClientId(calculation);
  const currentVersionInterpretation = getCurrentVersionInterpretation(calculation);
  const model = buildNumerologyWorkspaceModel(selectedResponse);
  const effectiveSelector = selectedDetailSelector ?? model?.defaultSelector ?? null;
  const detail = getNumerologyDetail(model, effectiveSelector);
  const isCompatibility = model?.mode === "compatibility";
  const subject = model?.subject;
  const partner = model?.partner;

  return {
    calculation,
    latestVersion,
    linkableClientId,
    isCalculationLinked: isCalculationLinked(calculation),
    linkDisabled: !canLinkCalculation(calculation) || isCalculationLinked(calculation) || isBusy,
    publishDisabled: !canPublishCalculation(calculation) || isBusy,
    publishDisabledReason: getPublishDisabledReason(calculation, isBusy),
    isRecalculateDisabled: !model || isBusy,
    isClientSelectionDisabled: isBusy,
    isApproveInterpretationDisabled:
      !currentVersionInterpretation || currentVersionInterpretation.status === "approved" || isBusy,
    model,
    effectiveSelector,
    detail,
    isCompatibility,
    subject,
    partner,
    selectedSubjectClient: toClientOptionFromParticipant(subject),
    selectedPartnerClient: toClientOptionFromParticipant(partner)
  };
}

export function getCalculationTitle(state: NumerologyFormState): string {
  const subjectName = state.subject.displayName || "Клиент";
  if (state.mode === "compatibility") {
    const partnerName = state.partner.displayName || "Партнер";

    return `${subjectName} + ${partnerName}, совместимость`;
  }

  return `${subjectName}, психоматрица`;
}

export function getCurrentVersionInterpretation(
  calculation: CalculationRecordResponse | null
): CalculationInterpretationResponse | null {
  const currentVersion = calculation ? getLatestCalculationVersion(calculation) : null;
  if (!calculation || !currentVersion) return null;

  return (
    [...calculation.interpretations]
      .reverse()
      .find((interpretation) => interpretation.versionId === currentVersion.id) ?? null
  );
}

function getPublishDisabledReason(
  calculation: CalculationRecordResponse | null,
  isBusy: boolean
): string | undefined {
  if (!calculation) return "Создайте или выберите расчет";
  if (isBusy) return "Действие выполняется";
  if (calculation.status === "archived") return "Архивный расчет нельзя публиковать";
  if (!isCalculationLinked(calculation)) return "Сначала привяжите расчет к клиенту";
  if (!hasApprovedCurrentInterpretation(calculation)) return "Нужна утвержденная трактовка";

  return undefined;
}

export function toNumerologyResponse(
  calculation: CalculationRecordResponse
): NumerologyCalculationResponse {
  const currentVersion = getLatestCalculationVersion(calculation);
  if (!currentVersion) {
    throw new Error("Calculation has no versions");
  }

  return numerologyCalculationResponseSchema.parse({
    calculation,
    currentVersion,
    resultSnapshot: currentVersion.resultSnapshot,
    settingsSnapshot: currentVersion.settingsSnapshot,
    inputSnapshot: currentVersion.inputSnapshot
  });
}

export function toNumerologyFormState(
  response: NumerologyCalculationResponse
): NumerologyFormState {
  const parsed = createNumerologyCalculationRequestSchema.safeParse(response.inputSnapshot);
  if (!parsed.success) return createInitialNumerologyForm();

  const subject = parsed.data.participants.find((participant) => participant.role === "subject");
  const partner = parsed.data.participants.find((participant) => participant.role === "partner");

  return {
    mode: parsed.data.mode,
    title: parsed.data.title,
    subject: subject ? toParticipantFormState(subject) : createParticipantFormState("manual"),
    partner: partner ? toParticipantFormState(partner) : createParticipantFormState("manual"),
    includeNameNumbers: parsed.data.settings.includeNameNumbers,
    includePsychomatrix: parsed.data.settings.includePsychomatrix,
    includeStrengthLines: parsed.data.settings.includeStrengthLines,
    forecastDate: parsed.data.settings.forecastDate ?? ""
  };
}

function toParticipantFormState(
  participant: CreateNumerologyCalculationRequest["participants"][number]
) {
  return {
    source: participant.source,
    clientId: participant.clientId ?? "",
    displayName: participant.displayName ?? "",
    fullName: participant.fullName ?? "",
    birthDate: participant.birthDate ?? "",
    birthTime: participant.birthTime ?? "",
    birthTimePrecision: participant.birthTimePrecision ?? "unknown",
    birthPlaceText: participant.birthPlaceText ?? "",
    birthCountryCode: participant.birthCountryCode ?? "",
    birthCity: participant.birthCity ?? "",
    birthRegion: participant.birthRegion ?? "",
    birthTimezone: participant.birthTimezone ?? "",
    birthLatitude: participant.birthLatitude ?? null,
    birthLongitude: participant.birthLongitude ?? null
  };
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
