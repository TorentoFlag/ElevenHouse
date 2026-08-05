import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";
import {
  FinancePayoutDestinationVaultError,
  createFinancePayoutDestinationVault
} from "./finance-payout-destination-vault";

const methodId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";

describe("finance payout destination vault", () => {
  it("seals an immutable card destination without placing its plaintext in the returned snapshot", async () => {
    const writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>> = [];
    const vault = createFinancePayoutDestinationVault(memoryStorage(writes));

    const snapshot = await vault.sealPayoutDestination({
      payoutMethodId: methodId,
      payoutMethodVersion: 1,
      astrologerUserId,
      destinationKind: "bank_card",
      recipientName: "Анна Астрологова",
      bankName: "Банк",
      destinationValue: "2200123412341234"
    });

    expect(snapshot).toMatchObject({
      kind: "sealed_payout_destination_snapshot",
      payoutMethodId: methodId,
      payoutMethodVersion: 1,
      destinationKind: "bank_card",
      redactedDisplay: "Карта •••• 1234",
      sealedDestinationRef: expect.stringMatching(/^kms:\/\/s3\//),
      beneficiaryFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(snapshot)).not.toContain("2200123412341234");
    expect(JSON.stringify(snapshot)).not.toContain("Анна Астрологова");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.artifactId).toBe(`payout-destination:${methodId}:v1`);
    expect(new TextDecoder().decode(writes[0]?.bytes)).toContain("2200123412341234");
  });

  it("binds resolution to the exact astrologer and immutable snapshot", async () => {
    const vault = createFinancePayoutDestinationVault(memoryStorage([]));
    const snapshot = await vault.sealPayoutDestination({
      payoutMethodId: methodId,
      payoutMethodVersion: 1,
      astrologerUserId,
      destinationKind: "bank_account",
      recipientName: "Анна Астрологова",
      bankName: "Банк",
      destinationValue: "40817810000000000001"
    });

    await expect(
      vault.resolvePayoutDestination({ snapshot, expectedAstrologerUserId: "33333333-3333-4333-8333-333333333333" })
    ).rejects.toMatchObject({ reason: "destination_identity_conflict" });
    await expect(
      vault.resolvePayoutDestination({ snapshot, expectedAstrologerUserId: astrologerUserId })
    ).resolves.toEqual({
      destinationKind: "bank_account",
      recipientName: "Анна Астрологова",
      bankName: "Банк",
      destinationValue: "40817810000000000001"
    });
  });

  it("fails closed for malformed storage data and unnormalised destination input", async () => {
    const vault = createFinancePayoutDestinationVault({
      ...memoryStorage([]),
      readImmutable: async () => ({
        bytes: new TextEncoder().encode('{"bad":true}'),
        sha256Digest: digest(new TextEncoder().encode('{"bad":true}')),
        byteLength: 12,
        contentType: "application/json"
      })
    });
    await expect(
      vault.sealPayoutDestination({
        payoutMethodId: methodId,
        payoutMethodVersion: 1,
        astrologerUserId,
        destinationKind: "bank_card",
        recipientName: " Анна ",
        bankName: "Банк",
        destinationValue: "2200123412341234"
      })
    ).rejects.toBeInstanceOf(FinancePayoutDestinationVaultError);

    const validVault = createFinancePayoutDestinationVault(memoryStorage([]));
    const snapshot = await validVault.sealPayoutDestination({
      payoutMethodId: methodId,
      payoutMethodVersion: 1,
      astrologerUserId,
      destinationKind: "bank_card",
      recipientName: "Анна",
      bankName: "Банк",
      destinationValue: "2200123412341234"
    });
    await expect(
      vault.resolvePayoutDestination({ snapshot, expectedAstrologerUserId: astrologerUserId })
    ).rejects.toMatchObject({ reason: "storage_integrity" });
  });
});

function memoryStorage(
  writes: Array<Readonly<{ artifactId: string; bytes: Uint8Array }>>
): FinancePrivateObjectStoragePort {
  const values = new Map<string, Uint8Array>();
  return {
    writeImmutable: async (input) => {
      writes.push({ artifactId: input.artifactId, bytes: input.bytes });
      values.set(input.artifactId, input.bytes);
      return {
        privateObjectKey: `finance/artifacts/${input.artifactId}.json`,
        privateObjectVersion: "version-1",
        envelopeKeyVersion: "kms-key-1",
        sha256Digest: input.expectedSha256Digest,
        byteLength: input.bytes.byteLength,
        contentType: input.contentType
      };
    },
    readImmutable: async (input) => {
      const artifactId = input.privateObjectKey.slice("finance/artifacts/".length, -".json".length);
      const bytes = values.get(artifactId);
      if (!bytes) throw new Error("missing");
      return {
        bytes,
        sha256Digest: digest(bytes),
        byteLength: bytes.byteLength,
        contentType: "application/json"
      };
    },
    deleteImmutable: async () => undefined
  };
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
