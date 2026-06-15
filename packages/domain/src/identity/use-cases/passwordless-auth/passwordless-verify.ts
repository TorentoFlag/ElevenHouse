import type { CustomerPlatformRole } from "@elevenhouse/auth";
import type { UserAccount, UserAccountStatus } from "../../../accounts";
import type { AuthIdentity, NormalizedAuthIdentityInput } from "../../../auth-identities";
import {
  normalizeAuthSecurityEventInput,
  type AuthSecurityEvent
} from "../../../auth-sessions";
import {
  normalizeAuthSessionCreationInput,
  type AuthSession,
  type AuthSessionCreationInput
} from "../../../auth-sessions";
import type { UserRoleAssignment } from "../../../roles";
import {
  PasswordlessCodeVerificationError,
  type AuthChallenge,
  type PasswordlessAuthenticatedAccount
} from "./passwordless-challenge";
import { hashPasswordlessCode } from "./passwordless-code";

export type ExistingPasswordlessIdentity = {
  readonly user: UserAccount;
  readonly authIdentity: AuthIdentity;
  readonly roleAssignments: readonly UserRoleAssignment[];
};

export type PasswordlessVerificationStore = {
  readonly findChallengeById: (challengeId: string) => Promise<AuthChallenge | null>;
  readonly incrementChallengeAttempts: (input: {
    readonly challengeId: string;
    readonly attemptedAt: string;
  }) => Promise<void>;
  readonly consumeChallenge: (input: {
    readonly challengeId: string;
    readonly consumedAt: string;
  }) => Promise<void>;
  readonly findAuthIdentityByProviderSubject: (input: {
    readonly provider: "email" | "phone";
    readonly providerSubject: string;
  }) => Promise<ExistingPasswordlessIdentity | null>;
  readonly createUser: (input: { readonly status: UserAccountStatus }) => Promise<UserAccount>;
  readonly createAuthIdentity: (
    input: NormalizedAuthIdentityInput & { readonly userId: string }
  ) => Promise<AuthIdentity>;
  readonly assignRole: (input: {
    readonly userId: string;
    readonly role: CustomerPlatformRole;
  }) => Promise<UserRoleAssignment>;
  readonly createSession: (
    input: ReturnType<typeof normalizeAuthSessionCreationInput>
  ) => Promise<AuthSession>;
  readonly recordSecurityEvent: (
    input: ReturnType<typeof normalizeAuthSecurityEventInput>
  ) => Promise<AuthSecurityEvent>;
};

export async function verifyPasswordlessCode(input: {
  readonly store: PasswordlessVerificationStore;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly session: Omit<AuthSessionCreationInput, "userId">;
  readonly now: Date;
}): Promise<PasswordlessAuthenticatedAccount> {
  const challengeId = input.challengeId.trim();
  if (!challengeId) {
    throw new PasswordlessCodeVerificationError();
  }

  const challenge = await input.store.findChallengeById(challengeId);
  assertChallengeUsable(challenge, input.now);

  const submittedCodeHash = hashPasswordlessCode({
    secret: input.codeSecret,
    channel: challenge.channel,
    identifierNormalized: challenge.identifierNormalized,
    code: input.code
  });

  if (submittedCodeHash !== challenge.codeHash) {
    await input.store.incrementChallengeAttempts({
      challengeId: challenge.id,
      attemptedAt: input.now.toISOString()
    });
    await input.store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: "login_failed",
        occurredAt: input.now,
        ipAddress: challenge.ipAddress,
        userAgent: challenge.userAgent,
        metadata: {
          challengeId: challenge.id,
          channel: challenge.channel
        }
      })
    );
    throw new PasswordlessCodeVerificationError();
  }

  await input.store.consumeChallenge({
    challengeId: challenge.id,
    consumedAt: input.now.toISOString()
  });

  const existingIdentity = await input.store.findAuthIdentityByProviderSubject({
    provider: challenge.channel,
    providerSubject: challenge.identifierNormalized
  });
  const accountContext =
    existingIdentity ?? (await createPasswordlessAccount({ store: input.store, challenge, now: input.now }));
  const session = await input.store.createSession(
    normalizeAuthSessionCreationInput({
      userId: accountContext.user.id,
      tokenHash: input.session.tokenHash,
      createdAt: input.session.createdAt,
      expiresAt: input.session.expiresAt,
      ipAddress: input.session.ipAddress,
      userAgent: input.session.userAgent
    })
  );
  const authenticationKind = existingIdentity ? "login" : "registration";
  const securityEvent = await input.store.recordSecurityEvent(
    normalizeAuthSecurityEventInput({
      eventType: authenticationKind === "login" ? "login_succeeded" : "registration_succeeded",
      occurredAt: input.now,
      userId: accountContext.user.id,
      sessionId: session.id,
      ipAddress: input.session.ipAddress,
      userAgent: input.session.userAgent
    })
  );

  return {
    user: accountContext.user,
    authIdentity: accountContext.authIdentity,
    roleAssignments: accountContext.roleAssignments,
    session,
    securityEvent,
    authenticationKind
  };
}

async function createPasswordlessAccount(input: {
  readonly store: PasswordlessVerificationStore;
  readonly challenge: AuthChallenge;
  readonly now: Date;
}): Promise<ExistingPasswordlessIdentity> {
  const user = await input.store.createUser({ status: "active" });
  const verifiedAt = input.now.toISOString();
  const authIdentity = await input.store.createAuthIdentity({
    userId: user.id,
    provider: input.challenge.channel,
    providerSubject: input.challenge.identifierNormalized,
    ...(input.challenge.channel === "email"
      ? { email: input.challenge.identifierNormalized, emailVerifiedAt: verifiedAt }
      : { phoneNumber: input.challenge.identifierNormalized, phoneVerifiedAt: verifiedAt })
  });
  const roleAssignments: UserRoleAssignment[] = [];

  for (const role of input.challenge.requestedRoles) {
    roleAssignments.push(await input.store.assignRole({ userId: user.id, role }));
  }

  return {
    user,
    authIdentity,
    roleAssignments
  };
}

function assertChallengeUsable(
  challenge: AuthChallenge | null,
  now: Date
): asserts challenge is AuthChallenge {
  if (!challenge || challenge.status !== "pending") {
    throw new PasswordlessCodeVerificationError();
  }

  if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
    throw new PasswordlessCodeVerificationError();
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new PasswordlessCodeVerificationError();
  }
}
