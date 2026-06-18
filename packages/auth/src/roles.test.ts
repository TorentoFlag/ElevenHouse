import { describe, expect, it } from "vitest";
import { isInternalPlatformRole, isPlatformRole, platformRoles } from "./roles";

describe("platform roles", () => {
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

  it("accepts internal platform staff roles", () => {
    expect(isInternalPlatformRole("moderator")).toBe(true);
    expect(isInternalPlatformRole("admin")).toBe(true);
    expect(isInternalPlatformRole("super_admin")).toBe(true);
  });

  it("rejects customer-facing roles as internal roles", () => {
    expect(isInternalPlatformRole("client")).toBe(false);
    expect(isInternalPlatformRole("astrologer")).toBe(false);
  });
});
