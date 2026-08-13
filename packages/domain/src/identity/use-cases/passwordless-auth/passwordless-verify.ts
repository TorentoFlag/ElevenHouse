import type { UserAccount } from "../../../accounts";
import type { AuthIdentity } from "../../../auth-identities";
import { normalizeAuthSecurityEventInput, type AuthSecurityEvent } from "../../../auth-sessions";
import {
  normalizeAuthSessionCreationInput,
  type AuthSession,
  type AuthSessionCreationInput
} from "../../../auth-sessions";
import type { UserRoleAssignment } from "../../../roles";
import {
  PasswordlessCodeVerificationError,
  type PasswordlessVerifiedIdentity,
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
  readonly createSession: (
    input: ReturnType<typeof normalizeAuthSessionCreationInput>
  ) => Promise<AuthSession>;
  readonly recordSecurityEvent: (
    input: ReturnType<typeof normalizeAuthSecurityEventInput>
  ) => Promise<AuthSecurityEvent>;
};

export type PasswordlessLoginVerificationStore = Omit<
  PasswordlessVerificationStore,
  "createSession"
>;

export type PasswordlessRegistrationChallenge = {
  readonly channel: "email" | "phone";
  readonly identifierNormalized: string;
  readonly requestedRoles: readonly ("client" | "astrologer")[];
};

export type PasswordlessTrustedStaticCode = {
  readonly channel: "email" | "phone";
  readonly identifierNormalized: string;
  readonly code: string;
};

export async function verifyPasswordlessCodeForRegistration(input: {
  readonly store: PasswordlessVerificationStore;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly now: Date;
  readonly roles?: readonly string[];
  readonly trustedStaticCode?: PasswordlessTrustedStaticCode | null;
}): Promise<PasswordlessRegistrationChallenge> {
  const challenge = await verifyUsableChallengeCode({
    store: input.store,
    challengeId: input.challengeId,
    code: input.code,
    codeSecret: input.codeSecret,
    now: input.now,
    authFlow: "registration",
    trustedStaticCode: input.trustedStaticCode ?? null
  });

  if (input.roles) {
    assertRequestedRolesMatchChallenge({
      requestedRoles: input.roles,
      challengeRoles: challenge.requestedRoles
    });
  }

  await input.store.consumeChallenge({
    challengeId: challenge.id,
    consumedAt: input.now.toISOString()
  });

  return {
    channel: challenge.channel,
    identifierNormalized: challenge.identifierNormalized,
    requestedRoles: challenge.requestedRoles
  };
}

export async function verifyPasswordlessCode(input: {
  readonly store: PasswordlessVerificationStore;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly session: Omit<AuthSessionCreationInput, "userId">;
  readonly now: Date;
  readonly trustedStaticCode?: PasswordlessTrustedStaticCode | null;
}): Promise<PasswordlessAuthenticatedAccount> {
  const accountContext = await verifyPasswordlessCodeForLogin(input);
  const session = await input.store.createSession(
    normalizeAuthSessionCreationInput({
      userId: accountContext.user.id,
      tokenHash: input.session.tokenHash,
      createdAt: input.session.createdAt,
      expiresAt: input.session.expiresAt,
      ...(input.session.ipAddress === undefined ? {} : { ipAddress: input.session.ipAddress }),
      ...(input.session.userAgent === undefined ? {} : { userAgent: input.session.userAgent })
    })
  );
  const securityEvent = await input.store.recordSecurityEvent(
    normalizeAuthSecurityEventInput({
      eventType: "login_succeeded",
      occurredAt: input.now,
      userId: accountContext.user.id,
      sessionId: session.id,
      ...(input.session.ipAddress === undefined ? {} : { ipAddress: input.session.ipAddress }),
      ...(input.session.userAgent === undefined ? {} : { userAgent: input.session.userAgent })
    })
  );

  return {
    ...accountContext,
    session,
    securityEvent,
    authenticationKind: "login"
  };
}

export async function verifyPasswordlessCodeForLogin(input: {
  readonly store: PasswordlessLoginVerificationStore;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly now: Date;
  readonly trustedStaticCode?: PasswordlessTrustedStaticCode | null;
}): Promise<PasswordlessVerifiedIdentity> {
  const challengeId = input.challengeId.trim();
  const challenge = await verifyUsableChallengeCode({
    store: input.store,
    challengeId,
    code: input.code,
    codeSecret: input.codeSecret,
    now: input.now,
    authFlow: "login",
    trustedStaticCode: input.trustedStaticCode ?? null
  });

  await input.store.consumeChallenge({
    challengeId: challenge.id,
    consumedAt: input.now.toISOString()
  });

  const existingIdentity = await input.store.findAuthIdentityByProviderSubject({
    provider: challenge.channel,
    providerSubject: challenge.identifierNormalized
  });
  if (!existingIdentity) {
    throw new PasswordlessCodeVerificationError();
  }

  assertRequestedRolesAssigned({ accountContext: existingIdentity, challenge });
  return {
    user: existingIdentity.user,
    authIdentity: existingIdentity.authIdentity,
    roleAssignments: existingIdentity.roleAssignments
  };
}

async function verifyUsableChallengeCode(input: {
  readonly store: PasswordlessLoginVerificationStore;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly now: Date;
  readonly authFlow: "login" | "registration";
  readonly trustedStaticCode: PasswordlessTrustedStaticCode | null;
}): Promise<AuthChallenge> {
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

  const isTrustedStaticCode =
    input.trustedStaticCode !== null &&
    input.code === input.trustedStaticCode.code &&
    challenge.channel === input.trustedStaticCode.channel &&
    challenge.identifierNormalized === input.trustedStaticCode.identifierNormalized;

  if (submittedCodeHash !== challenge.codeHash && !isTrustedStaticCode) {
    await input.store.incrementChallengeAttempts({
      challengeId: challenge.id,
      attemptedAt: input.now.toISOString()
    });
    await input.store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: "login_failed",
        occurredAt: input.now,
        ...(challenge.ipAddress === undefined ? {} : { ipAddress: challenge.ipAddress }),
        ...(challenge.userAgent === undefined ? {} : { userAgent: challenge.userAgent }),
        metadata: {
          challengeId: challenge.id,
          channel: challenge.channel,
          ...(input.authFlow === "registration" ? { authFlow: input.authFlow } : {})
        }
      })
    );
    throw new PasswordlessCodeVerificationError();
  }

  return challenge;
}

function assertRequestedRolesAssigned(input: {
  readonly accountContext: ExistingPasswordlessIdentity;
  readonly challenge: AuthChallenge;
}): void {
  const existingRoles = new Set(
    input.accountContext.roleAssignments.map((assignment) => assignment.role)
  );

  for (const role of input.challenge.requestedRoles) {
    if (!existingRoles.has(role)) {
      throw new PasswordlessCodeVerificationError();
    }
  }
}

function assertRequestedRolesMatchChallenge(input: {
  readonly requestedRoles: readonly string[];
  readonly challengeRoles: readonly ("client" | "astrologer")[];
}): void {
  const requestedRoles = new Set(input.requestedRoles);
  const challengeRoles = new Set(input.challengeRoles);

  if (
    requestedRoles.size !== challengeRoles.size ||
    input.requestedRoles.some((role) => !challengeRoles.has(role as "client" | "astrologer"))
  ) {
    throw new PasswordlessCodeVerificationError();
  }
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
