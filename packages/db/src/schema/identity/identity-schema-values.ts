export const userStatusValues = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof userStatusValues)[number];

export const identityProviderValues = ["email", "phone", "telegram", "google", "apple"] as const;
export type IdentityProvider = (typeof identityProviderValues)[number];

export const databasePlatformRoleValues = [
  "client",
  "astrologer",
  "moderator",
  "admin",
  "super_admin"
] as const;
export type DatabasePlatformRole = (typeof databasePlatformRoleValues)[number];

export const authSessionStatusValues = ["active", "revoked"] as const;
export type AuthSessionStatus = (typeof authSessionStatusValues)[number];

export const authChallengeStatusValues = ["pending", "consumed", "cancelled"] as const;
export type AuthChallengeStatus = (typeof authChallengeStatusValues)[number];

export const authChallengeDeliveryStatusValues = ["queued", "sent", "failed"] as const;
export type AuthChallengeDeliveryStatus = (typeof authChallengeDeliveryStatusValues)[number];

export const authSecurityEventTypeValues = [
  "registration_succeeded",
  "login_succeeded",
  "login_failed",
  "logout_succeeded",
  "session_revoked"
] as const;
export type AuthSecurityEventType = (typeof authSecurityEventTypeValues)[number];
