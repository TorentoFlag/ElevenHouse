import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialPhoneInputState } from "../helpers/phoneInputModel";
import { useAuthFocusAutomation } from "./useAuthFocusAutomation";

let cleanup: (() => void) | undefined;
let internalRefs: Array<{ current: ReturnType<typeof setTimeout> | null }>;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    cleanup = effect() ?? undefined;
  },
  useRef: (initialValue: ReturnType<typeof setTimeout> | null) => {
    const ref = { current: initialValue };
    internalRefs.push(ref);
    return ref;
  }
}));

describe("useAuthFocusAutomation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    internalRefs = [];
    cleanup = undefined;
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("focuses the phone input after a popular registration name", () => {
    const nameInput = createFocusableInput();
    const phoneInput = createFocusableInput();
    const { schedulePhoneFocus } = useAuthFocusAutomation({
      delayMs: 450,
      isRegisterMode: true,
      emailInputRef: { current: createFocusableInput() },
      nameInputRef: { current: nameInput },
      phoneInputRef: { current: phoneInput },
      submitButtonRef: { current: createSubmitButton(false) }
    });
    vi.stubGlobal("document", { activeElement: nameInput });

    schedulePhoneFocus("Анна");
    vi.advanceTimersByTime(450);

    expect(phoneInput.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("clears pending submit focus when the next email is incomplete", () => {
    const emailInput = createFocusableInput();
    const submitButton = createSubmitButton(false);
    const { scheduleSubmitFocus } = useAuthFocusAutomation({
      delayMs: 450,
      isRegisterMode: true,
      emailInputRef: { current: emailInput },
      nameInputRef: { current: createFocusableInput() },
      phoneInputRef: { current: createFocusableInput() },
      submitButtonRef: { current: submitButton }
    });
    vi.stubGlobal("document", { activeElement: emailInput });

    scheduleSubmitFocus("client@example.com");
    scheduleSubmitFocus("client@example.");
    vi.advanceTimersByTime(450);

    expect(submitButton.focus).not.toHaveBeenCalled();
  });

  it("clears pending focus timers on unmount", () => {
    const emailInput = createFocusableInput();
    const submitButton = createSubmitButton(false);
    const { scheduleSubmitFocus } = useAuthFocusAutomation({
      delayMs: 450,
      isRegisterMode: true,
      emailInputRef: { current: emailInput },
      nameInputRef: { current: createFocusableInput() },
      phoneInputRef: { current: createFocusableInput() },
      submitButtonRef: { current: submitButton }
    });
    vi.stubGlobal("document", { activeElement: emailInput });

    scheduleSubmitFocus("client@example.com");
    cleanup?.();
    vi.advanceTimersByTime(450);

    expect(submitButton.focus).not.toHaveBeenCalled();
  });

  it("focuses submit after a valid phone input", () => {
    const phoneInput = createFocusableInput();
    const submitButton = createSubmitButton(false);
    const { scheduleSubmitFocusAfterValidPhone } = useAuthFocusAutomation({
      delayMs: 450,
      isRegisterMode: true,
      emailInputRef: { current: createFocusableInput() },
      nameInputRef: { current: createFocusableInput() },
      phoneInputRef: { current: phoneInput },
      submitButtonRef: { current: submitButton }
    });
    vi.stubGlobal("document", { activeElement: phoneInput });

    scheduleSubmitFocusAfterValidPhone({
      ...createInitialPhoneInputState("RU"),
      displayValue: "+7 999 000-11-22",
      normalizedValue: "+79990001122"
    });
    vi.advanceTimersByTime(450);

    expect(submitButton.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

function createFocusableInput() {
  return {
    focus: vi.fn()
  } as unknown as HTMLInputElement;
}

function createSubmitButton(disabled: boolean) {
  return {
    disabled,
    focus: vi.fn()
  } as unknown as HTMLButtonElement;
}
