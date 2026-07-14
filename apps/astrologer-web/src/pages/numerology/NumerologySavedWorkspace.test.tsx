import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import {
  createNewNumerologyEditorState,
  updateNumerologyEditorForm,
  updateNumerologyEditorParticipant,
  type SavedNumerologyCalculationListItem
} from "../../features/numerology/model/numerologySavedWorkspaceModel";
import { NumerologyArchiveDialog } from "./NumerologyArchiveDialog";
import {
  NumerologyCalculationEditor,
  NumerologyParticipantFields,
  type NumerologyParticipantFieldsProps
} from "./NumerologyCalculationEditor";
import { NumerologyCalculationMenu } from "./NumerologyCalculationMenu";

describe("Numerology saved workspace components", () => {
  it("lists saved calculations, marks the current one and opens selected records", () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const view = NumerologyCalculationMenu({
      items: [savedItem("11111111-1111-4111-8111-111111111111", "Антон Голубев")],
      selectedCalculationId: "11111111-1111-4111-8111-111111111111",
      disabled: false,
      onSelect,
      onCreate
    });
    const savedButton = findButton(view, "Антон Голубев");

    expect(savedButton.props["aria-current"]).toBe("true");
    savedButton.props.onClick?.();
    findButton(view, "Новый расчёт").props.onClick?.();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111" })
    );
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("renders manual individual fields and explicit persistence actions", () => {
    const onParticipantChange = vi.fn();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const editor = updateNumerologyEditorForm(createNewNumerologyEditorState(), {
      title: "Новый расчёт"
    });
    const view = NumerologyCalculationEditor({
      editor,
      errors: [],
      isBusy: false,
      onFormChange: vi.fn(),
      onParticipantChange,
      onSelectClient: vi.fn(),
      onSubmit,
      onCancel
    });

    const participant = findRequiredElementByType<NumerologyParticipantFieldsProps>(
      view,
      NumerologyParticipantFields
    );
    const participantView = NumerologyParticipantFields(participant.props);

    expect(findInput(participantView, "Полное имя клиента")).toBeDefined();
    expect(findInput(participantView, "Дата рождения клиента")).toBeDefined();
    findButton(view, "Рассчитать и сохранить").props.onClick?.();
    findButton(view, "Отмена").props.onClick?.();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders a partner and CRM picker for compatibility", () => {
    let editor = updateNumerologyEditorForm(createNewNumerologyEditorState(), {
      mode: "compatibility"
    });
    editor = updateNumerologyEditorParticipant(editor, "partner", {
      source: "crm_client",
      clientId: "22222222-2222-4222-8222-222222222222",
      displayName: "Яна Кошкина"
    });
    const view = NumerologyCalculationEditor({
      editor,
      errors: [],
      isBusy: false,
      onFormChange: vi.fn(),
      onParticipantChange: vi.fn(),
      onSelectClient: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn()
    });
    const participants = findElements(view).filter(
      (element) => element.type === NumerologyParticipantFields
    ) as ReactElement<NumerologyParticipantFieldsProps>[];
    const partnerView = NumerologyParticipantFields(participants[1]!.props);
    const pickers = findElements(partnerView).filter(
      (element) => element.type === ClientSearchCombobox
    ) as ReactElement<{ label: string }>[];

    expect(pickers.map((picker) => picker.props.label)).toEqual(["Партнер"]);
  });

  it("uses a shared modal for explicit archive confirmation", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const view = NumerologyArchiveDialog({
      calculationTitle: "Антон Голубев, психоматрица",
      isPending: false,
      onConfirm,
      onClose
    });
    const modal = findRequiredElementByType<{
      title: string;
      onClose: () => void;
    }>(view, Modal);

    expect(modal.props.title).toBe("Переместить расчёт в архив?");
    findButton(view, "В архив").props.onClick?.();
    expect(onConfirm).toHaveBeenCalledOnce();
    modal.props.onClose();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables destructive and editor actions while pending", () => {
    const editorView = NumerologyCalculationEditor({
      editor: createNewNumerologyEditorState(),
      errors: [],
      isBusy: true,
      onFormChange: vi.fn(),
      onParticipantChange: vi.fn(),
      onSelectClient: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn()
    });
    const archiveView = NumerologyArchiveDialog({
      calculationTitle: "Расчёт",
      isPending: true,
      onConfirm: vi.fn(),
      onClose: vi.fn()
    });

    expect(findButton(editorView, "Сохранение…").props.disabled).toBe(true);
    expect(findButton(archiveView, "Перемещение…").props.disabled).toBe(true);
  });
});

function savedItem(id: string, title: string): SavedNumerologyCalculationListItem {
  return {
    id,
    title,
    participantLabel: title,
    modeLabel: "Личный расчёт",
    updatedAt: "2026-07-14T10:00:00.000Z",
    calculation: { id } as SavedNumerologyCalculationListItem["calculation"]
  };
}

function findInput(root: ReactElement, ariaLabel: string): ReactElement {
  const result = findElements(root).find(
    (element) =>
      element.type === "input" &&
      (element.props as { "aria-label"?: string })["aria-label"] === ariaLabel
  );
  if (!result) throw new Error(`Input not found: ${ariaLabel}`);
  return result;
}

function findButton(
  root: ReactElement,
  text: string
): ReactElement<{
  disabled?: boolean;
  "aria-current"?: string;
  onClick?: () => void;
}> {
  const result = findElements(root).find(
    (element) => element.type === "button" && elementIncludesText(element, text)
  );
  if (!result) throw new Error(`Button not found: ${text}`);
  return result as ReactElement<{
    disabled?: boolean;
    "aria-current"?: string;
    onClick?: () => void;
  }>;
}

function findRequiredElementByType<TProps>(
  root: ReactElement,
  type: unknown
): ReactElement<TProps> {
  const result = findElements(root).find((element) => element.type === type);
  if (!result) throw new Error("Element not found");
  return result as ReactElement<TProps>;
}

function findElements(root: ReactElement): ReactElement[] {
  const result: ReactElement[] = [root];
  const children = (root.props as { children?: ReactNode }).children;
  for (const child of Children.toArray(children)) {
    if (isValidElement(child)) result.push(...findElements(child));
  }
  return result;
}

function elementIncludesText(element: ReactElement, text: string): boolean {
  return includesText((element.props as { children?: unknown }).children, text);
}

function includesText(value: unknown, text: string): boolean {
  if (typeof value === "string") return value.includes(text);
  if (Array.isArray(value)) return value.some((item) => includesText(item, text));
  if (isValidElement(value)) {
    return includesText((value.props as { children?: unknown }).children, text);
  }
  return false;
}
