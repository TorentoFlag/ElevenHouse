import type { OtpAuthFormValues } from "@elevenhouse/design-system/components/OtpAuthForm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialPhoneInputState } from "../helpers/phoneInputModel";
import { useAuthCredentialInputHandlers } from "./useAuthCredentialInputHandlers";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback
}));

const values = {
  name: "Анна",
  email: "client@example.com",
  phone: ""
} satisfies OtpAuthFormValues;

describe("useAuthCredentialInputHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates phone state and auth values for supported country changes", () => {
    const state = createHandlerState();
    const handlers = useAuthCredentialInputHandlers(state.input);

    handlers.handlePhoneCountryChange("GE");

    expect(state.setPhoneInputState).toHaveBeenCalledWith({
      displayValue: "",
      normalizedValue: "",
      selectedCountry: "GE"
    });
    expect(state.setAuthValues).toHaveBeenCalledOnce();

    const updater = state.setAuthValues.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
    expect(updater?.(values)).toEqual({
      ...values,
      phone: ""
    });
  });

  it("marks changed fields touched and schedules their focus automation", () => {
    const state = createHandlerState();
    const handlers = useAuthCredentialInputHandlers(state.input);

    handlers.handleValuesChange({
      name: "Мария",
      email: "new@example.com",
      phone: "+7 999"
    });

    expect(state.setEmailTouched).toHaveBeenCalledWith(true);
    expect(state.scheduleSubmitFocus).toHaveBeenCalledWith("new@example.com");
    expect(state.setNameTouched).toHaveBeenCalledWith(true);
    expect(state.schedulePhoneFocus).toHaveBeenCalledWith("Мария");
    expect(state.setPhoneTouched).toHaveBeenCalledWith(true);
    expect(state.setPhoneInputState).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedValue: "+7999"
      })
    );
    expect(state.scheduleSubmitFocusAfterValidPhone).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedValue: "+7999"
      })
    );
    expect(state.setAuthValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Мария",
        email: "new@example.com",
        phone: "+7 999"
      })
    );
  });

  it("handles phone backspace by preventing default and updating phone state", () => {
    const state = createHandlerState({
      phoneInputState: {
        displayValue: "+7 (905)",
        normalizedValue: "+7905",
        selectedCountry: "RU"
      }
    });
    const handlers = useAuthCredentialInputHandlers(state.input);
    const event = {
      key: "Backspace",
      preventDefault: vi.fn(),
      currentTarget: {
        value: "+7 (905)",
        selectionStart: 8,
        selectionEnd: 8
      }
    } as unknown as React.KeyboardEvent<HTMLInputElement>;

    handlers.handlePhoneInputKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(state.setPhoneTouched).toHaveBeenCalledWith(true);
    expect(state.setPhoneInputState).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedValue: "+790"
      })
    );
    expect(state.setAuthValues).toHaveBeenCalledOnce();
  });
});

function createHandlerState(
  input: {
    phoneInputState?: Parameters<typeof useAuthCredentialInputHandlers>[0]["phoneInputState"];
  } = {}
) {
  const state = {
    schedulePhoneFocus: vi.fn(),
    scheduleSubmitFocus: vi.fn(),
    scheduleSubmitFocusAfterValidPhone: vi.fn(),
    setAuthValues: vi.fn(),
    setEmailTouched: vi.fn(),
    setNameTouched: vi.fn(),
    setPhoneInputState: vi.fn(),
    setPhoneTouched: vi.fn()
  };

  return {
    ...state,
    input: {
      values,
      phoneInputState: input.phoneInputState ?? createInitialPhoneInputState("RU"),
      schedulePhoneFocus: state.schedulePhoneFocus,
      scheduleSubmitFocus: state.scheduleSubmitFocus,
      scheduleSubmitFocusAfterValidPhone: state.scheduleSubmitFocusAfterValidPhone,
      setAuthValues: state.setAuthValues,
      setEmailTouched: state.setEmailTouched,
      setNameTouched: state.setNameTouched,
      setPhoneInputState: state.setPhoneInputState,
      setPhoneTouched: state.setPhoneTouched
    }
  };
}
