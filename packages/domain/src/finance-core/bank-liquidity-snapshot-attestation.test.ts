import { describe, expect, it } from "vitest";

import { hashFinanceCommandPayload } from "../finance-authorization";
import {
  BankLiquiditySnapshotAttestationIssuanceError,
  createBankLiquiditySnapshotAttestationAuthorizationPayload,
  issueVerifiedBankLiquiditySnapshotEvidence
} from "./bank-liquidity-snapshot-attestation";

const attestationId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const authorizationId = "33333333-3333-4333-8333-333333333333";
const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("bank liquidity snapshot attestation", () => {
  it("issues verified snapshot evidence only from the exact consumed bank-snapshot authorization", () => {
    const input = attestationInput();
    const payload = createBankLiquiditySnapshotAttestationAuthorizationPayload(input);
    const evidence = issueVerifiedBankLiquiditySnapshotEvidence({
      ...input,
      authorization: {
        authorizationId,
        actorUserId,
        sessionId: "44444444-4444-4444-8444-444444444444",
        actionKind: "bank_snapshot_attest",
        aggregateId: attestationId,
        expectedVersion: 7,
        payloadHash: hashFinanceCommandPayload(payload),
        verifiedAt: "2026-08-05T12:00:00.000Z",
        expiresAt: "2026-08-05T12:05:00.000Z",
        status: "consumed"
      },
      receipt: {
        kind: "bank_liquidity_snapshot_attestation_receipt",
        attestationId,
        version: 1,
        canonicalDigest: digest
      } as never
    });

    expect(evidence).toMatchObject({
      kind: "verified_bank_liquidity_snapshot_evidence",
      bankCashPoolId: input.bankCashPoolId,
      unrestrictedAvailableMinor: input.unrestrictedAvailableMinor,
      evidenceDigest: digest,
      attestation: { attestationId, version: 1, canonicalDigest: digest }
    });
  });

  it("rejects an authorization that does not bind the exact sealed evidence artifact", () => {
    const input = attestationInput();
    const payload = createBankLiquiditySnapshotAttestationAuthorizationPayload({
      ...input,
      evidenceArtifact: { ...input.evidenceArtifact, artifactId: "another-bank-evidence" }
    });

    expect(() =>
      issueVerifiedBankLiquiditySnapshotEvidence({
        ...input,
        authorization: {
          authorizationId,
          actorUserId,
          sessionId: "44444444-4444-4444-8444-444444444444",
          actionKind: "bank_snapshot_attest",
          aggregateId: attestationId,
          expectedVersion: 7,
          payloadHash: hashFinanceCommandPayload(payload),
          verifiedAt: "2026-08-05T12:00:00.000Z",
          expiresAt: "2026-08-05T12:05:00.000Z",
          status: "consumed"
        },
        receipt: {
          kind: "bank_liquidity_snapshot_attestation_receipt",
          attestationId,
          version: 1,
          canonicalDigest: digest
        } as never
      })
    ).toThrow(BankLiquiditySnapshotAttestationIssuanceError);
  });
});

function attestationInput() {
  return {
    attestationId,
    bankCashPoolId: "elevenhouse-rub-main",
    currency: "RUB" as const,
    expectedBankLiquidityRevision: "7",
    unrestrictedAvailableMinor: "125000",
    sourceCheckpoint: "statement:2026-08-05:page-3",
    asOf: "2026-08-05T11:58:00.000Z",
    expiresAt: "2026-08-05T12:30:00.000Z",
    evidenceArtifact: {
      artifactId: "payout-bank-evidence:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sha256Digest: digest,
      byteLength: 1024,
      bankCashPoolId: "elevenhouse-rub-main",
      statementSourceFingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  } as const;
}
