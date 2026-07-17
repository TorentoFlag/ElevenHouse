// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { NumerologyInterpretationEditor } from "./NumerologyInterpretationEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("NumerologyInterpretationEditor", () => {
  it("keeps the expanded disclosure compact and opens the editor without creating AI text", () => {
    const onCreateAiDraft = vi.fn();
    const container = renderEditor({ onCreateAiDraft });

    expect(container.querySelector("textarea")).toBeNull();
    act(() => getDisclosure(container).click());
    expect(container.querySelector("textarea")).toBeNull();

    const expandButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Открыть редактор трактовки"]'
    );
    expect(expandButton).not.toBeNull();
    expect(expandButton?.getAttribute("aria-haspopup")).toBe("dialog");

    act(() => expandButton?.click());
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector("textarea")).not.toBeNull();
    expect(onCreateAiDraft).not.toHaveBeenCalled();
  });

  it("opens from AI, edits the parent-owned text, retains it across close and invokes modal actions", () => {
    const onCreateAiDraft = vi.fn();
    const onTextChange = vi.fn();
    const onSave = vi.fn();
    const onApprove = vi.fn();
    const container = renderEditor({ onCreateAiDraft, onTextChange, onSave, onApprove });

    act(() => getDisclosure(container).click());
    act(() => getButtonByText(container, "Создать AI-черновик").click());
    expect(onCreateAiDraft).toHaveBeenCalledOnce();

    const textarea = document.body.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();
    act(() => setTextareaValue(textarea!, "Новый текст"));
    expect(onTextChange).toHaveBeenLastCalledWith("Новый текст");

    act(() =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="Закрыть редактор трактовки"]')
        ?.click()
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Открыть редактор трактовки"]')
        ?.click()
    );
    expect(document.body.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Новый текст"
    );

    act(() => getButtonByText(document.body, "Сохранить черновик").click());
    act(() => getButtonByText(document.body, "Утвердить").click());
    expect(onSave).toHaveBeenCalledOnce();
    expect(onApprove).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("renders supplied English copy", () => {
    const container = renderEditor({
      copy: astrologerCopyByLocale.en.numerology.interpretation,
      placeholder: astrologerCopyByLocale.en.numerology.interpretation.individualPlaceholder
    });

    expect(container.textContent).toContain("AI portrait interpretation");
    act(() => getDisclosure(container).click());
    expect(container.textContent).toContain("Create AI draft");
    expect(
      container.querySelector('[aria-label="Open interpretation editor"]')
    ).not.toBeNull();
  });
});

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof NumerologyInterpretationEditor>> = {}
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  function Harness() {
    const [text, setText] = useState("Черновик");
    return (
      <NumerologyInterpretationEditor
        copy={astrologerCopyByLocale.ru.numerology.interpretation}
        text={text}
        placeholder="Введите трактовку"
        isCreatingAiDraft={false}
        aiDraftErrorMessage={null}
        aiDraftDisabled={false}
        aiDraftDisabledReason={null}
        saveDisabled={false}
        approveDisabled={false}
        {...overrides}
        onTextChange={(value) => {
          setText(value);
          overrides.onTextChange?.(value);
        }}
        onCreateAiDraft={overrides.onCreateAiDraft ?? vi.fn()}
        onSave={overrides.onSave ?? vi.fn()}
        onApprove={overrides.onApprove ?? vi.fn()}
      />
    );
  }

  act(() => root?.render(<Harness />));
  return container;
}

function getDisclosure(container: ParentNode): HTMLButtonElement {
  const disclosure = container.querySelector<HTMLButtonElement>('[aria-expanded="false"]');
  if (!disclosure) throw new Error("Expected a closed interpretation disclosure");
  return disclosure;
}

function getButtonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );
  if (!button) throw new Error(`Expected button ${text}`);
  return button;
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
