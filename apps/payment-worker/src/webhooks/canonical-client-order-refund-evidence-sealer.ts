import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  FinanceDigest,
  FinancePrivateObjectStoragePort,
  VerifiedWebhookSemanticEvidence
} from "@elevenhouse/domain/finance-core";
import { hasAsciiControlCharacter } from "@elevenhouse/domain/finance-core";

import type { CanonicalRefundEvidenceSealer } from "./canonical-client-order-refund.processor";

export class CanonicalClientOrderRefundEvidenceSealerError extends Error {
  readonly code = "canonical_client_order_refund_evidence_sealer_error" as const;

  constructor(readonly reason: "invalid_input" | "storage" | "storage_integrity" | "registration") {
    super("Canonical client-order refund evidence could not be sealed safely");
    this.name = "CanonicalClientOrderRefundEvidenceSealerError";
  }
}

/**
 * The canonical payment resource is sealed independently of the delivery webhook. Its semantic
 * fact is intentionally scoped to one immutable ArcPay refund operation and its cumulative
 * amount, so replaying the same webhook can never mint another payable reversal.
 */
export function createCanonicalClientOrderRefundEvidenceSealer(
  input: Readonly<{
    privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "writeImmutable">;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    retention: Readonly<{ policyId: string; policyVersion: string }>;
  }>
): CanonicalRefundEvidenceSealer {
  const retention = normalizeRetention(input.retention);
  return Object.freeze({
    async sealCanonicalRefund(request) {
      assertInput(request);
      const responseDigest = digest(request.rawCanonicalResponseBytes);
      const artifactId = canonicalArtifactId(request.providerRefundId, responseDigest);
      let privateObject;
      try {
        privateObject = await input.privateObjectStorage.writeImmutable({
          artifactId,
          contentType: "application/json",
          bytes: request.rawCanonicalResponseBytes,
          expectedSha256Digest: responseDigest
        });
      } catch {
        fail("storage");
      }
      if (
        privateObject.sha256Digest !== responseDigest ||
        privateObject.byteLength !== request.rawCanonicalResponseBytes.byteLength ||
        privateObject.contentType !== "application/json"
      ) {
        fail("storage_integrity");
      }
      let artifact;
      try {
        artifact = await input.artifactRegistry.registerSealedArtifact({
          artifact: {
            artifactId,
            sha256Digest: responseDigest,
            byteLength: request.rawCanonicalResponseBytes.byteLength
          },
          artifactClass: "provider_canonical_read",
          binding: { kind: "provider", providerAccount: request.claim.providerAccount },
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
        artifact.sha256Digest !== responseDigest ||
        artifact.byteLength !== request.rawCanonicalResponseBytes.byteLength
      ) {
        fail("registration");
      }
      return Object.freeze({
        kind: "verified_webhook_semantic_evidence",
        providerAccount: request.claim.providerAccount,
        webhookId: request.claim.webhookId,
        semanticSourceKind: "refund",
        semanticSourceId: request.providerRefundId,
        economicPaymentIntentId: request.economicPaymentIntentId,
        economicPaymentSessionId: null,
        providerPaymentId: null,
        amountMinor: null,
        currency: null,
        purpose: "client_order",
        canonicalFactDigest: refundFactDigest(request),
        artifact,
        observedAt: request.observedAt
      }) as VerifiedWebhookSemanticEvidence;
    }
  } satisfies CanonicalRefundEvidenceSealer);
}

function assertInput(
  request: Parameters<CanonicalRefundEvidenceSealer["sealCanonicalRefund"]>[0]
): void {
  if (
    !identifier(request.economicPaymentIntentId) ||
    !uuid(request.providerPaymentId) ||
    !uuid(request.providerRefundId) ||
    !positiveMinor(request.refundDeltaMinor) ||
    !nonNegativeMinor(request.previousCumulativeRefundedMinor) ||
    !positiveMinor(request.cumulativeRefundedMinor) ||
    request.cumulativeRefundedMinor - request.previousCumulativeRefundedMinor !==
      request.refundDeltaMinor ||
    !Number.isFinite(Date.parse(request.observedAt)) ||
    request.rawCanonicalResponseBytes.byteLength < 1
  ) {
    fail("invalid_input");
  }
}

function refundFactDigest(
  request: Parameters<CanonicalRefundEvidenceSealer["sealCanonicalRefund"]>[0]
): FinanceDigest {
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        kind: "arc_pay_client_order_refund",
        schemaVersion: 1,
        providerAccount: {
          seriesId: request.claim.providerAccount.seriesId,
          providerAccountId: request.claim.providerAccount.providerAccountId,
          identityVersion: request.claim.providerAccount.identityVersion
        },
        economicPaymentIntentId: request.economicPaymentIntentId,
        providerPaymentId: request.providerPaymentId,
        providerRefundId: request.providerRefundId,
        refundDeltaMinor: String(request.refundDeltaMinor),
        previousCumulativeRefundedMinor: String(request.previousCumulativeRefundedMinor),
        cumulativeRefundedMinor: String(request.cumulativeRefundedMinor),
        currency: "RUB"
      })
    )
  );
}

function canonicalArtifactId(providerRefundId: string, responseDigest: FinanceDigest): string {
  return `arc-canonical-refund:${providerRefundId}:${responseDigest.slice("sha256:".length)}`;
}

function normalizeRetention(input: Readonly<{ policyId: string; policyVersion: string }>) {
  if (!identifier(input.policyId) || !/^[1-9][0-9]*$/.test(input.policyVersion)) {
    fail("invalid_input");
  }
  return Object.freeze({ policyId: input.policyId, policyVersion: input.policyVersion });
}

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    value.trim() === value &&
    !hasAsciiControlCharacter(value)
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function positiveMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function digest(bytes: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(reason: CanonicalClientOrderRefundEvidenceSealerError["reason"]): never {
  throw new CanonicalClientOrderRefundEvidenceSealerError(reason);
}
