import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { createSettlementBalanceEvidenceSealer } from "./settlement-balance-evidence-sealer";

const providerAccount = Object.freeze({
  seriesId: "arc-pay-company-merchant",
  providerAccountId: "merchant-1",
  identityVersion: 1
});

describe("createSettlementBalanceEvidenceSealer", () => {
  it("seals the exact balance response before exposing its parsed values", async () => {
    const rawBody = new TextEncoder().encode('{"balances":[]}');
    const rawDigest = digest(rawBody);
    const writeImmutable = vi.fn(async () => ({
      privateObjectKey: "finance/arc-pay/settlement-balance",
      privateObjectVersion: "1",
      envelopeKeyVersion: "local-v1",
      sha256Digest: rawDigest,
      byteLength: rawBody.byteLength,
      contentType: "application/json"
    }));
    const registerSealedArtifact = vi.fn(async () => ({
      artifactId: `arc-settlement-balance:${providerAccount.providerAccountId}:${rawDigest.slice(7)}`,
      sha256Digest: rawDigest,
      byteLength: rawBody.byteLength
    }));
    const sealer = createSettlementBalanceEvidenceSealer({
      privateObjectStorage: { writeImmutable } as Pick<
        FinancePrivateObjectStoragePort,
        "writeImmutable"
      >,
      artifactRegistry: { registerSealedArtifact } as Pick<
        FinanceArtifactRegistry,
        "registerSealedArtifact"
      >,
      retention: { policyId: "provider-canonical-read", policyVersion: "1" }
    });

    await expect(
      sealer.seal({ providerAccount, rawBody, rawDigest, rawByteLength: rawBody.byteLength })
    ).resolves.toEqual({
      artifactId: `arc-settlement-balance:${providerAccount.providerAccountId}:${rawDigest.slice(7)}`,
      sha256Digest: rawDigest,
      byteLength: rawBody.byteLength
    });
    expect(writeImmutable).toHaveBeenCalledWith({
      artifactId: `arc-settlement-balance:${providerAccount.providerAccountId}:${rawDigest.slice(7)}`,
      contentType: "application/json",
      bytes: rawBody,
      expectedSha256Digest: rawDigest
    });
    expect(registerSealedArtifact).toHaveBeenCalledWith({
      artifact: {
        artifactId: `arc-settlement-balance:${providerAccount.providerAccountId}:${rawDigest.slice(7)}`,
        sha256Digest: rawDigest,
        byteLength: rawBody.byteLength
      },
      artifactClass: "provider_canonical_read",
      binding: { kind: "provider", providerAccount },
      contentType: "application/json",
      privateObject: expect.any(Object),
      retentionPolicyId: "provider-canonical-read",
      retentionPolicyVersion: "1"
    });
  });
});

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
