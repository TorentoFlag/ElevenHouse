import { describe, expect, it } from "vitest";
import { identityProviderValues, normalizeAuthIdentityInput } from "./index";

describe("auth-identities module exports", () => {
  it("normalizes email identities without password hashes", () => {
    expect(identityProviderValues).toContain("email");
    expect(
      normalizeAuthIdentityInput({
        provider: "email",
        providerSubject: " ada@example.com ",
        email: " ada@example.com ",
        emailVerifiedAt: new Date("2026-06-15T10:00:00.000Z")
      })
    ).toEqual({
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      emailVerifiedAt: "2026-06-15T10:00:00.000Z"
    });
  });

  it("normalizes phone identities without password hashes", () => {
    expect(
      normalizeAuthIdentityInput({
        provider: "phone",
        providerSubject: " +79990001122 ",
        phoneNumber: " +79990001122 ",
        phoneVerifiedAt: new Date("2026-06-15T10:00:00.000Z")
      })
    ).toEqual({
      provider: "phone",
      providerSubject: "+79990001122",
      phoneNumber: "+79990001122",
      phoneVerifiedAt: "2026-06-15T10:00:00.000Z"
    });
  });
});
