import { describe, expect, it, vi } from "vitest";
import {
  resolveAuthenticatedSession,
  type AuthSessionAuthenticationStore
} from "./session-authentication";

function createStore(
  record: Awaited<ReturnType<AuthSessionAuthenticationStore["findByTokenHash"]>>
): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async () => record)
  };
}

const activeRecord = {
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
  roleAssignments: [
    {
      id: "role_1",
      userId: "user_1",
      role: "client",
      assignedAt: "2026-06-14T10:00:00.000Z"
    }
  ]
} satisfies Awaited<ReturnType<AuthSessionAuthenticationStore["findByTokenHash"]>>;

describe("resolveAuthenticatedSession", () => {
  it("returns active account context for an active unexpired session", async () => {
    const store = createStore(activeRecord);

    await expect(
      resolveAuthenticatedSession({
        store,
        tokenHash: " token_hash ",
        now: new Date("2026-06-15T10:00:00.000Z")
      })
    ).resolves.toEqual(activeRecord);

    expect(store.findByTokenHash).toHaveBeenCalledWith("token_hash");
  });

  it("returns null when no session exists for the token hash", async () => {
    await expect(
      resolveAuthenticatedSession({
        store: createStore(null),
        tokenHash: "token_hash",
        now: new Date("2026-06-15T10:00:00.000Z")
      })
    ).resolves.toBeNull();
  });

  it("returns null for suspended accounts", async () => {
    await expect(
      resolveAuthenticatedSession({
        store: createStore({
          ...activeRecord,
          user: {
            ...activeRecord.user,
            status: "suspended"
          }
        }),
        tokenHash: "token_hash",
        now: new Date("2026-06-15T10:00:00.000Z")
      })
    ).resolves.toBeNull();
  });

  it("returns null for expired sessions", async () => {
    await expect(
      resolveAuthenticatedSession({
        store: createStore(activeRecord),
        tokenHash: "token_hash",
        now: new Date("2026-06-21T10:00:00.000Z")
      })
    ).resolves.toBeNull();
  });
});
