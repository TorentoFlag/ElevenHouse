import type {
  OtpAuthFormMode,
  OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import {
  requestPasswordlessCode
} from "../../../features/auth/api/requestPasswordlessCode";
import {
  verifyPasswordlessCode
} from "../../../features/auth/api/verifyPasswordlessCode";
import {
  clearClientJoinIntentToken,
  readClientJoinIntentToken
} from "../../../features/client-join/model/clientJoinStorage";
import { createInitialPhoneInputState } from "../helpers/phoneInputModel";
import {
  type PasswordlessPendingCredential,
  usePasswordlessAuthFlowHandlers
} from "./usePasswordlessAuthFlowHandlers";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn()
}));

vi.mock("../../../features/auth/api/requestPasswordlessCode", () => ({
  requestPasswordlessCode: vi.fn()
}));

vi.mock("../../../features/auth/api/verifyPasswordlessCode", () => ({
  verifyPasswordlessCode: vi.fn()
}));

vi.mock("../../../features/auth/api/verifyRegistrationPasswordlessCode", () => ({
  verifyRegistrationPasswordlessCode: vi.fn()
}));

vi.mock("../../../features/client-join/model/clientJoinStorage", () => ({
  readClientJoinIntentToken: vi.fn(() => null),
  clearClientJoinIntentToken: vi.fn()
}));

vi.mock("../../../Application", () => ({
  application: {
    queryClient: {
      setQueryData: vi.fn()
    }
  }
}));

const copy = {
  errors: {
    invalidCode: "Invalid code",
    identityExists: "Identity exists",
    rateLimited: "Rate limited",
    generic: "Generic error"
  }
};

const validValues = {
  name: "Анна",
  email: "",
  phone: "+7 999 000-11-22"
} satisfies OtpAuthFormValues;

describe("usePasswordlessAuthFlowHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("requests a challenge and moves to the code step for valid credentials", async () => {
    vi.mocked(requestPasswordlessCode).mockResolvedValue({
      challengeId: "challenge_1",
      channel: "phone",
      maskedIdentifier: "+7******22",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
    const state = createFlowState({
      mode: "register",
      values: validValues
    });
    const handlers = usePasswordlessAuthFlowHandlers(state.input);

    await handlers.handleCredentialSubmit();

    expect(requestPasswordlessCode).toHaveBeenCalledWith({
      channel: "phone",
      identifier: "+79990001122",
      roles: ["client"]
    });
    expect(state.setChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: "challenge_1" })
    );
    expect(state.setPendingCredential).toHaveBeenCalledWith({
      mode: "register",
      identifier: {
        channel: "phone",
        identifier: "+79990001122"
      },
      displayName: "Анна"
    });
    expect(state.setAuthStep).toHaveBeenCalledWith("code");
    expect(state.resetResendCountdown).toHaveBeenCalledOnce();
    expect(state.codeInput.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("maps auth API failures to server error copy", async () => {
    vi.mocked(requestPasswordlessCode).mockRejectedValue(new HttpError(429, null));
    const state = createFlowState({
      mode: "register",
      values: validValues
    });
    const handlers = usePasswordlessAuthFlowHandlers(state.input);

    await handlers.handleCredentialSubmit();

    expect(state.setServerError).toHaveBeenLastCalledWith("Rate limited");
    expect(state.setAuthStep).not.toHaveBeenCalledWith("code");
  });

  it("verifies a submitted code and navigates to the account page", async () => {
    vi.mocked(readClientJoinIntentToken).mockReturnValue("join_1234567890abcdef");
    vi.mocked(verifyPasswordlessCode).mockResolvedValue({
      account: {
        id: "user_1",
        status: "active",
        roles: ["client"]
      }
    });
    const pendingCredential = {
      mode: "login",
      identifier: {
        channel: "email",
        identifier: "client@example.com"
      },
      displayName: ""
    } satisfies PasswordlessPendingCredential;
    const state = createFlowState({
      mode: "login",
      values: {
        name: "",
        email: "client@example.com",
        phone: ""
      },
      challenge: {
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email",
        maskedIdentifier: "c***@example.com",
        expiresAt: "2026-06-16T10:10:00.000Z",
        resendAvailableAt: "2026-06-16T10:01:00.000Z"
      },
      pendingCredential
    });
    const handlers = usePasswordlessAuthFlowHandlers(state.input);

    await handlers.handleCodeSubmit("123456");

    expect(verifyPasswordlessCode).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      clientJoinIntentToken: "join_1234567890abcdef"
    });
    expect(clearClientJoinIntentToken).toHaveBeenCalledOnce();
    expect(state.navigate).toHaveBeenCalledWith("/me", { replace: true });
  });

  it("does not resend while cooldown is active", async () => {
    const pendingCredential = {
      mode: "login",
      identifier: {
        channel: "email",
        identifier: "client@example.com"
      },
      displayName: ""
    } satisfies PasswordlessPendingCredential;
    const state = createFlowState({
      mode: "login",
      values: {
        name: "",
        email: "client@example.com",
        phone: ""
      },
      pendingCredential,
      resendCountdownSeconds: 10
    });
    const handlers = usePasswordlessAuthFlowHandlers(state.input);

    await handlers.handleResend();

    expect(requestPasswordlessCode).not.toHaveBeenCalled();
  });
});

function createFlowState(input: {
  mode: OtpAuthFormMode;
  values: OtpAuthFormValues;
  challenge?: Parameters<typeof usePasswordlessAuthFlowHandlers>[0]["challenge"];
  pendingCredential?: PasswordlessPendingCredential | null;
  resendCountdownSeconds?: number;
}) {
  const codeInput = {
    focus: vi.fn()
  } as unknown as HTMLInputElement;
  const state = {
    codeInput,
    navigate: vi.fn(),
    resetResendCountdown: vi.fn(),
    setAuthStep: vi.fn(),
    setChallenge: vi.fn(),
    setCode: vi.fn(),
    setEmailTouched: vi.fn(),
    setIsSubmitting: vi.fn(),
    setNameTouched: vi.fn(),
    setPendingCredential: vi.fn(),
    setPhoneTouched: vi.fn(),
    setServerError: vi.fn()
  };

  return {
    ...state,
    input: {
      mode: input.mode,
      values: input.values,
      phoneInputState: {
        ...createInitialPhoneInputState("RU"),
        displayValue: input.values.phone,
        normalizedValue: input.values.phone === "" ? "" : "+79990001122"
      },
      challenge: input.challenge ?? null,
      pendingCredential: input.pendingCredential ?? null,
      code: "123456",
      copy,
      codeInputRef: { current: codeInput },
      resendCountdownSeconds: input.resendCountdownSeconds ?? 0,
      resetResendCountdown: state.resetResendCountdown,
      navigate: state.navigate,
      setAuthStep: state.setAuthStep,
      setChallenge: state.setChallenge,
      setCode: state.setCode,
      setEmailTouched: state.setEmailTouched,
      setIsSubmitting: state.setIsSubmitting,
      setNameTouched: state.setNameTouched,
      setPendingCredential: state.setPendingCredential,
      setPhoneTouched: state.setPhoneTouched,
      setServerError: state.setServerError
    }
  };
}
