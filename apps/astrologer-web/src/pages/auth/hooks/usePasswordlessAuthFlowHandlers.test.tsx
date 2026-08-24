// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import {
  usePasswordlessAuthFlowHandlers,
  type PasswordlessPendingCredential
} from "./usePasswordlessAuthFlowHandlers";

const verifyRegistrationPasswordlessCode = vi.fn();

vi.mock("../../../features/auth/api/requestPasswordlessCode", () => ({
  requestPasswordlessCode: vi.fn()
}));

vi.mock("../../../features/auth/api/verifyPasswordlessCode", () => ({
  verifyPasswordlessCode: vi.fn()
}));

vi.mock("../../../features/auth/api/verifyRegistrationPasswordlessCode", () => ({
  verifyRegistrationPasswordlessCode: (...args: unknown[]) =>
    verifyRegistrationPasswordlessCode(...args)
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePasswordlessAuthFlowHandlers", () => {
  it("does not attach a stale verification error to a newer code", async () => {
    const verification = createDeferred<never>();
    verifyRegistrationPasswordlessCode.mockReturnValueOnce(verification.promise);
    const setServerError = vi.fn();
    const baseInput = createInput({ code: "111111", setServerError });
    const { result, rerender } = renderHook(
      ({ code }) =>
        usePasswordlessAuthFlowHandlers({
          ...baseInput,
          code
        }),
      {
        initialProps: { code: "111111" },
        wrapper: MemoryRouter
      }
    );

    const submitPromise = result.current.handleCodeSubmit("111111");
    await waitFor(() => expect(verifyRegistrationPasswordlessCode).toHaveBeenCalledTimes(1));

    rerender({ code: "222222" });
    verification.reject(new HttpError(401, { message: "Invalid or expired passwordless code" }));
    await submitPromise;

    expect(setServerError).not.toHaveBeenCalledWith("Неверный или устаревший код");
  });
});

function createInput(input: {
  readonly code: string;
  readonly setServerError: Dispatch<SetStateAction<string | null>>;
}): Parameters<typeof usePasswordlessAuthFlowHandlers>[0] {
  return {
    mode: "register",
    values: {
      name: "Антон",
      email: "a.golubev@finext.io",
      phone: ""
    },
    phoneInputState: {
      displayValue: "",
      normalizedValue: "",
      selectedCountry: "RU"
    },
    challenge: {
      challengeId: "11111111-1111-4111-8111-111111111111",
      channel: "email",
      maskedIdentifier: "a***@finext.io",
      expiresAt: "2026-08-24T08:10:14.719Z",
      resendAvailableAt: "2026-08-24T08:01:14.719Z"
    },
    pendingCredential: {
      mode: "register",
      identifier: {
        channel: "email",
        identifier: "a.golubev@finext.io"
      },
      displayName: "Антон"
    } satisfies PasswordlessPendingCredential,
    code: input.code,
    copy: {
      errors: {
        invalidCode: "Неверный или устаревший код",
        identityExists: "Кабинет уже существует",
        rateLimited: "Слишком много запросов",
        generic: "Не удалось выполнить вход"
      }
    },
    codeInputRef: { current: null },
    resendCountdownSeconds: 0,
    resetResendCountdown: vi.fn(),
    setAuthStep: vi.fn(),
    setChallenge: vi.fn(),
    setCode: vi.fn(),
    setEmailTouched: vi.fn(),
    setIsSubmitting: vi.fn(),
    setNameTouched: vi.fn(),
    setPendingCredential: vi.fn(),
    setPhoneTouched: vi.fn(),
    setServerError: input.setServerError
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
