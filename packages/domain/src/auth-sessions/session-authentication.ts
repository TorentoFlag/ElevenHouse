import type { UserAccount } from "../accounts";
import type { UserRoleAssignment } from "../roles";
import { isAuthSessionUsable, type AuthSession } from "./auth-session";

export type AuthenticatedSessionContext = {
  readonly session: AuthSession;
  readonly user: UserAccount;
  readonly roleAssignments: readonly UserRoleAssignment[];
};

export type AuthSessionAuthenticationStore = {
  readonly findByTokenHash: (
    tokenHash: string
  ) => Promise<AuthenticatedSessionContext | null>;
};

export async function resolveAuthenticatedSession(input: {
  readonly store: AuthSessionAuthenticationStore;
  readonly tokenHash: string;
  readonly now: Date;
}): Promise<AuthenticatedSessionContext | null> {
  const tokenHash = input.tokenHash.trim();
  if (!tokenHash) {
    return null;
  }

  const context = await input.store.findByTokenHash(tokenHash);
  if (!context) {
    return null;
  }

  if (context.user.status !== "active") {
    return null;
  }

  if (!isAuthSessionUsable(context.session, input.now)) {
    return null;
  }

  return context;
}
