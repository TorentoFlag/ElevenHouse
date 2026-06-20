import {
  normalizeAuthSecurityEventInput,
  type AuthSecurityEvent,
  type AuthSecurityEventType
} from "./auth-security-event";
import {
  normalizeAuthSessionCreationInput,
  type AuthSession,
  type AuthSessionCreationInput,
  type NormalizedAuthSessionCreationInput
} from "./auth-session";

export type AuthSessionCreationStore = {
  readonly createSession: (input: NormalizedAuthSessionCreationInput) => Promise<AuthSession>;
  readonly recordSecurityEvent: (
    input: Omit<AuthSecurityEvent, "id">
  ) => Promise<AuthSecurityEvent>;
};

export type AuthSessionCreationUnitOfWork = {
  readonly transact: <T>(operation: (store: AuthSessionCreationStore) => Promise<T>) => Promise<T>;
};

export type AuthenticatedSessionCreationResult = {
  readonly session: AuthSession;
  readonly securityEvent: AuthSecurityEvent;
};

export async function createAuthenticatedSession(
  input: AuthSessionCreationInput & {
    readonly sessionCreation: AuthSessionCreationUnitOfWork;
    readonly securityEventType: AuthSecurityEventType;
  }
): Promise<AuthenticatedSessionCreationResult> {
  const sessionInput = normalizeAuthSessionCreationInput(input);

  return input.sessionCreation.transact(async (store) => {
    const session = await store.createSession(sessionInput);
    const securityEvent = await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: input.securityEventType,
        occurredAt: input.createdAt,
        userId: session.userId,
        sessionId: session.id,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent })
      })
    );

    return {
      session,
      securityEvent
    };
  });
}
