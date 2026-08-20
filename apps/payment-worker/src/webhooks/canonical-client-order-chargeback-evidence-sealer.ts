import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  FinanceDigest,
  FinancePrivateObjectStoragePort,
  VerifiedWebhookSemanticEvidence
} from "@elevenhouse/domain/finance-core";
import { hasAsciiControlCharacter } from "@elevenhouse/domain/finance-core";

import type { CanonicalChargebackEvidenceSealer } from "./canonical-client-order-chargeback.processor";

export class CanonicalClientOrderChargebackEvidenceSealerError extends Error {
  readonly code = "canonical_client_order_chargeback_evidence_sealer_error" as const;

  constructor(readonly reason: "invalid_input" | "storage" | "storage_integrity" | "registration") {
    super("Canonical client-order chargeback evidence could not be sealed safely");
    this.name = "CanonicalClientOrderChargebackEvidenceSealerError";
  }
}

/** Seals the correlation-bound ArcPay payment GET independently from the signed delivery webhook. */
export function createCanonicalClientOrderChargebackEvidenceSealer(
  input: Readonly<{
    privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "writeImmutable">;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    retention: Readonly<{ policyId: string; policyVersion: string }>;
  }>
): CanonicalChargebackEvidenceSealer {
  const retention = normalizeRetention(input.retention);
  return Object.freeze({
    async sealCanonicalChargeback(request) {
      assertInput(request);
      const sha256Digest = digest(request.rawCanonicalResponseBytes);
      const artifactId = `arc-canonical-chargeback:${request.claim.webhookId}:${sha256Digest.slice("sha256:".length)}`;
      let privateObject;
      try {
        privateObject = await input.privateObjectStorage.writeImmutable({
          artifactId,
          contentType: "application/json",
          bytes: request.rawCanonicalResponseBytes,
          expectedSha256Digest: sha256Digest
        });
      } catch {
        fail("storage");
      }
      if (
        privateObject.sha256Digest !== sha256Digest ||
        privateObject.byteLength !== request.rawCanonicalResponseBytes.byteLength ||
        privateObject.contentType !== "application/json"
      )
        fail("storage_integrity");
      let artifact;
      try {
        artifact = await input.artifactRegistry.registerSealedArtifact({
          artifact: {
            artifactId,
            sha256Digest,
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
        artifact.sha256Digest !== sha256Digest ||
        artifact.byteLength !== request.rawCanonicalResponseBytes.byteLength
      )
        fail("registration");
      return Object.freeze({
        kind: "verified_webhook_semantic_evidence",
        sourceDelivery: "webhook",
        providerAccount: request.claim.providerAccount,
        webhookId: request.claim.webhookId,
        semanticSourceKind: "chargeback",
        semanticSourceId: request.claim.webhookId,
        economicPaymentIntentId: request.economicPaymentIntentId,
        economicPaymentSessionId: null,
        providerPaymentId: null,
        amountMinor: null,
        currency: null,
        purpose: "client_order",
        canonicalFactDigest: factDigest(request),
        artifact,
        observedAt: request.observedAt
      }) as VerifiedWebhookSemanticEvidence;
    }
  } satisfies CanonicalChargebackEvidenceSealer);
}

function assertInput(
  request: Parameters<CanonicalChargebackEvidenceSealer["sealCanonicalChargeback"]>[0]
): void {
  if (
    !identifier(request.economicPaymentIntentId) ||
    !uuid(request.claim.webhookId) ||
    !uuid(request.providerPaymentId) ||
    !positiveMinor(request.disputedPrincipalMinor) ||
    !Number.isFinite(Date.parse(request.observedAt)) ||
    request.rawCanonicalResponseBytes.byteLength < 1
  )
    fail("invalid_input");
}

function factDigest(
  request: Parameters<CanonicalChargebackEvidenceSealer["sealCanonicalChargeback"]>[0]
): FinanceDigest {
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        kind: "arc_pay_client_order_chargeback_provisional",
        schemaVersion: 1,
        providerAccount: request.claim.providerAccount,
        webhookId: request.claim.webhookId,
        economicPaymentIntentId: request.economicPaymentIntentId,
        providerPaymentId: request.providerPaymentId,
        disputedPrincipalMinor: String(request.disputedPrincipalMinor),
        currency: "RUB"
      })
    )
  );
}

function normalizeRetention(input: Readonly<{ policyId: string; policyVersion: string }>) {
  if (!identifier(input.policyId) || !/^[1-9][0-9]*$/.test(input.policyVersion))
    fail("invalid_input");
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function positiveMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function digest(bytes: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(reason: CanonicalClientOrderChargebackEvidenceSealerError["reason"]): never {
  throw new CanonicalClientOrderChargebackEvidenceSealerError(reason);
}
