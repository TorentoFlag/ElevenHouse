import { describe, expect, it } from "vitest";
import {
  createAes256GcmSecretCipher,
  createSessionToken,
  hashSessionToken,
  isInternalPlatformRole,
  parseBase64Aes256GcmKey,
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

describe("AES-256-GCM secret cipher", () => {
  it("encrypts and decrypts a secret with authenticated context", () => {
    const key = parseBase64Aes256GcmKey(Buffer.alloc(32, 7).toString("base64"));
    const cipher = createAes256GcmSecretCipher(key);
    const encrypted = cipher.encrypt({
      plaintext: "123456",
      aad: "challenge|delivery"
    });

    expect(encrypted).toMatchObject({
      algorithm: "aes-256-gcm",
      iv: expect.any(String),
      ciphertext: expect.any(String),
      authTag: expect.any(String)
    });
    expect(encrypted.ciphertext).not.toContain("123456");
    expect(
      cipher.decrypt({
        encrypted,
        aad: "challenge|delivery"
      })
    ).toBe("123456");
  });

  it("uses a fresh IV for each encryption", () => {
    const cipher = createAes256GcmSecretCipher(
      parseBase64Aes256GcmKey(Buffer.alloc(32, 9).toString("base64"))
    );

    const first = cipher.encrypt({ plaintext: "123456", aad: "same-context" });
    const second = cipher.encrypt({ plaintext: "123456", aad: "same-context" });

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered authenticated context", () => {
    const cipher = createAes256GcmSecretCipher(
      parseBase64Aes256GcmKey(Buffer.alloc(32, 11).toString("base64"))
    );
    const encrypted = cipher.encrypt({ plaintext: "123456", aad: "expected-context" });

    expect(() =>
      cipher.decrypt({
        encrypted,
        aad: "different-context"
      })
    ).toThrow();
  });

  it("requires a 32-byte base64 key", () => {
    expect(() => parseBase64Aes256GcmKey(Buffer.alloc(16).toString("base64"))).toThrow(
      "AES-256-GCM key must be 32 bytes encoded as base64"
    );
  });
});
