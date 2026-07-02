import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDialogKeyDown } from "./handleDialogKeyDown.js";

describe("handleDialogKeyDown", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes the dialog and stops propagation on Escape", () => {
    const onClose = vi.fn();
    const event = createKeyboardEvent({ key: "Escape" });

    handleDialogKeyDown(event, onClose);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("prevents Tab from leaving a dialog without focusable controls", () => {
    const event = createKeyboardEvent({ key: "Tab", focusableElements: [] });

    handleDialogKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("moves focus from the first control to the last control on Shift+Tab", () => {
    const firstElement = createElement();
    const lastElement = createElement();
    vi.stubGlobal("document", { activeElement: firstElement });
    const event = createKeyboardEvent({
      key: "Tab",
      shiftKey: true,
      focusableElements: [firstElement, lastElement]
    });

    handleDialogKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(lastElement.focus).toHaveBeenCalledTimes(1);
  });

  it("moves focus from the last control to the first control on Tab", () => {
    const firstElement = createElement();
    const lastElement = createElement();
    vi.stubGlobal("document", { activeElement: lastElement });
    const event = createKeyboardEvent({
      key: "Tab",
      focusableElements: [firstElement, lastElement]
    });

    handleDialogKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(firstElement.focus).toHaveBeenCalledTimes(1);
  });
});

function createKeyboardEvent({
  key,
  shiftKey = false,
  focusableElements = []
}: {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly focusableElements?: readonly ReturnType<typeof createElement>[];
}) {
  return {
    key,
    shiftKey,
    currentTarget: {
      querySelectorAll: vi.fn(() => focusableElements)
    } as unknown as HTMLElement,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  };
}

function createElement() {
  return {
    focus: vi.fn(),
    getAttribute: vi.fn(() => null),
    hasAttribute: vi.fn(() => false)
  };
}
