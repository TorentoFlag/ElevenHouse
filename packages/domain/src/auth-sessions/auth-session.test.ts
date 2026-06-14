import { describe, expect, it } from "vitest";
import {
  isAuthSessionUsable,
  normalizeAuthSessionCreationInput,
  type AuthSession
} from "./auth-session";

describe("normalizeAuthSessionCreationInput", () => {
  it("normalizes auth session creation timestamps and optional client context", () => {
    expect(
      normalizeAuthSessionCreationInput({
        userId: "user_1",
        tokenHash: " token_hash ",
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        expiresAt: new Date("2026-06-21T10:00:00.000Z"),
        userAgent: "  Mozilla/5.0  ",
        ipAddress: "  127.0.0.1  "
      })
    ).toEqual({
      userId: "user_1",
      tokenHash: "token_hash",
      createdAt: "2026-06-14T10:00:00.000Z",
      expiresAt: "2026-06-21T10:00:00.000Z",
      userAgent: "Mozilla/5.0",
      ipAddress: "127.0.0.1"
    });
  });

  it("rejects empty token hashes", () => {
    expect(() =>
      normalizeAuthSessionCreationInput({
        userId: "user_1",
        tokenHash: "   ",
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        expiresAt: new Date("2026-06-21T10:00:00.000Z")
      })
    ).toThrow("Auth session token hash is required");
  });

  it("rejects sessions that do not expire after creation", () => {
    expect(() =>
      normalizeAuthSessionCreationInput({
        userId: "user_1",
        tokenHash: "token_hash",
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        expiresAt: new Date("2026-06-14T10:00:00.000Z")
      })
    ).toThrow("Auth session expiry must be after creation");
  });
});

describe("isAuthSessionUsable", () => {
  const activeSession: AuthSession = {
    id: "session_1",
    userId: "user_1",
    tokenHash: "token_hash",
    status: "active",
    createdAt: "2026-06-14T10:00:00.000Z",
    expiresAt: "2026-06-21T10:00:00.000Z"
  };

  it("accepts active sessions before expiry", () => {
    expect(isAuthSessionUsable(activeSession, new Date("2026-06-15T10:00:00.000Z"))).toBe(true);
  });

  it("rejects revoked sessions", () => {
    expect(
      isAuthSessionUsable(
        {
          ...activeSession,
          status: "revoked",
          revokedAt: "2026-06-15T09:00:00.000Z"
        },
        new Date("2026-06-15T10:00:00.000Z")
      )
    ).toBe(false);
  });

  it("rejects expired sessions", () => {
    expect(isAuthSessionUsable(activeSession, new Date("2026-06-21T10:00:00.000Z"))).toBe(false);
  });
});
