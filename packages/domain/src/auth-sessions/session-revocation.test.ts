import { describe, expect, it, vi } from "vitest";
import {
  revokeAuthenticatedSession,
  type AuthSessionRevocationStore,
  type AuthSessionRevocationUnitOfWork
} from "./session-revocation";

const now = new Date("2026-06-15T10:00:00.000Z");
const activeContext = {
  session: {
    id: "session_1",
    userId: "user_1",
    tokenHash: "token_hash",
    status: "active",
    createdAt: "2026-06-14T10:00:00.000Z",
    expiresAt: "2026-06-21T10:00:00.000Z"
  },
  user: {
    id: "user_1",
    status: "active",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z"
  },
  roleAssignments: []
} satisfies Awaited<ReturnType<AuthSessionRevocationStore["findByTokenHash"]>>;

function createUnitOfWork(
  context: Awaited<ReturnType<AuthSessionRevocationStore["findByTokenHash"]>>
) {
  const store: AuthSessionRevocationStore = {
    findByTokenHash: vi.fn(async () => context),
    revokeSession: vi.fn(async () => undefined),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "event_1",
      ...input
    }))
  };
  const unitOfWork: AuthSessionRevocationUnitOfWork = {
    transact: vi.fn(async (operation) => operation(store))
  };

  return { store, unitOfWork };
}

describe("revokeAuthenticatedSession", () => {
  it("revokes an active session and records a logout security event", async () => {
    const { store, unitOfWork } = createUnitOfWork(activeContext);

    await expect(
      revokeAuthenticatedSession({
        revocation: unitOfWork,
        tokenHash: " token_hash ",
        now,
        ipAddress: " 203.0.113.10 ",
        userAgent: " Mozilla/5.0 "
      })
    ).resolves.toEqual({ revoked: true });

    expect(unitOfWork.transact).toHaveBeenCalledOnce();
    expect(store.findByTokenHash).toHaveBeenCalledWith("token_hash");
    expect(store.revokeSession).toHaveBeenCalledWith({
      sessionId: "session_1",
      revokedAt: "2026-06-15T10:00:00.000Z"
    });
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      eventType: "logout_succeeded",
      occurredAt: "2026-06-15T10:00:00.000Z",
      userId: "user_1",
      sessionId: "session_1",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0"
    });
  });

  it("does not revoke missing sessions", async () => {
    const { store, unitOfWork } = createUnitOfWork(null);

    await expect(
      revokeAuthenticatedSession({
        revocation: unitOfWork,
        tokenHash: "missing_hash",
        now
      })
    ).resolves.toEqual({ revoked: false });

    expect(store.revokeSession).not.toHaveBeenCalled();
    expect(store.recordSecurityEvent).not.toHaveBeenCalled();
  });

  it("does not revoke expired sessions", async () => {
    const { store, unitOfWork } = createUnitOfWork({
      ...activeContext,
      session: {
        ...activeContext.session,
        expiresAt: "2026-06-15T10:00:00.000Z"
      }
    });

    await expect(
      revokeAuthenticatedSession({
        revocation: unitOfWork,
        tokenHash: "token_hash",
        now
      })
    ).resolves.toEqual({ revoked: false });

    expect(store.revokeSession).not.toHaveBeenCalled();
    expect(store.recordSecurityEvent).not.toHaveBeenCalled();
  });
});
