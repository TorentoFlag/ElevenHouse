import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  hasAsciiControlCharacter,
  FinancePrivateObjectStoragePort,
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef
} from "@elevenhouse/domain/finance-core";

const maximumResponseBytes = 2 * 1024 * 1024;

export type SettlementBalanceEvidenceSealer = Readonly<{
  seal(input: Readonly<{
    providerAccount: FinanceProviderAccountIdentity;
    rawBody: Uint8Array;
    rawDigest: `sha256:${string}`;
    rawByteLength: number;
  }>): Promise<RawProviderArtifactRef>;
}>;

export class SettlementBalanceEvidenceSealingError extends Error {
  readonly code = "SETTLEMENT_BALANCE_EVIDENCE_SEALING_ERROR" as const;

  constructor(readonly reason: "invalid_response" | "storage" | "registration") {
    super("ArcPay settlement balance evidence could not be sealed");
    this.name = "SettlementBalanceEvidenceSealingError";
  }
}

/**
 * Persists the exact provider response before a balance value is used for an
 * operational observation. The immutable artifact is provider-bound; this
 * sealer deliberately has no journal or wallet side effect.
 */
export function createSettlementBalanceEvidenceSealer(input: Readonly<{
  privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "writeImmutable">;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  retention: Readonly<{ policyId: string; policyVersion: string }>;
}>): SettlementBalanceEvidenceSealer {
  const retention = readRetention(input.retention);
  return Object.freeze({
    async seal(evidence) {
      validateRawEvidence(evidence);
      const artifactId = `arc-settlement-balance:${evidence.providerAccount.providerAccountId}:${evidence.rawDigest.slice(7)}`;
      let privateObject: Awaited<ReturnType<FinancePrivateObjectStoragePort["writeImmutable"]>>;
      try {
        privateObject = await input.privateObjectStorage.writeImmutable({
          artifactId,
          contentType: "application/json",
          bytes: evidence.rawBody,
          expectedSha256Digest: evidence.rawDigest
        });
      } catch {
        fail("storage");
      }
      if (
        privateObject.sha256Digest !== evidence.rawDigest ||
        privateObject.byteLength !== evidence.rawByteLength ||
        privateObject.contentType !== "application/json"
      ) {
        fail("storage");
      }

      let artifact: Awaited<ReturnType<FinanceArtifactRegistry["registerSealedArtifact"]>>;
      try {
        artifact = await input.artifactRegistry.registerSealedArtifact({
          artifact: {
            artifactId,
            sha256Digest: evidence.rawDigest,
            byteLength: evidence.rawByteLength
          },
          artifactClass: "provider_canonical_read",
          binding: { kind: "provider", providerAccount: evidence.providerAccount },
          contentType: "application/json",
          privateObject,
          retentionPolicyId: retention.policyId,
          retentionPolicyVersion: retention.policyVersion
        });
      } catch {
        fail("registration");
      }
      if (
        "bankCashPoolId" in artifact ||
        artifact.artifactId !== artifactId ||
        artifact.sha256Digest !== evidence.rawDigest ||
        artifact.byteLength !== evidence.rawByteLength
      ) {
        fail("registration");
      }
      return Object.freeze({
        artifactId: artifact.artifactId,
        sha256Digest: artifact.sha256Digest,
        byteLength: artifact.byteLength
      });
    }
  });
}

function validateRawEvidence(evidence: Readonly<{
  rawBody: Uint8Array;
  rawDigest: `sha256:${string}`;
  rawByteLength: number;
}>): void {
  if (
    !Number.isSafeInteger(evidence.rawByteLength) ||
    evidence.rawByteLength <= 0 ||
    evidence.rawByteLength > maximumResponseBytes ||
    evidence.rawBody.byteLength !== evidence.rawByteLength ||
    digest(evidence.rawBody) !== evidence.rawDigest
  ) {
    fail("invalid_response");
  }
}

function readRetention(value: Readonly<{ policyId: string; policyVersion: string }>) {
  if (!identifier(value.policyId) || !positiveRevision(value.policyVersion)) fail("registration");
  return Object.freeze({ policyId: value.policyId, policyVersion: value.policyVersion });
}

function identifier(value: string): boolean {
  return value.length > 0 && value.length <= 160 && value.trim() === value && !hasAsciiControlCharacter(value);
}

function positiveRevision(value: string): boolean {
  return /^(?:[1-9][0-9]*)$/.test(value);
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fail(reason: SettlementBalanceEvidenceSealingError["reason"]): never {
  throw new SettlementBalanceEvidenceSealingError(reason);
}
