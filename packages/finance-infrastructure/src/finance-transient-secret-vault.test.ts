import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";

import {
  FinanceTransientSecretVaultError,
  createFinanceTransientSecretVault
} from "./finance-transient-secret-vault";

const now = new Date("2026-08-04T12:00:00.000Z");
const providerSetupId = "10000000-0000-4000-8000-000000000001";
const cardTokenId = "20000000-0000-4000-8000-000000000002";

describe("finance transient secret vault", () => {
  it("writes the card token and browser fingerprint only to KMS-backed private storage", async () => {
    const writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>> = [];
    const storage = memoryStorage(writes);
    const vault = createFinanceTransientSecretVault(storage, () => now);

    const sealed = await vault.sealArcPayCardTokenizationSecret({
      secretId: "setup-execute:30000000-0000-4000-8000-000000000003",
      providerSetupId,
      cardTokenId,
      browserInfo: browserInfo(),
      providerExpiresAt: "2026-08-04T12:04:00.050Z"
    });

    expect(sealed).toMatchObject({
      kind: "sealed_one_time_provider_secret_ref",
      secretRef: expect.stringMatching(/^kms:\/\/s3\//),
      providerExpiresAt: "2026-08-04T12:04:00.05Z",
      providerConsumption: "one_time"
    });
    expect(sealed.secretRef).not.toContain(cardTokenId);
    expect(writes[0]?.artifactId).toBe("arc-card-tokenization-secret:setup-execute:30000000-0000-4000-8000-000000000003");
    expect(new TextDecoder().decode(writes[0]?.bytes)).toContain(cardTokenId);

    await expect(vault.consumeArcPayCardTokenizationSecret({
      secretRef: sealed.secretRef,
      expectedProviderSetupId: providerSetupId
    })).resolves.toMatchObject({ cardTokenId, browserInfo: browserInfo() });
  });

  it("seals a separate one-time 3DS Method context without copying the card token", async () => {
    const writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>> = [];
    const storage = memoryStorage(writes);
    const vault = createFinanceTransientSecretVault(storage, () => now);

    const sealed = await vault.sealArcPayThreeDsMethodContext({
      secretId: "setup-method:30000000-0000-4000-8000-000000000003",
      providerSetupId,
      browserInfo: browserInfo(),
      providerExpiresAt: "2026-08-04T12:05:00.000Z"
    });

    expect(sealed).toMatchObject({
      kind: "sealed_one_time_provider_secret_ref",
      secretRef: expect.stringMatching(/^kms:\/\/s3\//),
      providerConsumption: "one_time"
    });
    const persisted = new TextDecoder().decode(writes[0]?.bytes);
    expect(writes[0]?.artifactId).toBe("arc-three-ds-method-context:setup-method:30000000-0000-4000-8000-000000000003");
    expect(persisted).not.toContain(cardTokenId);
    expect(persisted).not.toContain("cardTokenId");

    await expect(vault.consumeArcPayThreeDsMethodContext({
      secretRef: sealed.secretRef,
      expectedProviderSetupId: providerSetupId
    })).resolves.toEqual({
      kind: "arc_pay_three_ds_method_context",
      providerSetupId,
      browserInfo: browserInfo()
    });
  });

  it("rejects a stale token and a secret replayed against another provider setup", async () => {
    const vault = createFinanceTransientSecretVault(memoryStorage([]), () => now);
    await expect(vault.sealArcPayCardTokenizationSecret({
      secretId: "setup-execute:30000000-0000-4000-8000-000000000003",
      providerSetupId,
      cardTokenId,
      browserInfo: browserInfo(),
      providerExpiresAt: "2026-08-04T12:05:01.000Z"
    })).rejects.toEqual(expect.objectContaining<Partial<FinanceTransientSecretVaultError>>({ reason: "invalid_input" }));
  });
});

function memoryStorage(writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>>): FinancePrivateObjectStoragePort {
  const objects = new Map<string, Uint8Array>();
  return {
    writeImmutable: vi.fn(async (input) => {
      writes.push({ artifactId: input.artifactId, bytes: input.bytes });
      objects.set(input.artifactId, input.bytes);
      return {
        privateObjectKey: `finance/artifacts/${input.artifactId}.json`,
        privateObjectVersion: "version-1",
        envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/30000000-0000-4000-8000-000000000003",
        sha256Digest: input.expectedSha256Digest,
        byteLength: input.bytes.byteLength,
        contentType: input.contentType
      };
    }),
    readImmutable: vi.fn(async (locator) => {
      const artifactId = locator.privateObjectKey.slice("finance/artifacts/".length, -".json".length);
      const bytes = objects.get(artifactId);
      if (!bytes) throw new Error("not found");
      return {
        bytes,
        sha256Digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
        byteLength: bytes.byteLength,
        contentType: "application/json"
      };
    }),
    deleteImmutable: vi.fn()
  };
}

function browserInfo() {
  return {
    acceptHeader: "application/json",
    language: "ru-RU",
    screenWidth: 1440,
    screenHeight: 900,
    colorDepth: 24 as const,
    timezoneOffsetMinutes: -180,
    userAgent: "Mozilla/5.0",
    javaEnabled: false,
    windowSize: "05" as const
  };
}
