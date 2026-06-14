import { describe, expect, it } from "vitest";
import {
  authSessionStatusValues,
  isAuthSessionUsable,
  normalizeAuthSessionCreationInput,
  resolveAuthenticatedSession
} from "./index";

describe("auth-sessions module exports", () => {
  it("exports auth session values and use cases", () => {
    expect(authSessionStatusValues).toEqual(["active", "revoked"]);
    expect(isAuthSessionUsable).toBeTypeOf("function");
    expect(normalizeAuthSessionCreationInput).toBeTypeOf("function");
    expect(resolveAuthenticatedSession).toBeTypeOf("function");
  });
});
