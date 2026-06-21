import { describe, expect, it } from "vitest";
import {
  createPasswordlessCodeRequest,
  createPasswordlessVerificationRequest,
  resolveAuthCredentialState,
  resolveAuthSubmitState,
  type AuthCredentialValues
} from "./authFlowModel";

const validRegistrationValues = {
  name: "Анна",
  email: "",
  phone: "+7 999 000-11-22",
  normalizedPhone: "+79990001122",
  isPhoneValid: true
} satisfies AuthCredentialValues;

describe("authFlowModel", () => {
  it("uses a valid phone identifier and disables email input", () => {
    expect(resolveAuthCredentialState(validRegistrationValues)).toEqual({
      emailDisabled: true,
      phoneDisabled: false,
      identifier: {
        channel: "phone",
        identifier: "+79990001122"
      }
    });
  });

  it("uses an entered email identifier and disables phone input", () => {
    expect(
      resolveAuthCredentialState({
        name: "",
        email: " CLIENT@example.COM ",
        phone: "",
        normalizedPhone: "",
        isPhoneValid: false
      })
    ).toEqual({
      emailDisabled: false,
      phoneDisabled: true,
      identifier: {
        channel: "email",
        identifier: "client@example.com"
      }
    });
  });

  it("does not disable email for an incomplete phone number", () => {
    expect(
      resolveAuthCredentialState({
        name: "",
        email: "",
        phone: "+7",
        normalizedPhone: "+7",
        isPhoneValid: false
      })
    ).toEqual({
      emailDisabled: false,
      phoneDisabled: false,
      identifier: null
    });
  });

  it("allows login submit only with a valid identifier", () => {
    expect(
      resolveAuthSubmitState({
        mode: "login",
        values: {
          name: "",
          email: "client@example.com",
          phone: "",
          normalizedPhone: "",
          isPhoneValid: false
        }
      })
    ).toMatchObject({
      canSubmit: true,
      identifier: {
        channel: "email",
        identifier: "client@example.com"
      }
    });

    expect(
      resolveAuthSubmitState({
        mode: "login",
        values: {
          name: "",
          email: "",
          phone: "",
          normalizedPhone: "",
          isPhoneValid: false
        }
      })
    ).toMatchObject({
      canSubmit: false,
      reason: "identifier_required"
    });
  });

  it("allows registration submit only with a valid display name and identifier", () => {
    expect(
      resolveAuthSubmitState({
        mode: "register",
        values: validRegistrationValues
      })
    ).toMatchObject({
      canSubmit: true
    });

    expect(
      resolveAuthSubmitState({
        mode: "register",
        values: {
          ...validRegistrationValues,
          name: "А"
        }
      })
    ).toMatchObject({
      canSubmit: false,
      reason: "display_name_required"
    });
  });

  it("creates a public client request-code payload from the selected identifier", () => {
    expect(
      createPasswordlessCodeRequest({
        channel: "phone",
        identifier: "+79990001122"
      })
    ).toEqual({
      channel: "phone",
      identifier: "+79990001122",
      roles: ["client"]
    });
  });

  it("creates different verification payloads for login and registration", () => {
    expect(
      createPasswordlessVerificationRequest({
        mode: "login",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Анна"
      })
    ).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456"
    });

    expect(
      createPasswordlessVerificationRequest({
        mode: "register",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: " Анна "
      })
    ).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      displayName: "Анна",
      roles: ["client"]
    });
  });
});
