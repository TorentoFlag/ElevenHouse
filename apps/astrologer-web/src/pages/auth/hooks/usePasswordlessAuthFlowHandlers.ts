import type {
  OtpAuthFormMode,
  OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import type { RequestAstrologerPasswordlessCodeResponse } from "@elevenhouse/contracts";
import { validateSupportedPhoneNumber } from "@elevenhouse/validation/phone";
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import { useNavigate } from "react-router";
import { application } from "../../../Application";
import { requestPasswordlessCode } from "../../../features/auth/api/requestPasswordlessCode";
import { verifyPasswordlessCode } from "../../../features/auth/api/verifyPasswordlessCode";
import { verifyRegistrationPasswordlessCode } from "../../../features/auth/api/verifyRegistrationPasswordlessCode";
import { authQueryKeys } from "../../../features/auth/model/authQueryKeys";
import {
  createPasswordlessCodeRequest,
  createPasswordlessVerificationRequest,
  resolveAuthSubmitState,
  type AuthIdentifier
} from "../helpers/authFlowModel";
import { resolveAuthErrorMessage } from "../helpers/authErrorMessage";
import type { PhoneInputState } from "../helpers/phoneInputModel";

export type AuthStep = "credentials" | "code";

export type PasswordlessPendingCredential = {
  readonly mode: OtpAuthFormMode;
  readonly identifier: AuthIdentifier;
  readonly displayName: string;
};

type PasswordlessAuthFlowCopy = {
  readonly errors: {
    readonly invalidCode: string;
    readonly identityExists: string;
    readonly rateLimited: string;
    readonly generic: string;
  };
};

export function usePasswordlessAuthFlowHandlers(input: {
  readonly mode: OtpAuthFormMode;
  readonly values: OtpAuthFormValues;
  readonly phoneInputState: PhoneInputState;
  readonly challenge: RequestAstrologerPasswordlessCodeResponse | null;
  readonly pendingCredential: PasswordlessPendingCredential | null;
  readonly code: string;
  readonly copy: PasswordlessAuthFlowCopy;
  readonly codeInputRef: RefObject<HTMLInputElement | null>;
  readonly resendCountdownSeconds: number;
  readonly resetResendCountdown: () => void;
  readonly navigate?: ReturnType<typeof useNavigate>;
  readonly setAuthStep: Dispatch<SetStateAction<AuthStep>>;
  readonly setChallenge: Dispatch<SetStateAction<RequestAstrologerPasswordlessCodeResponse | null>>;
  readonly setCode: Dispatch<SetStateAction<string>>;
  readonly setEmailTouched: Dispatch<SetStateAction<boolean>>;
  readonly setIsSubmitting: Dispatch<SetStateAction<boolean>>;
  readonly setNameTouched: Dispatch<SetStateAction<boolean>>;
  readonly setPendingCredential: Dispatch<SetStateAction<PasswordlessPendingCredential | null>>;
  readonly setPhoneTouched: Dispatch<SetStateAction<boolean>>;
  readonly setServerError: Dispatch<SetStateAction<string | null>>;
}) {
  const routerNavigate = useNavigate();
  const navigate = input.navigate ?? routerNavigate;
  const latestCodeVerificationTargetRef = useRef({
    challengeId: input.challenge?.challengeId ?? null,
    code: input.code
  });
  const codeVerificationSequenceRef = useRef(0);

  useEffect(() => {
    latestCodeVerificationTargetRef.current = {
      challengeId: input.challenge?.challengeId ?? null,
      code: input.code
    };
  }, [input.challenge?.challengeId, input.code]);

  const handleCredentialSubmit = useCallback(async () => {
    input.setEmailTouched(true);
    input.setNameTouched(true);
    input.setPhoneTouched(true);

    const currentPhoneValidation = validateSupportedPhoneNumber(
      input.phoneInputState.normalizedValue,
      input.phoneInputState.selectedCountry
    );
    const currentCredentialValues = {
      name: input.values.name,
      email: input.values.email,
      phone: input.values.phone,
      normalizedPhone:
        currentPhoneValidation.normalizedValue ?? input.phoneInputState.normalizedValue,
      isPhoneValid: currentPhoneValidation.valid
    };
    const currentSubmitState = resolveAuthSubmitState({
      mode: input.mode,
      values: currentCredentialValues
    });

    if (!currentSubmitState.canSubmit) {
      return;
    }

    input.setIsSubmitting(true);
    input.setServerError(null);

    try {
      const nextChallenge = await requestPasswordlessCode(
        createPasswordlessCodeRequest(currentSubmitState.identifier)
      );
      input.setChallenge(nextChallenge);
      input.setPendingCredential({
        mode: input.mode,
        identifier: currentSubmitState.identifier,
        displayName: input.values.name
      });
      input.setCode("");
      input.setAuthStep("code");
      input.resetResendCountdown();
      requestAnimationFrame(() => input.codeInputRef.current?.focus({ preventScroll: true }));
    } catch (error) {
      input.setServerError(resolveAuthErrorMessage(error, input.copy));
    } finally {
      input.setIsSubmitting(false);
    }
  }, [input]);

  const handleCodeSubmit = useCallback(
    async (submittedCode = input.code) => {
      if (!input.challenge || !input.pendingCredential || submittedCode.length !== 6) {
        return;
      }

      const attemptSequence = codeVerificationSequenceRef.current + 1;
      codeVerificationSequenceRef.current = attemptSequence;
      const attemptedChallengeId = input.challenge.challengeId;
      input.setIsSubmitting(true);
      input.setServerError(null);

      try {
        const request = createPasswordlessVerificationRequest({
          mode: input.pendingCredential.mode,
          challengeId: attemptedChallengeId,
          code: submittedCode,
          displayName: input.pendingCredential.displayName
        });
        const result =
          input.pendingCredential.mode === "register" && "displayName" in request
            ? await verifyRegistrationPasswordlessCode(request)
            : await verifyPasswordlessCode(request);
        const latestTarget = latestCodeVerificationTargetRef.current;

        if (
          codeVerificationSequenceRef.current !== attemptSequence ||
          latestTarget.challengeId !== attemptedChallengeId ||
          latestTarget.code !== submittedCode
        ) {
          return;
        }

        application.queryClient.setQueryData(authQueryKeys.currentAccount(), {
          account: {
            id: result.account.id,
            status: result.account.status,
            roles: result.account.roles
          }
        });
        navigate("/dashboard", { replace: true });
      } catch (error) {
        const latestTarget = latestCodeVerificationTargetRef.current;

        if (
          codeVerificationSequenceRef.current === attemptSequence &&
          latestTarget.challengeId === attemptedChallengeId &&
          latestTarget.code === submittedCode
        ) {
          input.setServerError(resolveAuthErrorMessage(error, input.copy));
        }
      } finally {
        if (codeVerificationSequenceRef.current === attemptSequence) {
          input.setIsSubmitting(false);
        }
      }
    },
    [input, navigate]
  );

  const handleResend = useCallback(async () => {
    if (!input.pendingCredential || input.resendCountdownSeconds > 0) {
      return;
    }

    input.setIsSubmitting(true);
    input.setServerError(null);

    try {
      const nextChallenge = await requestPasswordlessCode(
        createPasswordlessCodeRequest(input.pendingCredential.identifier)
      );
      input.setChallenge(nextChallenge);
      input.setCode("");
      input.resetResendCountdown();
    } catch (error) {
      input.setServerError(resolveAuthErrorMessage(error, input.copy));
    } finally {
      input.setIsSubmitting(false);
    }
  }, [input]);

  const handleBackToCredentials = useCallback(() => {
    input.setAuthStep("credentials");
    input.setChallenge(null);
    input.setPendingCredential(null);
    input.setCode("");
    input.setServerError(null);
  }, [input]);

  return {
    handleBackToCredentials,
    handleCodeSubmit,
    handleCredentialSubmit,
    handleResend
  };
}
