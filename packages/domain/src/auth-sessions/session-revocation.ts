import { normalizeAuthSecurityEventInput, type AuthSecurityEvent } from "./auth-security-event";
import { isAuthSessionUsable } from "./auth-session";
import type { AuthenticatedSessionContext } from "./session-authentication";

export type AuthSessionRevocationStore = {
  readonly findByTokenHash: (
    tokenHash: string
  ) => Promise<AuthenticatedSessionContext | null>;
  readonly revokeSession: (input: {
    readonly sessionId: string;
    readonly revokedAt: string;
  }) => Promise<void>;
  readonly recordSecurityEvent: (
    input: Omit<AuthSecurityEvent, "id">
  ) => Promise<AuthSecurityEvent>;
};

export type AuthSessionRevocationUnitOfWork = {
  readonly transact: <T>(operation: (store: AuthSessionRevocationStore) => Promise<T>) => Promise<T>;
};

export type AuthSessionRevocationResult = {
  readonly revoked: boolean;
};

export async function revokeAuthenticatedSession(input: {
  readonly revocation: AuthSessionRevocationUnitOfWork;
  readonly tokenHash: string;
  readonly now: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}): Promise<AuthSessionRevocationResult> {
  const tokenHash = input.tokenHash.trim();

  if (!tokenHash) {
    return { revoked: false };
  }

  return input.revocation.transact(async (store) => {
    const context = await store.findByTokenHash(tokenHash);

    if (!context || !isAuthSessionUsable(context.session, input.now)) {
      return { revoked: false };
    }

    await store.revokeSession({
      sessionId: context.session.id,
      revokedAt: input.now.toISOString()
    });
    await store.recordSecurityEvent(
      normalizeAuthSecurityEventInput({
        eventType: "logout_succeeded",
        occurredAt: input.now,
        userId: context.user.id,
        sessionId: context.session.id,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent })
      })
    );

    return { revoked: true };
  });
}
