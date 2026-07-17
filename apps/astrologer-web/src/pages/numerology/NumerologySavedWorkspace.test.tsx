import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { Popover } from "@elevenhouse/design-system/components/Popover";
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
import { renderNumerologyCalculationMenu } from "./NumerologyCalculationMenu";

describe("Numerology saved workspace components", () => {
  it("anchors the calculations popover to the trigger's left edge", () => {
    const css = readFileSync(
      new URL("./NumerologySavedWorkspace.module.css", import.meta.url),
      "utf8"
    );
    const popoverRule = css.match(/\.calculationPopover\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(popoverRule).toContain("left: 0;");
    expect(popoverRule).not.toContain("right: 0;");
  });

  it("lists saved calculations, marks the current one and opens selected records", () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onRecalculate = vi.fn();
    const onArchive = vi.fn();
    const view = renderNumerologyCalculationMenu({
      items: [savedItem("11111111-1111-4111-8111-111111111111", "Антон Голубев")],
      selectedCalculationId: "11111111-1111-4111-8111-111111111111",
      disabled: false,
      onSelect,
      onCreate,
      onRecalculate,
      onArchive,
      isOpen: true,
      onOpenChange: vi.fn()
    });
    const popover = findRequiredElementByType(view, Popover);
    const content = findRequiredElementByType<{
      align?: string;
      role?: string;
      "aria-labelledby"?: string;
    }>(view, Popover.Content);
    const trigger = findRequiredElementByType<{ "aria-label"?: string }>(view, Popover.Trigger);
    const savedButton = findButton(view, "Антон Голубев");

    expect(popover).toBeDefined();
    expect(content.props.align).toBe("start");
    expect(content.props.role).toBe("group");
    expect(content.props["aria-labelledby"]).toBe("saved-calculations-title");
    expect(trigger.props["aria-label"]).toBe("Список расчётов");
    expect(savedButton.props["aria-current"]).toBe("true");
    expect((savedButton.props as { role?: string }).role).toBeUndefined();
    expect(
      findElements(view).some(
        (element) =>
          (element.props as { role?: string }).role === "listitem" &&
          elementIncludesText(element, "Антон Голубев")
      )
    ).toBe(true);
    savedButton.props.onClick?.();
    findButton(view, "Новый расчёт").props.onClick?.();
    findButton(view, "Пересчитать").props.onClick?.();
    findButton(view, "Удалить расчёт").props.onClick?.();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111" })
    );
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onRecalculate).toHaveBeenCalledOnce();
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("renders manual individual fields and a preview action", () => {
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
    expect(
      findElements(view).some(
        (element) =>
          element.type === "input" &&
          (element.props as { "aria-label"?: string })["aria-label"] === "Название расчёта"
      )
    ).toBe(false);
    findButton(view, "Рассчитать").props.onClick?.();
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

  it("uses a shared modal for explicit delete confirmation", () => {
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

    expect(modal.props.title).toBe("Удалить расчёт?");
    expect(
      elementIncludesText(
        view,
        "«Антон Голубев, психоматрица» исчезнет из рабочего пространства. Восстановить его через интерфейс не получится."
      )
    ).toBe(true);
    findButton(view, "Удалить").props.onClick?.();
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

    expect(findButton(editorView, "Расчёт…").props.disabled).toBe(true);
    expect(findButton(archiveView, "Удаление…").props.disabled).toBe(true);
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
