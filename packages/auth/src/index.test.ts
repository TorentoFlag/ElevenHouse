import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashSessionToken,
  isInternalPlatformRole,
  platformRoles,
  publicSessionCookieName,
  isPlatformRole
} from "./index";

describe("isPlatformRole", () => {
  it("accepts known platform roles", () => {
    expect(isPlatformRole("astrologer")).toBe(true);
    expect(isPlatformRole("super_admin")).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(isPlatformRole("owner")).toBe(false);
  });

  it("keeps super admin in the canonical role list", () => {
    expect(platformRoles).toEqual(["client", "astrologer", "moderator", "admin", "super_admin"]);
  });
});

describe("isInternalPlatformRole", () => {
  it("accepts platform staff roles", () => {
    expect(isInternalPlatformRole("moderator")).toBe(true);
    expect(isInternalPlatformRole("admin")).toBe(true);
    expect(isInternalPlatformRole("super_admin")).toBe(true);
  });

  it("rejects customer-facing roles", () => {
    expect(isInternalPlatformRole("client")).toBe(false);
    expect(isInternalPlatformRole("astrologer")).toBe(false);
  });
});

describe("session token primitives", () => {
  it("creates high-entropy URL-safe session tokens", () => {
    const token = createSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("hashes session tokens without exposing raw token values", () => {
    expect(hashSessionToken("session-token")).toBe(
      "c101e911469c969171040b50d70543313cf968fdef5bacc780776f8fb399ab36"
    );
  });

  it("uses a host-prefixed public session cookie name", () => {
    expect(publicSessionCookieName).toBe("__Host-elevenhouse_public_session");
  });
});
