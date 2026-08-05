import { createHash } from "node:crypto";

import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import {
  FinanceRestrictedProviderCredentialVaultError,
  createFinanceRestrictedProviderCredentialVault
} from "./finance-restricted-provider-credential-vault";

const credentialId = "saved-card-credential:30000000-0000-4000-8000-000000000003";
const providerCustomerId = "astrologer:10000000-0000-4000-8000-000000000001";
const cardTokenId = "20000000-0000-4000-8000-000000000002";

describe("restricted provider credential vault", () => {
  it("stores the raw saved-card token only in private storage and gives persistence an opaque handle plus fingerprint", async () => {
    const writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>> = [];
    const vault = createFinanceRestrictedProviderCredentialVault(memoryStorage(writes));

    const sealed = await vault.sealArcPaySavedCardCredential({
      credentialId,
      providerCustomerId,
      cardTokenId
    });

    expect(sealed).toEqual({
      kind: "sealed_restricted_provider_credential",
      restrictedTokenHandleRef: expect.stringMatching(/^kms:\/\/s3\//),
      providerCredentialFingerprint: `sha256:${createHash("sha256").update(cardTokenId).digest("hex")}`
    });
    expect(sealed.restrictedTokenHandleRef).not.toContain(cardTokenId);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.artifactId).toBe(`arc-saved-card-credential:${credentialId}`);
    expect(new TextDecoder().decode(writes[0]?.bytes)).toContain(cardTokenId);

    await expect(vault.resolveArcPaySavedCardCredential({
      restrictedTokenHandleRef: sealed.restrictedTokenHandleRef,
      expectedCredentialId: credentialId,
      expectedProviderCustomerId: providerCustomerId
    })).resolves.toEqual({
      kind: "arc_pay_restricted_saved_card_credential",
      credentialId,
      providerCustomerId,
      cardTokenId
    });
  });

  it("fails closed when a handle is replayed under another customer or storage bytes are tampered", async () => {
    const storage = memoryStorage([]);
    const vault = createFinanceRestrictedProviderCredentialVault(storage);
    const sealed = await vault.sealArcPaySavedCardCredential({ credentialId, providerCustomerId, cardTokenId });

    await expect(vault.resolveArcPaySavedCardCredential({
      restrictedTokenHandleRef: sealed.restrictedTokenHandleRef,
      expectedCredentialId: credentialId,
      expectedProviderCustomerId: "astrologer:99999999-9999-4999-8999-999999999999"
    })).rejects.toEqual(expect.objectContaining<Partial<FinanceRestrictedProviderCredentialVaultError>>({
      reason: "credential_identity_conflict"
    }));

    storage.tamper();
    await expect(vault.resolveArcPaySavedCardCredential({
      restrictedTokenHandleRef: sealed.restrictedTokenHandleRef,
      expectedCredentialId: credentialId,
      expectedProviderCustomerId: providerCustomerId
    })).rejects.toEqual(expect.objectContaining<Partial<FinanceRestrictedProviderCredentialVaultError>>({
      reason: "storage_integrity"
    }));
  });
});

function memoryStorage(writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>>): FinancePrivateObjectStoragePort & { tamper(): void } {
  const objects = new Map<string, Uint8Array>();
  return {
    writeImmutable: vi.fn(async (input) => {
      writes.push({ artifactId: input.artifactId, bytes: input.bytes });
      objects.set(input.artifactId, input.bytes);
      return {
        privateObjectKey: `finance/artifacts/${input.artifactId}.json`,
        privateObjectVersion: "version-1",
        envelopeKeyVersion: "kms-key-v1",
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
    deleteImmutable: vi.fn(),
    tamper() {
      const [artifactId, bytes] = [...objects.entries()][0] ?? [];
      if (!artifactId || !bytes) throw new Error("missing fixture object");
      objects.set(artifactId, new TextEncoder().encode(`${new TextDecoder().decode(bytes)}!`));
    }
  };
}
