import { randomUUID } from "node:crypto";
import { CustomerAccountIdentityConflictError } from "@elevenhouse/domain";
import type {
  AuthChallenge,
  AuthChallengeDelivery,
  AuthCodeDeliveryRequestedPayload,
  AuthIdentity,
  AuthSecurityEvent,
  AuthSession,
  AuthSessionAuthenticationStore,
  CustomerAccountRegistrationSessionStore,
  PasswordlessAuthStore,
  UserAccount,
  UserProfile,
  UserRoleAssignment,
  MobileSession,
  MobileRefreshToken,
  MobileSessionPlatform
} from "@elevenhouse/domain";

export class InMemoryPasswordlessAuthStore
  implements PasswordlessAuthStore, AuthSessionAuthenticationStore
{
  readonly authChallenges: AuthChallenge[] = [];
  readonly authChallengeDeliveries: AuthChallengeDelivery[] = [];
  readonly users: UserAccount[] = [];
  readonly userProfiles: UserProfile[] = [];
  readonly authIdentities: AuthIdentity[] = [];
  readonly roleAssignments: UserRoleAssignment[] = [];
  readonly userSessions: AuthSession[] = [];
  readonly authSecurityEvents: AuthSecurityEvent[] = [];
  readonly mobileSessions: MobileSession[] = [];
  readonly mobileRefreshTokens: MobileRefreshToken[] = [];
  readonly mobileRefreshRetryReceipts: Array<{
    readonly refreshTokenId: string;
    readonly operationId: string;
    readonly encryptedTokenPair: string;
    readonly expiresAt: string;
  }> = [];
  readonly authCodeDeliveryRequestedEvents: Array<{
    readonly payload: AuthCodeDeliveryRequestedPayload;
    readonly occurredAt: string;
  }> = [];

  constructor(readonly now: Date) {}

  async createChallenge(
    input: Parameters<PasswordlessAuthStore["createChallenge"]>[0]
  ): Promise<AuthChallenge> {
    const challenge: AuthChallenge = {
      id: randomUUID(),
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: this.now.toISOString(),
      updatedAt: this.now.toISOString()
    };
    this.authChallenges.push(challenge);
    return challenge;
  }

  async recordDelivery(
    input: Parameters<PasswordlessAuthStore["recordDelivery"]>[0]
  ): Promise<AuthChallengeDelivery> {
    const delivery: AuthChallengeDelivery = {
      id: randomUUID(),
      createdAt: this.now.toISOString(),
      ...input
    };
    this.authChallengeDeliveries.push(delivery);
    return delivery;
  }

  async recordAuthCodeDeliveryRequested(
    input: Parameters<PasswordlessAuthStore["recordAuthCodeDeliveryRequested"]>[0]
  ): Promise<void> {
    this.authCodeDeliveryRequestedEvents.push(input);
  }

  async cancelChallenge(
    input: Parameters<PasswordlessAuthStore["cancelChallenge"]>[0]
  ): Promise<void> {
    const challenge = this.requireChallenge(input.challengeId);
    Object.assign(challenge, {
      status: "cancelled",
      cancelledAt: input.cancelledAt,
      updatedAt: input.cancelledAt
    });
  }

  async findPendingChallengeByIdentifier(
    input: Parameters<NonNullable<PasswordlessAuthStore["findPendingChallengeByIdentifier"]>>[0]
  ): Promise<AuthChallenge | null> {
    return (
      [...this.authChallenges]
        .reverse()
        .find(
          (challenge) =>
            challenge.channel === input.channel &&
            challenge.identifierNormalized === input.identifierNormalized &&
            challenge.status === "pending"
        ) ?? null
    );
  }

  async findLatestDeliveryByChallengeId(challengeId: string): Promise<AuthChallengeDelivery | null> {
    return (
      [...this.authChallengeDeliveries]
        .reverse()
        .find((delivery) => delivery.challengeId === challengeId) ?? null
    );
  }

  async findChallengeById(challengeId: string): Promise<AuthChallenge | null> {
    return this.authChallenges.find((challenge) => challenge.id === challengeId) ?? null;
  }

  async incrementChallengeAttempts(
    input: Parameters<PasswordlessAuthStore["incrementChallengeAttempts"]>[0]
  ): Promise<void> {
    const challenge = this.requireChallenge(input.challengeId);
    Object.assign(challenge, {
      attempts: challenge.attempts + 1,
      updatedAt: input.attemptedAt
    });
  }

  async consumeChallenge(
    input: Parameters<PasswordlessAuthStore["consumeChallenge"]>[0]
  ): Promise<void> {
    const challenge = this.requireChallenge(input.challengeId);
    Object.assign(challenge, {
      status: "consumed",
      consumedAt: input.consumedAt,
      updatedAt: input.consumedAt
    });
  }

  async revokeSession(input: {
    readonly sessionId: string;
    readonly revokedAt: string;
    readonly revokedReason?: string;
  }): Promise<void> {
    if (input.revokedReason) {
      await this.revokeMobileSession({
        sessionId: input.sessionId,
        revokedAt: input.revokedAt,
        revokedReason: input.revokedReason
      });
      return;
    }
    const session = this.userSessions.find((candidate) => candidate.id === input.sessionId);

    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    Object.assign(session, {
      status: "revoked",
      revokedAt: input.revokedAt
    });
  }

  async findAuthIdentityByProviderSubject(
    input: Parameters<PasswordlessAuthStore["findAuthIdentityByProviderSubject"]>[0]
  ) {
    const authIdentity = this.authIdentities.find(
      (identity) =>
        identity.provider === input.provider && identity.providerSubject === input.providerSubject
    );

    if (!authIdentity) {
      return null;
    }

    const user = this.requireUser(authIdentity.userId);

    return {
      user,
      authIdentity,
      roleAssignments: this.roleAssignments.filter((assignment) => assignment.userId === user.id)
    };
  }

  async createUser(input: { readonly status: "active" | "suspended" | "deleted" }): Promise<UserAccount> {
    const now = this.now.toISOString();
    const user: UserAccount = {
      id: randomUUID(),
      status: input.status,
      createdAt: now,
      updatedAt: now
    };
    this.users.push(user);
    return user;
  }

  async createUserProfile(input: {
    readonly userId: string;
    readonly displayName: string;
  }): Promise<UserProfile> {
    const now = this.now.toISOString();
    const profile: UserProfile = {
      userId: input.userId,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now
    };
    this.userProfiles.push(profile);
    return profile;
  }

  async createAuthIdentity(
    input: Parameters<CustomerAccountRegistrationSessionStore["createAuthIdentity"]>[0]
  ): Promise<AuthIdentity> {
    if (input.provider !== "email" && input.provider !== "phone") {
      throw new Error(`Unsupported test identity provider: ${input.provider}`);
    }

    const existingIdentity = this.authIdentities.find(
      (identity) =>
        identity.provider === input.provider && identity.providerSubject === input.providerSubject
    );

    if (existingIdentity) {
      throw new CustomerAccountIdentityConflictError();
    }

    const now = this.now.toISOString();
    const authIdentity: AuthIdentity = {
      id: randomUUID(),
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.phoneNumber === undefined ? {} : { phoneNumber: input.phoneNumber }),
      ...(input.emailVerifiedAt === undefined ? {} : { emailVerifiedAt: input.emailVerifiedAt }),
      ...(input.phoneVerifiedAt === undefined ? {} : { phoneVerifiedAt: input.phoneVerifiedAt }),
      createdAt: now,
      updatedAt: now
    };
    this.authIdentities.push(authIdentity);
    return authIdentity;
  }

  async assignRole(input: {
    readonly userId: string;
    readonly role: "client" | "astrologer";
    readonly assignedByUserId?: string;
  }): Promise<UserRoleAssignment> {
    const assignment: UserRoleAssignment = {
      id: randomUUID(),
      userId: input.userId,
      role: input.role,
      ...(input.assignedByUserId === undefined
        ? {}
        : { assignedByUserId: input.assignedByUserId }),
      assignedAt: this.now.toISOString()
    };
    this.roleAssignments.push(assignment);
    return assignment;
  }

  async createSession(
    input: Parameters<PasswordlessAuthStore["createSession"]>[0]
  ): Promise<AuthSession> {
    const session: AuthSession = {
      id: randomUUID(),
      status: "active",
      ...input
    };
    this.userSessions.push(session);
    return session;
  }

  async recordSecurityEvent(
    input: Parameters<PasswordlessAuthStore["recordSecurityEvent"]>[0]
  ): Promise<AuthSecurityEvent> {
    const securityEvent: AuthSecurityEvent = {
      id: randomUUID(),
      ...input,
      metadata: input.metadata ?? {}
    };
    this.authSecurityEvents.push(securityEvent);
    return securityEvent;
  }

  async findByTokenHash(tokenHash: string) {
    const session = this.userSessions.find((candidate) => candidate.tokenHash === tokenHash);

    if (!session) {
      return null;
    }

    const user = this.requireUser(session.userId);

    return {
      session,
      user,
      roleAssignments: this.roleAssignments.filter((assignment) => assignment.userId === user.id)
    };
  }

  async createMobileSession(input: {
    readonly userId: string;
    readonly platform: MobileSessionPlatform;
    readonly deviceLabel: string;
    readonly accessTokenHash: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshTokenHash: string;
    readonly createdAt: string;
    readonly expiresAt: string;
  }): Promise<MobileSession> {
    const session: MobileSession = {
      id: randomUUID(),
      userId: input.userId,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      status: "active",
      accessTokenHash: input.accessTokenHash,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      createdAt: input.createdAt,
      lastUsedAt: input.createdAt,
      expiresAt: input.expiresAt
    };
    this.mobileSessions.push(session);
    this.mobileRefreshTokens.push({
      id: randomUUID(),
      sessionId: session.id,
      tokenHash: input.refreshTokenHash,
      status: "active",
      createdAt: input.createdAt,
      expiresAt: input.expiresAt
    });
    return session;
  }

  async findByAccessTokenHash(tokenHash: string) {
    const session = this.mobileSessions.find((candidate) => candidate.accessTokenHash === tokenHash);
    if (!session) return null;
    const user = this.requireUser(session.userId);
    return {
      session,
      user,
      roleAssignments: this.roleAssignments.filter((assignment) => assignment.userId === user.id)
    };
  }

  async lockRefreshFamilyByTokenHash(tokenHash: string) {
    const refreshToken = this.mobileRefreshTokens.find((candidate) => candidate.tokenHash === tokenHash);
    if (!refreshToken) return null;
    const session = this.mobileSessions.find((candidate) => candidate.id === refreshToken.sessionId);
    return session ? { refreshToken, session } : null;
  }

  async purgeExpiredArtifacts(input: { readonly now: string }): Promise<void> {
    const expiredReceiptIds = new Set(
      this.mobileRefreshRetryReceipts
        .filter((receipt) => receipt.expiresAt <= input.now)
        .map((receipt) => `${receipt.refreshTokenId}:${receipt.operationId}`)
    );
    const remainingReceipts = this.mobileRefreshRetryReceipts.filter(
      (receipt) => !expiredReceiptIds.has(`${receipt.refreshTokenId}:${receipt.operationId}`)
    );
    this.mobileRefreshRetryReceipts.splice(0, this.mobileRefreshRetryReceipts.length, ...remainingReceipts);
    const remainingTokens = this.mobileRefreshTokens.filter(
      (token) =>
        token.expiresAt > input.now || (token.status !== "consumed" && token.status !== "revoked")
    );
    this.mobileRefreshTokens.splice(0, this.mobileRefreshTokens.length, ...remainingTokens);
  }

  async consumeRefreshToken(input: { readonly refreshTokenId: string; readonly consumedAt: string }) {
    const token = this.mobileRefreshTokens.find((candidate) => candidate.id === input.refreshTokenId);
    if (!token || token.status !== "active") return false;
    Object.assign(token, { status: "consumed", consumedAt: input.consumedAt });
    return true;
  }

  async rotateSession(input: {
    readonly sessionId: string;
    readonly accessTokenHash: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshTokenHash: string;
    readonly lastUsedAt: string;
    readonly expiresAt: string;
  }) {
    const session = this.mobileSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session || session.status !== "active") return false;
    Object.assign(session, {
      accessTokenHash: input.accessTokenHash,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      lastUsedAt: input.lastUsedAt,
      expiresAt: input.expiresAt
    });
    this.mobileRefreshTokens.push({
      id: randomUUID(),
      sessionId: session.id,
      tokenHash: input.refreshTokenHash,
      status: "active",
      createdAt: input.lastUsedAt,
      expiresAt: input.expiresAt
    });
    return true;
  }

  async findRefreshRetryReceipt(input: {
    readonly refreshTokenId: string;
    readonly operationId: string;
    readonly now: string;
  }) {
    return (
      this.mobileRefreshRetryReceipts.find(
        (receipt) =>
          receipt.refreshTokenId === input.refreshTokenId &&
          receipt.operationId === input.operationId &&
          receipt.expiresAt > input.now
      ) ?? null
    );
  }

  async createRefreshRetryReceipt(input: {
    readonly refreshTokenId: string;
    readonly operationId: string;
    readonly encryptedTokenPair: string;
    readonly createdAt: string;
    readonly expiresAt: string;
  }) {
    this.mobileRefreshRetryReceipts.push(input);
  }

  async revokeAllSessionsForUser(input: {
    readonly userId: string;
    readonly revokedAt: string;
    readonly revokedReason: string;
  }): Promise<void> {
    await Promise.all(
      this.mobileSessions
        .filter((session) => session.userId === input.userId)
        .map((session) =>
          this.revokeMobileSession({
            sessionId: session.id,
            revokedAt: input.revokedAt,
            revokedReason: input.revokedReason
          })
        )
    );
  }

  async revokeMobileSession(input: {
    readonly sessionId: string;
    readonly revokedAt: string;
    readonly revokedReason: string;
  }): Promise<void> {
    const session = this.mobileSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session || session.status !== "active") return;
    Object.assign(session, {
      status: "revoked",
      revokedAt: input.revokedAt,
      revokedReason: input.revokedReason
    });
    for (const token of this.mobileRefreshTokens) {
      if (token.sessionId === input.sessionId && token.status === "active") {
        Object.assign(token, { status: "revoked" });
      }
    }
  }

  async listActiveSessionsForUser(input: { readonly userId: string; readonly now: string }) {
    return this.mobileSessions.filter(
      (session) =>
        session.userId === input.userId && session.status === "active" && session.expiresAt > input.now
    );
  }

  private requireChallenge(challengeId: string): AuthChallenge {
    const challenge = this.authChallenges.find((candidate) => candidate.id === challengeId);

    if (!challenge) {
      throw new Error(`Challenge not found: ${challengeId}`);
    }

    return challenge;
  }

  private requireUser(userId: string): UserAccount {
    const user = this.users.find((candidate) => candidate.id === userId);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return user;
  }
}

export function seedExistingPasswordlessAccount(
  store: InMemoryPasswordlessAuthStore,
  input: {
    readonly channel: "email" | "phone";
    readonly identifierNormalized: string;
    readonly roles: readonly ("client" | "astrologer")[];
  }
): UserAccount {
  const now = store.now.toISOString();
  const user: UserAccount = {
    id: randomUUID(),
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  store.users.push(user);
  store.authIdentities.push({
    id: randomUUID(),
    userId: user.id,
    provider: input.channel,
    providerSubject: input.identifierNormalized,
    ...(input.channel === "email"
      ? { email: input.identifierNormalized, emailVerifiedAt: now }
      : { phoneNumber: input.identifierNormalized, phoneVerifiedAt: now }),
    createdAt: now,
    updatedAt: now
  });

  for (const role of input.roles) {
    store.roleAssignments.push({
      id: randomUUID(),
      userId: user.id,
      role,
      assignedAt: now
    });
  }

  return user;
}
