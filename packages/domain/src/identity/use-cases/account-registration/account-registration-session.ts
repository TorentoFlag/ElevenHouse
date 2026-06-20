import {
  normalizeAuthSecurityEventInput,
  type AuthSecurityEvent,
  type AuthSecurityEventType
} from "../../../auth-sessions/auth-security-event";
import {
  normalizeAuthSessionCreationInput,
  type AuthSession,
  type AuthSessionCreationInput
} from "../../../auth-sessions/auth-session";
import type { AuthSessionCreationStore } from "../../../auth-sessions/session-creation";
import type { AuthIdentityInput } from "../../../auth-identities/auth-identity";
import {
  createActiveUserAccount,
  createUserProfile,
  grantCustomerRole,
  linkAuthIdentity,
  type AccountRegistrationStore,
  type RegisteredCustomerAccount
} from "./account-registration";
import { normalizeCustomerRoles } from "../../../roles";
import { normalizeAuthIdentityInput } from "../../../auth-identities/auth-identity";
import {
  verifyPasswordlessCodeForRegistration,
  type PasswordlessVerificationStore
} from "../passwordless-auth";

export type CustomerAccountRegistrationSessionStore = AccountRegistrationStore &
  AuthSessionCreationStore;

export type CustomerAccountRegistrationSessionUnitOfWork = {
  readonly transact: <T>(
    operation: (store: CustomerAccountRegistrationSessionStore) => Promise<T>
  ) => Promise<T>;
};

export type PasswordlessCustomerAccountRegistrationSessionStore =
  CustomerAccountRegistrationSessionStore & PasswordlessVerificationStore;

export type PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
  readonly transact: <T>(
    operation: (store: PasswordlessCustomerAccountRegistrationSessionStore) => Promise<T>
  ) => Promise<T>;
};

export type CustomerAccountRegistrationSessionInput = {
  readonly registration: CustomerAccountRegistrationSessionUnitOfWork;
  readonly identity: AuthIdentityInput;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly session: Omit<AuthSessionCreationInput, "userId">;
  readonly securityEventType: AuthSecurityEventType;
};

export type RegisteredCustomerAccountWithSession = RegisteredCustomerAccount & {
  readonly session: AuthSession;
  readonly securityEvent: AuthSecurityEvent;
};

export async function registerCustomerAccountWithSession(
  input: CustomerAccountRegistrationSessionInput
): Promise<RegisteredCustomerAccountWithSession> {
  const roles = normalizeCustomerRoles(input.roles);
  const identity = normalizeAuthIdentityInput(input.identity);

  return input.registration.transact((store) =>
    registerCustomerAccountWithSessionInStore({
      store,
      identity,
      displayName: input.displayName,
      roles,
      session: input.session,
      securityEventType: input.securityEventType
    })
  );
}

export async function verifyPasswordlessCodeAndRegisterCustomerAccountWithSession(input: {
  readonly registration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork;
  readonly challengeId: string;
  readonly code: string;
  readonly codeSecret: string;
  readonly now: Date;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly session: Omit<AuthSessionCreationInput, "userId" | "createdAt">;
  readonly securityEventType: AuthSecurityEventType;
}): Promise<RegisteredCustomerAccountWithSession> {
  const roles = normalizeCustomerRoles(input.roles);

  return input.registration.transact(async (store) => {
    const challenge = await verifyPasswordlessCodeForRegistration({
      store,
      challengeId: input.challengeId,
      code: input.code,
      codeSecret: input.codeSecret,
      now: input.now,
      roles
    });
    const identity = normalizeAuthIdentityInput(
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
    );

    return registerCustomerAccountWithSessionInStore({
      store,
      identity,
      displayName: input.displayName,
      roles,
      session: {
        ...input.session,
        createdAt: input.now
      },
      securityEventType: input.securityEventType
    });
  });
}

async function registerCustomerAccountWithSessionInStore(input: {
  readonly store: CustomerAccountRegistrationSessionStore;
  readonly identity: ReturnType<typeof normalizeAuthIdentityInput>;
  readonly displayName: string;
  readonly roles: readonly ReturnType<typeof normalizeCustomerRoles>[number][];
  readonly session: Omit<AuthSessionCreationInput, "userId">;
  readonly securityEventType: AuthSecurityEventType;
}): Promise<RegisteredCustomerAccountWithSession> {
  const user = await createActiveUserAccount({ store: input.store });
  const userProfile = await createUserProfile({
    store: input.store,
    userId: user.id,
    displayName: input.displayName
  });
  const authIdentity = await linkAuthIdentity({
    store: input.store,
    userId: user.id,
    identity: input.identity
  });
  const roleAssignments = [];

  for (const role of input.roles) {
    roleAssignments.push(await grantCustomerRole({ store: input.store, userId: user.id, role }));
  }

  const session = await input.store.createSession(
    normalizeAuthSessionCreationInput({
      userId: user.id,
      tokenHash: input.session.tokenHash,
      createdAt: input.session.createdAt,
      expiresAt: input.session.expiresAt,
      ...(input.session.ipAddress === undefined ? {} : { ipAddress: input.session.ipAddress }),
      ...(input.session.userAgent === undefined ? {} : { userAgent: input.session.userAgent })
    })
  );
  const securityEvent = await input.store.recordSecurityEvent(
    normalizeAuthSecurityEventInput({
      eventType: input.securityEventType,
      occurredAt: input.session.createdAt,
      userId: session.userId,
      sessionId: session.id,
      ...(input.session.ipAddress === undefined ? {} : { ipAddress: input.session.ipAddress }),
      ...(input.session.userAgent === undefined ? {} : { userAgent: input.session.userAgent })
    })
  );

  return {
    user,
    userProfile,
    authIdentity,
    roleAssignments,
    session,
    securityEvent
  };
}
