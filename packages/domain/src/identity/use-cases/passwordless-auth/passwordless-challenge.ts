import type { CustomerPlatformRole } from "@elevenhouse/auth";
import type { UserAccount } from "../../../accounts";
import type { AuthIdentity } from "../../../auth-identities";
import type { AuthSecurityEvent, AuthSession } from "../../../auth-sessions";
import { normalizeCustomerRoles } from "../../../roles";
import type { UserRoleAssignment } from "../../../roles";

export const passwordlessAuthChannels = ["email", "phone"] as const;
export type PasswordlessAuthChannel = (typeof passwordlessAuthChannels)[number];
export type AuthChallengeStatus = "pending" | "consumed" | "cancelled";
export type AuthChallengeDeliveryStatus = "queued" | "sent" | "failed";

export type AuthChallenge = {
  readonly id: string;
  readonly channel: PasswordlessAuthChannel;
  readonly identifier: string;
  readonly identifierNormalized: string;
  readonly codeHash: string;
  readonly requestedRoles: readonly CustomerPlatformRole[];
  readonly status: AuthChallengeStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly expiresAt: string;
  readonly resendAvailableAt: string;
  readonly consumedAt?: string;
  readonly cancelledAt?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AuthChallengeDelivery = {
  readonly id: string;
  readonly challengeId: string;
  readonly channel: PasswordlessAuthChannel;
  readonly provider: string;
  readonly status: AuthChallengeDeliveryStatus;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly createdAt: string;
  readonly sentAt?: string;
};

export type PasswordlessAuthenticatedAccount = {
  readonly user: UserAccount;
  readonly authIdentity: AuthIdentity;
  readonly roleAssignments: readonly UserRoleAssignment[];
  readonly session: AuthSession;
  readonly securityEvent: AuthSecurityEvent;
  readonly authenticationKind: "registration" | "login";
};

export class PasswordlessCodeDeliveryUnavailableError extends Error {
  constructor() {
    super("Passwordless code delivery is unavailable");
    this.name = "PasswordlessCodeDeliveryUnavailableError";
  }
}

export class PasswordlessCodeRequestCooldownError extends Error {
  constructor(readonly resendAvailableAt: string) {
    super("Passwordless code request is on cooldown");
    this.name = "PasswordlessCodeRequestCooldownError";
  }
}

export class PasswordlessCodeVerificationError extends Error {
  constructor() {
    super("Invalid or expired passwordless code");
    this.name = "PasswordlessCodeVerificationError";
  }
}

export function normalizePasswordlessIdentifier(input: {
  readonly channel: PasswordlessAuthChannel;
  readonly identifier: string;
}): { readonly identifier: string; readonly identifierNormalized: string } {
  const identifier = input.identifier.trim();
  if (!identifier) {
    throw new Error("Passwordless identifier is required");
  }

  if (input.channel === "email") {
    return {
      identifier,
      identifierNormalized: identifier.toLowerCase()
    };
  }

  const identifierNormalized = identifier.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(identifierNormalized)) {
    throw new Error("Phone passwordless identifiers must use E.164 format");
  }

  return { identifier, identifierNormalized };
}

export function maskPasswordlessIdentifier(input: {
  readonly channel: PasswordlessAuthChannel;
  readonly identifierNormalized: string;
}): string {
  if (input.channel === "email") {
    const [local = "", domain = ""] = input.identifierNormalized.split("@");
    return `${local.slice(0, 1) || "*"}***@${domain}`;
  }

  return `${input.identifierNormalized.slice(0, 3)}***${input.identifierNormalized.slice(-2)}`;
}

export function normalizeRequestedCustomerRoles(
  roles: readonly string[]
): readonly CustomerPlatformRole[] {
  return normalizeCustomerRoles(roles);
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
