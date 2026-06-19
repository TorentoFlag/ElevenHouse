import { randomUUID } from "node:crypto";
import type {
  AuthChallenge,
  AuthChallengeDelivery,
  AuthCodeDeliveryRequestedPayload,
  AuthSecurityEvent,
  AuthSession,
  AuthSessionAuthenticationStore,
  PasswordlessAuthStore,
  UserAccount,
  UserRoleAssignment
} from "@elevenhouse/domain";

export class InMemoryPasswordlessAuthStore
  implements PasswordlessAuthStore, AuthSessionAuthenticationStore
{
  readonly authChallenges: AuthChallenge[] = [];
  readonly authChallengeDeliveries: AuthChallengeDelivery[] = [];
  readonly users: UserAccount[] = [];
  readonly authIdentities: Array<{
    readonly id: string;
    readonly userId: string;
    readonly provider: "email" | "phone";
    readonly providerSubject: string;
    readonly email?: string;
    readonly phoneNumber?: string;
    readonly emailVerifiedAt?: string;
    readonly phoneVerifiedAt?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }> = [];
  readonly roleAssignments: UserRoleAssignment[] = [];
  readonly userSessions: AuthSession[] = [];
  readonly authSecurityEvents: AuthSecurityEvent[] = [];
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
  }): Promise<void> {
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
