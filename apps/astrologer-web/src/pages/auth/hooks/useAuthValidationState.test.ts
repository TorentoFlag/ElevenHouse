import type { OtpAuthFormValues } from "@elevenhouse/design-system/components/OtpAuthForm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialPhoneInputState } from "../helpers/phoneInputModel";
import { useDelayedValidationVisibility } from "./useDelayedValidationVisibility";
import { useAuthValidationState } from "./useAuthValidationState";

vi.mock("./useDelayedValidationVisibility", () => ({
  useDelayedValidationVisibility: vi.fn()
}));

const copy = {
  validation: {
    email: "Invalid email",
    name: "Invalid name",
    phone: "Invalid phone"
  }
};

const validValues = {
  name: "Анна",
  email: "",
  phone: "+7 999 000-11-22"
} satisfies OtpAuthFormValues;

describe("useAuthValidationState", () => {
  beforeEach(() => {
    vi.mocked(useDelayedValidationVisibility).mockReturnValue(false);
  });

  it("resolves credential and submit state from valid phone credentials", () => {
    const state = useAuthValidationState({
      mode: "register",
      values: validValues,
      phoneInputState: {
        ...createInitialPhoneInputState("RU"),
        displayValue: "+7 999 000-11-22",
        normalizedValue: "+79990001122"
      },
      touched: {
        email: false,
        name: true,
        phone: true
      },
      copy,
      nameErrorDelayMs: 700
    });

    expect(state.emailError).toBeNull();
    expect(state.nameError).toBeNull();
    expect(state.phoneError).toBeNull();
    expect(state.hasNameValidationError).toBe(false);
    expect(state.hasPhoneValidationError).toBe(false);
    expect(state.credentialValues).toMatchObject({
      name: "Анна",
      normalizedPhone: "+79990001122",
      isPhoneValid: true
    });
    expect(state.credentialState).toMatchObject({
      identifier: {
        channel: "phone",
        identifier: "+79990001122"
      }
    });
    expect(state.submitState).toMatchObject({
      canSubmit: true
    });
  });

  it("shows field errors only when their visibility rules allow it", () => {
    vi.mocked(useDelayedValidationVisibility).mockReturnValue(true);

    const state = useAuthValidationState({
      mode: "register",
      values: {
        name: "А",
        email: "bad-email",
        phone: "+7"
      },
      phoneInputState: {
        ...createInitialPhoneInputState("RU"),
        displayValue: "+7",
        normalizedValue: "+7"
      },
      touched: {
        email: true,
        name: true,
        phone: true
      },
      copy,
      nameErrorDelayMs: 700
    });

    expect(useDelayedValidationVisibility).toHaveBeenCalledWith({
      delayMs: 700,
      resetKey: "А",
      shouldShow: true
    });
    expect(state.emailError).toBe("Invalid email");
    expect(state.nameError).toBe("Invalid name");
    expect(state.phoneError).toBe("Invalid phone");
    expect(state.hasNameValidationError).toBe(true);
    expect(state.hasPhoneValidationError).toBe(true);
    expect(state.submitState).toMatchObject({
      canSubmit: false
    });
  });
});
