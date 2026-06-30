import { normalizeOptionalString, normalizeRequiredString } from "../shared";

export const authSessionStatusValues = ["active", "revoked"] as const;
export type AuthSessionStatus = (typeof authSessionStatusValues)[number];

export type AuthSession = {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly status: AuthSessionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastSeenAt?: string;
  readonly revokedAt?: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
};

export type AuthSessionCreationInput = {
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly userAgent?: string;
  readonly ipAddress?: string;
};

export type NormalizedAuthSessionCreationInput = {
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
};

export function normalizeAuthSessionCreationInput(
  input: AuthSessionCreationInput
): NormalizedAuthSessionCreationInput {
  const tokenHash = normalizeRequiredString(input.tokenHash, "Auth session token hash is required");

  if (input.expiresAt.getTime() <= input.createdAt.getTime()) {
    throw new Error("Auth session expiry must be after creation");
  }

  const userAgent = normalizeOptionalString(input.userAgent);
  const ipAddress = normalizeOptionalString(input.ipAddress);

  return {
    userId: input.userId,
    tokenHash,
    createdAt: input.createdAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    ...(userAgent ? { userAgent } : {}),
    ...(ipAddress ? { ipAddress } : {})
  };
}

export function isAuthSessionUsable(session: AuthSession, now: Date): boolean {
  return session.status === "active" && new Date(session.expiresAt).getTime() > now.getTime();
}
