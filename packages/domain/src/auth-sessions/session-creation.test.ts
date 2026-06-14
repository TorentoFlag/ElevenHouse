import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedSession,
  type AuthSessionCreationStore,
  type AuthSessionCreationUnitOfWork
} from "./session-creation";

function createUnitOfWork() {
  const store: AuthSessionCreationStore = {
    createSession: vi.fn(async (input) => ({
      id: "session_1",
      status: "active",
      ...input
    })),
    recordSecurityEvent: vi.fn(async (input) => ({
      id: "event_1",
      ...input
    }))
  };
  const unitOfWork: AuthSessionCreationUnitOfWork = {
    transact: vi.fn(async (operation) => operation(store))
  };

  return { store, unitOfWork };
}

describe("createAuthenticatedSession", () => {
  it("creates an active session and records a registration security event in one unit of work", async () => {
    const { store, unitOfWork } = createUnitOfWork();

    await expect(
      createAuthenticatedSession({
        sessionCreation: unitOfWork,
        userId: "user_1",
        tokenHash: " token_hash ",
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        expiresAt: new Date("2026-06-21T10:00:00.000Z"),
        securityEventType: "registration_succeeded",
        ipAddress: "  127.0.0.1  ",
        userAgent: "  Mozilla/5.0  "
      })
    ).resolves.toEqual({
      session: {
        id: "session_1",
        userId: "user_1",
        tokenHash: "token_hash",
        status: "active",
        createdAt: "2026-06-14T10:00:00.000Z",
        expiresAt: "2026-06-21T10:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0"
      },
      securityEvent: {
        id: "event_1",
        userId: "user_1",
        sessionId: "session_1",
        eventType: "registration_succeeded",
        occurredAt: "2026-06-14T10:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0"
      }
    });

    expect(unitOfWork.transact).toHaveBeenCalledOnce();
    expect(store.createSession).toHaveBeenCalledWith({
      userId: "user_1",
      tokenHash: "token_hash",
      createdAt: "2026-06-14T10:00:00.000Z",
      expiresAt: "2026-06-21T10:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0"
    });
    expect(store.recordSecurityEvent).toHaveBeenCalledWith({
      userId: "user_1",
      sessionId: "session_1",
      eventType: "registration_succeeded",
      occurredAt: "2026-06-14T10:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0"
    });
  });
});
