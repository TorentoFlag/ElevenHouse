import { describe, expect, it } from "vitest";
import {
  authSecurityEventTypeValues,
  authSessionStatusValues,
  createAuthenticatedSession,
  isAuthSessionUsable,
  normalizeAuthSessionCreationInput,
  normalizeAuthSecurityEventInput,
  resolveAuthenticatedSession
} from "./index";

describe("auth-sessions module exports", () => {
  it("exports auth session values and use cases", () => {
    expect(authSessionStatusValues).toEqual(["active", "revoked"]);
    expect(authSecurityEventTypeValues).toEqual([
      "registration_succeeded",
      "login_succeeded",
      "login_failed",
      "logout_succeeded",
      "session_revoked"
    ]);
    expect(isAuthSessionUsable).toBeTypeOf("function");
    expect(normalizeAuthSessionCreationInput).toBeTypeOf("function");
    expect(normalizeAuthSecurityEventInput).toBeTypeOf("function");
    expect(createAuthenticatedSession).toBeTypeOf("function");
    expect(resolveAuthenticatedSession).toBeTypeOf("function");
  });
});
