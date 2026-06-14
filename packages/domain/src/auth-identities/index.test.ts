import { describe, expect, it } from "vitest";
import { identityProviderValues, normalizeAuthIdentityInput } from "./index";

describe("auth-identities module exports", () => {
  it("exposes identity provider primitives from its barrel", () => {
    expect(identityProviderValues).toContain("email");
    expect(
      normalizeAuthIdentityInput({
        provider: "email",
        providerSubject: " ada@example.com ",
        email: " ada@example.com ",
        passwordHash: "argon2$hash"
      })
    ).toEqual({
      provider: "email",
      providerSubject: "ada@example.com",
      email: "ada@example.com",
      passwordHash: "argon2$hash"
    });
  });
});
