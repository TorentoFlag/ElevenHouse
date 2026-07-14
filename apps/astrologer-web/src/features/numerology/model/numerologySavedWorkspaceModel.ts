import type {
  CalculationRecordResponse,
  CreateNumerologyCalculationRequest,
  RecalculateNumerologyCalculationRequest
} from "@elevenhouse/contracts";
import {
  createInitialNumerologyForm,
  createParticipantFormState,
  getNumerologyFormErrors,
  toCreateNumerologyRequest,
  type NumerologyFormState,
  type NumerologyParticipantFormState
} from "./numerologyFormModel";
import { toNumerologyFormState, toNumerologyResponse } from "./numerologyPageModel";

export type NumerologyEditorMode = "create" | "recalculate";

export type NumerologyEditorState = {
  readonly kind: NumerologyEditorMode;
  readonly calculationId: string | null;
  readonly form: NumerologyFormState;
};

export type SavedNumerologyCalculationListItem = {
  readonly calculation: CalculationRecordResponse;
  readonly id: string;
  readonly title: string;
  readonly participantLabel: string;
  readonly modeLabel: string;
  readonly updatedAt: string;
};

export function getActiveNumerologyCalculations(
  calculations: readonly CalculationRecordResponse[]
): readonly CalculationRecordResponse[] {
  return calculations
    .filter(
      (calculation) => calculation.module === "numerology" && calculation.status !== "archived"
    )
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function toSavedCalculationListItem(
  calculation: CalculationRecordResponse
): SavedNumerologyCalculationListItem {
  return {
    calculation,
    id: calculation.id,
    title: calculation.title,
    participantLabel: calculation.participants
      .map((participant) => participant.displayName)
      .join(" + "),
    modeLabel: calculation.mode === "compatibility" ? "Совместимость" : "Личный расчёт",
    updatedAt: calculation.updatedAt
  };
}

export function createNewNumerologyEditorState(): NumerologyEditorState {
  return {
    kind: "create",
    calculationId: null,
    form: createInitialNumerologyForm()
  };
}

export function createRecalculationEditorState(
  calculation: CalculationRecordResponse
): NumerologyEditorState {
  return {
    kind: "recalculate",
    calculationId: calculation.id,
    form: toNumerologyFormState(toNumerologyResponse(calculation))
  };
}

export function updateNumerologyEditorForm(
  editor: NumerologyEditorState,
  patch: Partial<NumerologyFormState>
): NumerologyEditorState {
  return { ...editor, form: { ...editor.form, ...patch } };
}

export function updateNumerologyEditorParticipant(
  editor: NumerologyEditorState,
  participantKey: "subject" | "partner",
  patch: Partial<NumerologyParticipantFormState>
): NumerologyEditorState {
  const current = editor.form[participantKey];
  const base =
    patch.source && patch.source !== current.source
      ? createParticipantFormState(patch.source)
      : current;

  return {
    ...editor,
    form: {
      ...editor.form,
      [participantKey]: { ...base, ...patch }
    }
  };
}

export function getNumerologyEditorErrors(editor: NumerologyEditorState): readonly string[] {
  return getNumerologyFormErrors(editor.form);
}

export function toNumerologyCreateRequest(
  editor: NumerologyEditorState
): CreateNumerologyCalculationRequest {
  return toCreateNumerologyRequest(editor.form);
}

export function toNumerologyRecalculateRequest(
  editor: NumerologyEditorState
): RecalculateNumerologyCalculationRequest {
  return toCreateNumerologyRequest(editor.form) as RecalculateNumerologyCalculationRequest;
}
