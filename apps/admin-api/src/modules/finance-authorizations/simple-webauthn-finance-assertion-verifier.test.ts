import { describe, expect, it, vi } from "vitest";

import { SimpleWebAuthnFinanceAssertionVerifier } from "./simple-webauthn-finance-assertion-verifier";

const assertion = {
  id: "credential-one",
  rawId: "credential-one",
  type: "public-key" as const,
  response: {
    clientDataJSON: "a",
    authenticatorData: "b",
    signature: "c",
    userHandle: null
  },
  clientExtensionResults: {}
};

describe("SimpleWebAuthnFinanceAssertionVerifier", () => {
  it("uses only the stored active credential and requires UV, RP, origin and exact challenge", async () => {
    const findActiveByCredentialId = vi.fn(async () => ({
      credentialId: "credential-one",
      ownerUserId: "owner-one",
      publicKey: Buffer.from([1]),
      transports: ["internal"],
      signatureCounter: 7
    }));
    const verify = vi.fn(async () => ({
      verified: true,
      authenticationInfo: {
        credentialID: "credential-one",
        newCounter: 8,
        userVerified: true,
        credentialDeviceType: "singleDevice" as const,
        credentialBackedUp: false,
        origin: "https://admin.elevenhouse.test",
        rpID: "admin.elevenhouse.test"
      }
    }));
    const verifier = new SimpleWebAuthnFinanceAssertionVerifier(
      { findActiveByCredentialId },
      verify
    );

    await expect(
      verifier.verifyAssertion({
        assertion,
        expectedChallenge: "challenge",
        allowedOrigin: "https://admin.elevenhouse.test",
        rpId: "admin.elevenhouse.test",
        requireUserVerification: true
      })
    ).resolves.toEqual({
      verified: true,
      credentialId: "credential-one",
      userVerified: true,
      signatureCounter: 8
    });
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "challenge",
        expectedOrigin: "https://admin.elevenhouse.test",
        expectedRPID: "admin.elevenhouse.test",
        expectedType: "webauthn.get",
        requireUserVerification: true,
        advancedFIDOConfig: { userVerification: "required" }
      })
    );
  });

  it("does not send malformed or swapped credentials to the verifier", async () => {
    const findActiveByCredentialId = vi.fn();
    const verify = vi.fn();
    const verifier = new SimpleWebAuthnFinanceAssertionVerifier(
      { findActiveByCredentialId },
      verify
    );

    await expect(
      verifier.verifyAssertion({
        assertion: { ...assertion, rawId: "other-credential" },
        expectedChallenge: "challenge",
        allowedOrigin: "https://admin.elevenhouse.test",
        rpId: "admin.elevenhouse.test",
        requireUserVerification: true
      })
    ).resolves.toEqual({ verified: false });
    expect(findActiveByCredentialId).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
});
