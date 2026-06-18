import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  type CipherGCM,
  type DecipherGCM
} from "node:crypto";
export {
  customerPlatformRoles,
  internalPlatformRoles,
  isInternalPlatformRole,
  isPlatformRole,
  platformRoles,
  type CustomerPlatformRole,
  type InternalPlatformRole,
  type PlatformRole
} from "./roles";

export const publicSessionCookieName = "__Host-elevenhouse_public_session";

export function createSessionToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type Aes256GcmEncryptedSecret = {
  readonly algorithm: "aes-256-gcm";
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
};

export type Aes256GcmSecretCipher = {
  readonly encrypt: (input: {
    readonly plaintext: string;
    readonly aad: string;
  }) => Aes256GcmEncryptedSecret;
  readonly decrypt: (input: {
    readonly encrypted: Aes256GcmEncryptedSecret;
    readonly aad: string;
  }) => string;
};

const aes256GcmKeyByteLength = 32;
const aes256GcmIvByteLength = 12;

export function parseBase64Aes256GcmKey(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("AES-256-GCM key is required");
  }

  const key = Buffer.from(normalized, "base64");
  if (key.length !== aes256GcmKeyByteLength) {
    throw new Error("AES-256-GCM key must be 32 bytes encoded as base64");
  }

  return key;
}

export function createAes256GcmSecretCipher(key: Buffer): Aes256GcmSecretCipher {
  if (key.length !== aes256GcmKeyByteLength) {
    throw new Error("AES-256-GCM key must be 32 bytes");
  }

  return {
    encrypt: (input) => {
      const iv = randomBytes(aes256GcmIvByteLength);
      const cipher = createCipheriv("aes-256-gcm", key, iv) as CipherGCM;
      cipher.setAAD(Buffer.from(input.aad, "utf8"));
      const ciphertext = Buffer.concat([
        cipher.update(input.plaintext, "utf8"),
        cipher.final()
      ]);

      return {
        algorithm: "aes-256-gcm",
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64")
      };
    },
    decrypt: (input) => {
      if (input.encrypted.algorithm !== "aes-256-gcm") {
        throw new Error(`Unsupported encrypted secret algorithm: ${input.encrypted.algorithm}`);
      }

      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(input.encrypted.iv, "base64")
      ) as DecipherGCM;
      decipher.setAAD(Buffer.from(input.aad, "utf8"));
      decipher.setAuthTag(Buffer.from(input.encrypted.authTag, "base64"));

      return Buffer.concat([
        decipher.update(Buffer.from(input.encrypted.ciphertext, "base64")),
        decipher.final()
      ]).toString("utf8");
    }
  };
}
