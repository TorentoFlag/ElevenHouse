import {
  requestPasswordlessCodeRequestSchema,
  verifyPasswordlessCodeRequestSchema,
  verifyRegistrationPasswordlessCodeRequestSchema,
  type RequestPasswordlessCodeRequest,
  type VerifyPasswordlessCodeRequest,
  type VerifyRegistrationPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import { isValidDisplayName, isValidEmail, emailSchema } from "@elevenhouse/validation";
import type { OtpAuthFormMode } from "@elevenhouse/design-system/components/OtpAuthForm";

export type AuthCredentialValues = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly normalizedPhone: string;
  readonly isPhoneValid: boolean;
};

export type AuthIdentifier =
  | {
      readonly channel: "email";
      readonly identifier: string;
    }
  | {
      readonly channel: "phone";
      readonly identifier: string;
    };

export type AuthCredentialState = {
  readonly emailDisabled: boolean;
  readonly phoneDisabled: boolean;
  readonly identifier: AuthIdentifier | null;
};

export type AuthSubmitState =
  | {
      readonly canSubmit: true;
      readonly identifier: AuthIdentifier;
    }
  | {
      readonly canSubmit: false;
      readonly identifier: AuthIdentifier | null;
      readonly reason: "identifier_required" | "display_name_required";
    };

export function resolveAuthCredentialState(values: AuthCredentialValues): AuthCredentialState {
  const normalizedEmail = normalizeEmail(values.email);
  const hasEmailInput = values.email.trim().length > 0;
  const identifier = resolveAuthIdentifier(values);

  return {
    emailDisabled: values.isPhoneValid,
    phoneDisabled: hasEmailInput,
    identifier
  };

  function resolveAuthIdentifier(input: AuthCredentialValues): AuthIdentifier | null {
    if (input.isPhoneValid && input.normalizedPhone) {
      return {
        channel: "phone",
        identifier: input.normalizedPhone
      };
    }

    if (normalizedEmail) {
      return {
        channel: "email",
        identifier: normalizedEmail
      };
    }

    return null;
  }
}

export function resolveAuthSubmitState(input: {
  readonly mode: OtpAuthFormMode;
  readonly values: AuthCredentialValues;
}): AuthSubmitState {
  const credentialState = resolveAuthCredentialState(input.values);

  if (!credentialState.identifier) {
    return {
      canSubmit: false,
      identifier: null,
      reason: "identifier_required"
    };
  }

  if (input.mode === "register" && !isValidDisplayName(input.values.name)) {
    return {
      canSubmit: false,
      identifier: credentialState.identifier,
      reason: "display_name_required"
    };
  }

  return {
    canSubmit: true,
    identifier: credentialState.identifier
  };
}

export function createPasswordlessCodeRequest(
  identifier: AuthIdentifier
): RequestPasswordlessCodeRequest {
  return requestPasswordlessCodeRequestSchema.parse({
    ...identifier,
    roles: ["client"]
  });
}

export function createPasswordlessVerificationRequest(input: {
  readonly mode: OtpAuthFormMode;
  readonly challengeId: string;
  readonly code: string;
  readonly displayName: string;
}): VerifyPasswordlessCodeRequest | VerifyRegistrationPasswordlessCodeRequest {
  if (input.mode === "register") {
    return verifyRegistrationPasswordlessCodeRequestSchema.parse({
      challengeId: input.challengeId,
      code: input.code,
      displayName: input.displayName,
      roles: ["client"]
    });
  }

  return verifyPasswordlessCodeRequestSchema.parse({
    challengeId: input.challengeId,
    code: input.code
  });
}

function normalizeEmail(value: string): string | null {
  if (!isValidEmail(value)) {
    return null;
  }

  return emailSchema.parse(value);
}
