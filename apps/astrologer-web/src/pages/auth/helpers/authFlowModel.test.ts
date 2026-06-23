import { describe, expect, it } from "vitest";
import {
  createPasswordlessCodeRequest,
  createPasswordlessVerificationRequest,
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

describe("astrologer authFlowModel", () => {
  it("allows registration only with a valid display name and identifier", () => {
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

  it("creates an astrologer request-code payload without roles", () => {
    expect(
      createPasswordlessCodeRequest({
        channel: "phone",
        identifier: "+79990001122"
      })
    ).toEqual({
      channel: "phone",
      identifier: "+79990001122"
    });
  });

  it("creates astrologer verification payloads for login and registration", () => {
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
      displayName: "Анна"
    });
  });
});
