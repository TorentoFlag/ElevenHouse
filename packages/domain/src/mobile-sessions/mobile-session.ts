import type { UserAccount } from "../accounts";
import { isCustomerPlatformRole, type UserRoleAssignment } from "../roles";
import { normalizeAuthSecurityEventInput, type AuthSecurityEvent } from "../auth-sessions";
import {
  verifyPasswordlessCodeForLogin,
  verifyPasswordlessCodeForRegistration,
  createActiveUserAccount,
  createUserProfile,
  grantCustomerRole,
  linkAuthIdentity,
  type AccountRegistrationStore,
  type PasswordlessLoginVerificationStore,
  type PasswordlessVerificationStore,
  type PasswordlessTrustedStaticCode
} from "../identity";

export const mobileSessionPlatformValues = ["ios", "android"] as const;
export type MobileSessionPlatform = (typeof mobileSessionPlatformValues)[number];

export const mobileSessionStatusValues = ["active", "revoked"] as const;
export type MobileSessionStatus = (typeof mobileSessionStatusValues)[number];

export const mobileRefreshTokenStatusValues = ["active", "consumed", "revoked"] as const;
export type MobileRefreshTokenStatus = (typeof mobileRefreshTokenStatusValues)[number];

export type MobileSession = {
  readonly id: string;
  readonly userId: string;
  readonly platform: MobileSessionPlatform;
  readonly deviceLabel: string;
  readonly status: MobileSessionStatus;
  readonly accessTokenHash: string;
  readonly accessTokenExpiresAt: string;
  readonly createdAt: string;
  readonly lastUsedAt: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
  readonly revokedReason?: string;
};

export type MobileRefreshToken = {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly status: MobileRefreshTokenStatus;
  readonly createdAt: string;
  readonly consumedAt?: string;
  readonly expiresAt: string;
};

export type AuthenticatedMobileSessionContext = {
  readonly session: MobileSession;
  readonly user: UserAccount;
  readonly roleAssignments: readonly UserRoleAssignment[];
};

export type MobileSessionAuthenticationStore = {
  readonly findByAccessTokenHash: (
    tokenHash: string
  ) => Promise<AuthenticatedMobileSessionContext | null>;
};

export type MobileSessionCreationStore = {
  readonly createMobileSession: (input: {
    readonly userId: string;
    readonly platform: MobileSessionPlatform;
    readonly deviceLabel: string;
    readonly accessTokenHash: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshTokenHash: string;
    readonly createdAt: string;
    readonly expiresAt: string;
  }) => Promise<MobileSession>;
};

export type MobileSessionRefreshStore = {
  readonly purgeExpiredArtifacts: (input: { readonly now: string }) => Promise<void>;
  readonly lockRefreshFamilyByTokenHash: (tokenHash: string) => Promise<{
    readonly refreshToken: MobileRefreshToken;
    readonly session: MobileSession;
  } | null>;
  readonly consumeRefreshToken: (input: {
    readonly refreshTokenId: string;
    readonly consumedAt: string;
  }) => Promise<boolean>;
  readonly rotateSession: (input: {
    readonly sessionId: string;
    readonly accessTokenHash: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshTokenHash: string;
    readonly lastUsedAt: string;
    readonly expiresAt: string;
  }) => Promise<boolean>;
  readonly revokeSession: (input: {
    readonly sessionId: string;
    readonly revokedAt: string;
    readonly revokedReason: string;
  }) => Promise<void>;
  readonly findRefreshRetryReceipt: (input: {
    readonly refreshTokenId: string;
    readonly operationId: string;
    readonly now: string;
  }) => Promise<{ readonly encryptedTokenPair: string } | null>;
  readonly createRefreshRetryReceipt: (input: {
    readonly refreshTokenId: string;
    readonly operationId: string;
    readonly encryptedTokenPair: string;
    readonly createdAt: string;
    readonly expiresAt: string;
  }) => Promise<void>;
  readonly recordSecurityEvent: (
    input: Omit<AuthSecurityEvent, "id">
  ) => Promise<AuthSecurityEvent>;
};

export type MobileSessionRevocationStore = {
  readonly revokeSession: (input: {
    readonly sessionId: string;
    readonly revokedAt: string;
    readonly revokedReason: string;
  }) => Promise<void>;
  readonly revokeAllSessionsForUser: (input: {
    readonly userId: string;
    readonly revokedAt: string;
    readonly revokedReason: string;
  }) => Promise<void>;
  readonly recordSecurityEvent: (
    input: Omit<AuthSecurityEvent, "id">
  ) => Promise<AuthSecurityEvent>;
};

export type MobileSessionManagementStore = {
  readonly listActiveSessionsForUser: (input: {
    readonly userId: string;
    readonly now: string;
  }) => Promise<readonly MobileSession[]>;
};

export type MobileSessionStore = MobileSessionCreationStore &
  MobileSessionRefreshStore &
  MobileSessionRevocationStore;

export type MobileSessionUnitOfWork<TStore> = {
  readonly transact: <T>(operation: (store: TStore) => Promise<T>) => Promise<T>;
};

export type MobilePasswordlessLoginStore = PasswordlessLoginVerificationStore &
  MobileSessionCreationStore;

export type MobilePasswordlessLoginUnitOfWork =
  MobileSessionUnitOfWork<MobilePasswordlessLoginStore>;

export type MobilePasswordlessRegistrationStore = PasswordlessVerificationStore &
  AccountRegistrationStore &
  MobileSessionCreationStore;

export type MobilePasswordlessRegistrationUnitOfWork =
  MobileSessionUnitOfWork<MobilePasswordlessRegistrationStore>;

export type IssuedMobileToken = {
  readonly token: string;
  readonly tokenHash: string;
};

export type MobileSessionTokenIssuer = {
  readonly issueToken: () => IssuedMobileToken;
};

export type CreatedMobileSession = {
  readonly session: MobileSession;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
};

export type AuthenticatedMobilePasswordlessLogin = CreatedMobileSession & {
  readonly account: {
    readonly id: string;
    readonly status: "active";
    readonly roles: readonly ("client" | "astrologer")[];
  };
  readonly securityEvent: AuthSecurityEvent;
};

export class MobileAstrologerAccountAccessDeniedError extends Error {
  constructor(message = "Authenticated account is not allowed to use the mobile astrologer API") {
    super(message);
    this.name = "MobileAstrologerAccountAccessDeniedError";
  }
}

export type RefreshedMobileSession = {
  readonly kind: "refreshed";
  readonly sessionId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
};

export type RejectedMobileSessionRefresh = {
  readonly kind: "invalid" | "reused";
};

export type RecoveredMobileSessionRefresh = {
  readonly kind: "recovered";
  readonly encryptedTokenPair: string;
};

export type MobileRefreshRetryReceiptCipher = {
  readonly encrypt: (input: {
    readonly sessionId: string;
    readonly refreshTokenId: string;
    readonly operationId: string;
    readonly accessToken: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshToken: string;
    readonly refreshTokenExpiresAt: string;
  }) => string;
};

export async function createMobileSession(input: {
  readonly sessions: MobileSessionUnitOfWork<MobileSessionCreationStore>;
  readonly tokenIssuer: MobileSessionTokenIssuer;
  readonly userId: string;
  readonly platform: MobileSessionPlatform;
  readonly deviceLabel: string;
  readonly now: Date;
  readonly accessTokenTtlSeconds: number;
  readonly idleTtlSeconds: number;
}): Promise<CreatedMobileSession> {
  validateMobileSessionIssueInput(input);
  const access = input.tokenIssuer.issueToken();
  const refresh = input.tokenIssuer.issueToken();
  assertDistinctIssuedTokens(access, refresh);
  return input.sessions.transact((store) =>
    createMobileSessionInStore({ ...input, store, access, refresh })
  );
}

export async function verifyMobilePasswordlessLogin(input: {
  readonly login: MobilePasswordlessLoginUnitOfWork;
  readonly tokenIssuer: MobileSessionTokenIssuer;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly trustedStaticCode?: PasswordlessTrustedStaticCode | null;
  readonly platform: MobileSessionPlatform;
  readonly deviceLabel: string;
  readonly now: Date;
  readonly accessTokenTtlSeconds: number;
  readonly idleTtlSeconds: number;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}): Promise<AuthenticatedMobilePasswordlessLogin> {
  validateMobileSessionIssueInput({
    userId: "passwordless-authority",
    deviceLabel: input.deviceLabel,
    now: input.now,
    accessTokenTtlSeconds: input.accessTokenTtlSeconds,
    idleTtlSeconds: input.idleTtlSeconds
  });
  const access = input.tokenIssuer.issueToken();
  const refresh = input.tokenIssuer.issueToken();
  assertDistinctIssuedTokens(access, refresh);

  return input.login.transact(async (store) => {
    const identity = await verifyPasswordlessCodeForLogin({
      store,
      challengeId: input.challengeId,
      code: input.code,
      codeSecret: input.codeSecret,
      now: input.now,
      trustedStaticCode: input.trustedStaticCode ?? null
    });
    const roles = identity.roleAssignments
      .map((assignment) => assignment.role)
      .filter(isCustomerPlatformRole);
    if (identity.user.status !== "active" || !roles.includes("astrologer")) {
      throw new MobileAstrologerAccountAccessDeniedError();
    }

    const created = await createMobileSessionInStore({
      store,
      access,
      refresh,
      userId: identity.user.id,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      now: input.now,
      accessTokenTtlSeconds: input.accessTokenTtlSeconds,
      idleTtlSeconds: input.idleTtlSeconds
    });
    const securityEvent = await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: "login_succeeded",
        occurredAt: input.now,
        userId: identity.user.id,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
        metadata: {
          authenticationKind: "mobile",
          mobileSessionId: created.session.id,
          platform: input.platform
        }
      })
    );

    return {
      ...created,
      account: { id: identity.user.id, status: "active", roles },
      securityEvent
    };
  });
}

export async function refreshMobileSession(input: {
  readonly sessions: MobileSessionUnitOfWork<MobileSessionRefreshStore>;
  readonly tokenIssuer: MobileSessionTokenIssuer;
  readonly refreshTokenHash: string;
  readonly operationId: string;
  readonly retryReceiptCipher: MobileRefreshRetryReceiptCipher;
  readonly now: Date;
  readonly accessTokenTtlSeconds: number;
  readonly idleTtlSeconds: number;
}): Promise<RefreshedMobileSession | RecoveredMobileSessionRefresh | RejectedMobileSessionRefresh> {
  validateMobileSessionTtls(input.accessTokenTtlSeconds, input.idleTtlSeconds);
  const tokenHash = input.refreshTokenHash.trim();
  const operationId = input.operationId.trim();
  if (!tokenHash || !isUuid(operationId)) return { kind: "invalid" };

  return input.sessions.transact(async (store) => {
    await store.purgeExpiredArtifacts({ now: input.now.toISOString() });
    const family = await store.lockRefreshFamilyByTokenHash(tokenHash);
    if (!family) return { kind: "invalid" };
    const { refreshToken, session } = family;
    if (session.status !== "active" || new Date(session.expiresAt) <= input.now) {
      return { kind: "invalid" };
    }

    if (refreshToken.status === "consumed") {
      const receipt = await store.findRefreshRetryReceipt({
        refreshTokenId: refreshToken.id,
        operationId,
        now: input.now.toISOString()
      });
      if (receipt) return { kind: "recovered", encryptedTokenPair: receipt.encryptedTokenPair };
      await store.revokeSession({
        sessionId: session.id,
        revokedAt: input.now.toISOString(),
        revokedReason: "refresh_token_reuse_detected"
      });
      await store.recordSecurityEvent(
        normalizeAuthSecurityEventInput({
          eventType: "refresh_token_reuse_detected",
          occurredAt: input.now,
          userId: session.userId,
          metadata: { mobileSessionId: session.id }
        })
      );
      return { kind: "reused" };
    }
    if (refreshToken.status !== "active" || new Date(refreshToken.expiresAt) <= input.now) {
      return { kind: "invalid" };
    }

    const consumed = await store.consumeRefreshToken({
      refreshTokenId: refreshToken.id,
      consumedAt: input.now.toISOString()
    });
    if (!consumed) {
      await store.revokeSession({
        sessionId: session.id,
        revokedAt: input.now.toISOString(),
        revokedReason: "refresh_token_reuse_detected"
      });
      await store.recordSecurityEvent(
        normalizeAuthSecurityEventInput({
          eventType: "refresh_token_reuse_detected",
          occurredAt: input.now,
          userId: session.userId,
          metadata: { mobileSessionId: session.id }
        })
      );
      return { kind: "reused" };
    }

    const access = input.tokenIssuer.issueToken();
    const nextRefresh = input.tokenIssuer.issueToken();
    assertDistinctIssuedTokens(access, nextRefresh);
    const accessTokenExpiresAt = new Date(input.now.getTime() + input.accessTokenTtlSeconds * 1000);
    const refreshTokenExpiresAt = new Date(input.now.getTime() + input.idleTtlSeconds * 1000);
    const rotated = await store.rotateSession({
      sessionId: session.id,
      accessTokenHash: access.tokenHash,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshTokenHash: nextRefresh.tokenHash,
      lastUsedAt: input.now.toISOString(),
      expiresAt: refreshTokenExpiresAt.toISOString()
    });

    if (!rotated) return { kind: "invalid" };

    await store.createRefreshRetryReceipt({
      refreshTokenId: refreshToken.id,
      operationId,
      encryptedTokenPair: input.retryReceiptCipher.encrypt({
        sessionId: session.id,
        refreshTokenId: refreshToken.id,
        operationId,
        accessToken: access.token,
        accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
        refreshToken: nextRefresh.token,
        refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString()
      }),
      createdAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + 60_000).toISOString()
    });
    await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: "refresh_succeeded",
        occurredAt: input.now,
        userId: session.userId,
        metadata: { mobileSessionId: session.id }
      })
    );

    return {
      kind: "refreshed",
      sessionId: session.id,
      accessToken: access.token,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken: nextRefresh.token,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString()
    };
  });
}

export async function verifyMobilePasswordlessRegistration(input: {
  readonly registration: MobilePasswordlessRegistrationUnitOfWork;
  readonly tokenIssuer: MobileSessionTokenIssuer;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly displayName: string;
  readonly platform: MobileSessionPlatform;
  readonly deviceLabel: string;
  readonly now: Date;
  readonly accessTokenTtlSeconds: number;
  readonly idleTtlSeconds: number;
  readonly trustedStaticCode?: PasswordlessTrustedStaticCode | null;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}): Promise<AuthenticatedMobilePasswordlessLogin> {
  validateMobileSessionIssueInput({
    userId: "passwordless-registration",
    deviceLabel: input.deviceLabel,
    now: input.now,
    accessTokenTtlSeconds: input.accessTokenTtlSeconds,
    idleTtlSeconds: input.idleTtlSeconds
  });
  const access = input.tokenIssuer.issueToken();
  const refresh = input.tokenIssuer.issueToken();
  assertDistinctIssuedTokens(access, refresh);

  return input.registration.transact(async (store) => {
    const challenge = await verifyPasswordlessCodeForRegistration({
      store,
      challengeId: input.challengeId,
      code: input.code,
      codeSecret: input.codeSecret,
      now: input.now,
      roles: ["astrologer"],
      trustedStaticCode: input.trustedStaticCode ?? null
    });
    const user = await createActiveUserAccount({ store });
    await createUserProfile({ store, userId: user.id, displayName: input.displayName });
    await linkAuthIdentity({
      store,
      userId: user.id,
      identity:
        challenge.channel === "email"
          ? {
              provider: "email",
              providerSubject: challenge.identifierNormalized,
              email: challenge.identifierNormalized,
              emailVerifiedAt: input.now
            }
          : {
              provider: "phone",
              providerSubject: challenge.identifierNormalized,
              phoneNumber: challenge.identifierNormalized,
              phoneVerifiedAt: input.now
            }
    });
    await grantCustomerRole({
      store,
      userId: user.id,
      role: "astrologer"
    });
    const created = await createMobileSessionInStore({
      store,
      access,
      refresh,
      userId: user.id,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      now: input.now,
      accessTokenTtlSeconds: input.accessTokenTtlSeconds,
      idleTtlSeconds: input.idleTtlSeconds
    });
    const securityEvent = await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: "registration_succeeded",
        occurredAt: input.now,
        userId: user.id,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
        metadata: {
          authenticationKind: "mobile",
          mobileSessionId: created.session.id,
          platform: input.platform
        }
      })
    );
    return {
      ...created,
      account: { id: user.id, status: "active", roles: ["astrologer"] },
      securityEvent
    };
  });
}

export async function revokeMobileSession(input: {
  readonly sessions: MobileSessionUnitOfWork<MobileSessionRevocationStore>;
  readonly sessionId: string;
  readonly userId?: string;
  readonly now: Date;
  readonly reason: string;
}): Promise<void> {
  await input.sessions.transact(async (store) => {
    await store.revokeSession({
      sessionId: input.sessionId,
      revokedAt: input.now.toISOString(),
      revokedReason: input.reason
    });
    if (input.userId) {
      await store.recordSecurityEvent(
        normalizeAuthSecurityEventInput({
          eventType: input.reason === "logout" ? "logout_succeeded" : "session_revoked",
          occurredAt: input.now,
          userId: input.userId,
          metadata: { mobileSessionId: input.sessionId, reason: input.reason }
        })
      );
    }
  });
}

export async function revokeAllMobileSessions(input: {
  readonly sessions: MobileSessionUnitOfWork<MobileSessionRevocationStore>;
  readonly userId: string;
  readonly now: Date;
  readonly reason: string;
}): Promise<void> {
  await input.sessions.transact(async (store) => {
    await store.revokeAllSessionsForUser({
      userId: input.userId,
      revokedAt: input.now.toISOString(),
      revokedReason: input.reason
    });
    await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: input.reason === "logout_all" ? "logout_succeeded" : "session_revoked",
        occurredAt: input.now,
        userId: input.userId,
        metadata: { mobileSessionScope: "all", reason: input.reason }
      })
    );
  });
}

export function isMobileSessionUsable(session: MobileSession, now: Date): boolean {
  return (
    session.status === "active" &&
    new Date(session.accessTokenExpiresAt).getTime() > now.getTime() &&
    new Date(session.expiresAt).getTime() > now.getTime()
  );
}

export async function resolveAuthenticatedMobileSession(input: {
  readonly store: MobileSessionAuthenticationStore;
  readonly accessTokenHash: string;
  readonly now: Date;
}): Promise<AuthenticatedMobileSessionContext | null> {
  const tokenHash = input.accessTokenHash.trim();
  if (!tokenHash) return null;
  const context = await input.store.findByAccessTokenHash(tokenHash);
  if (
    !context ||
    context.user.status !== "active" ||
    !isMobileSessionUsable(context.session, input.now)
  ) {
    return null;
  }
  return context;
}

async function createMobileSessionInStore(input: {
  readonly store: MobileSessionCreationStore;
  readonly access: IssuedMobileToken;
  readonly refresh: IssuedMobileToken;
  readonly userId: string;
  readonly platform: MobileSessionPlatform;
  readonly deviceLabel: string;
  readonly now: Date;
  readonly accessTokenTtlSeconds: number;
  readonly idleTtlSeconds: number;
}): Promise<CreatedMobileSession> {
  const accessTokenExpiresAt = new Date(input.now.getTime() + input.accessTokenTtlSeconds * 1000);
  const refreshTokenExpiresAt = new Date(input.now.getTime() + input.idleTtlSeconds * 1000);
  const session = await input.store.createMobileSession({
    userId: input.userId,
    platform: input.platform,
    deviceLabel: input.deviceLabel.trim(),
    accessTokenHash: input.access.tokenHash,
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    refreshTokenHash: input.refresh.tokenHash,
    createdAt: input.now.toISOString(),
    expiresAt: refreshTokenExpiresAt.toISOString()
  });

  return {
    session,
    accessToken: input.access.token,
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    refreshToken: input.refresh.token,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString()
  };
}

function validateMobileSessionIssueInput(input: {
  readonly userId: string;
  readonly deviceLabel: string;
  readonly now: Date;
  readonly accessTokenTtlSeconds: number;
  readonly idleTtlSeconds: number;
}): void {
  if (!input.userId.trim()) throw new Error("Mobile session user id is required");
  const deviceLabel = input.deviceLabel.trim();
  if (!deviceLabel || deviceLabel.length > 120) {
    throw new Error("Mobile device label must contain between 1 and 120 characters");
  }
  if (!Number.isFinite(input.now.getTime())) throw new Error("Mobile session time is invalid");
  validateMobileSessionTtls(input.accessTokenTtlSeconds, input.idleTtlSeconds);
}

function validateMobileSessionTtls(accessTokenTtlSeconds: number, idleTtlSeconds: number): void {
  if (!Number.isSafeInteger(accessTokenTtlSeconds) || accessTokenTtlSeconds <= 0) {
    throw new Error("Mobile access token TTL must be a positive integer");
  }
  if (!Number.isSafeInteger(idleTtlSeconds) || idleTtlSeconds <= 0) {
    throw new Error("Mobile session idle TTL must be a positive integer");
  }
  if (idleTtlSeconds < accessTokenTtlSeconds) {
    throw new Error("Mobile session idle TTL cannot be shorter than access token TTL");
  }
}

function assertDistinctIssuedTokens(access: IssuedMobileToken, refresh: IssuedMobileToken): void {
  if (
    !access.token.trim() ||
    !access.tokenHash.trim() ||
    !refresh.token.trim() ||
    !refresh.tokenHash.trim()
  ) {
    throw new Error("Mobile token issuer returned an empty token");
  }
  if (access.token === refresh.token || access.tokenHash === refresh.tokenHash) {
    throw new Error("Mobile access and refresh tokens must be distinct");
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
