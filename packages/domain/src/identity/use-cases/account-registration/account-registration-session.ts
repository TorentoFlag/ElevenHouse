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
  grantCustomerRole,
  linkAuthIdentity,
  type AccountRegistrationStore,
  type RegisteredCustomerAccount
} from "./account-registration";
import { normalizeCustomerRoles } from "../../../roles";
import { normalizeAuthIdentityInput } from "../../../auth-identities/auth-identity";

export type CustomerAccountRegistrationSessionStore = AccountRegistrationStore &
  AuthSessionCreationStore;

export type CustomerAccountRegistrationSessionUnitOfWork = {
  readonly transact: <T>(
    operation: (store: CustomerAccountRegistrationSessionStore) => Promise<T>
  ) => Promise<T>;
};

export type CustomerAccountRegistrationSessionInput = {
  readonly registration: CustomerAccountRegistrationSessionUnitOfWork;
  readonly identity: AuthIdentityInput;
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

  return input.registration.transact(async (store) => {
    const user = await createActiveUserAccount({ store });
    const authIdentity = await linkAuthIdentity({
      store,
      userId: user.id,
      identity
    });
    const roleAssignments = [];

    for (const role of roles) {
      roleAssignments.push(await grantCustomerRole({ store, userId: user.id, role }));
    }

    const session = await store.createSession(
      normalizeAuthSessionCreationInput({
        userId: user.id,
        tokenHash: input.session.tokenHash,
        createdAt: input.session.createdAt,
        expiresAt: input.session.expiresAt,
        ...(input.session.ipAddress === undefined ? {} : { ipAddress: input.session.ipAddress }),
        ...(input.session.userAgent === undefined ? {} : { userAgent: input.session.userAgent })
      })
    );
    const securityEvent = await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: input.securityEventType,
        occurredAt: input.session.createdAt,
        userId: session.userId,
        sessionId: session.id,
        ipAddress: input.session.ipAddress,
        userAgent: input.session.userAgent
      })
    );

    return {
      user,
      authIdentity,
      roleAssignments,
      session,
      securityEvent
    };
  });
}
