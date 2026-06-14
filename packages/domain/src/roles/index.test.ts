import { describe, expect, it } from "vitest";
import { isCustomerPlatformRole, normalizeCustomerRoles } from "./index";

describe("roles module exports", () => {
  it("exposes customer role primitives from its barrel", () => {
    expect(isCustomerPlatformRole("client")).toBe(true);
    expect(isCustomerPlatformRole("admin")).toBe(false);
    expect(normalizeCustomerRoles(["client", "client", "astrologer"])).toEqual([
      "client",
      "astrologer"
    ]);
  });
});
