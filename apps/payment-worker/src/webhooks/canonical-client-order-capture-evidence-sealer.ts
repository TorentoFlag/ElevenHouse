import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  FinanceDigest,
  FinancePrivateObjectStoragePort,
  VerifiedWebhookSemanticEvidence
} from "@elevenhouse/domain/finance-core";
import {
  createCapturedProviderPaymentSemanticSourceId,
  hasAsciiControlCharacter
} from "@elevenhouse/domain/finance-core";

import type { CanonicalCaptureEvidenceSealer } from "./canonical-client-order-capture.processor";

export class CanonicalClientOrderCaptureEvidenceSealerError extends Error {
  readonly code = "canonical_client_order_capture_evidence_sealer_error" as const;

  constructor(readonly reason: "invalid_input" | "storage" | "storage_integrity" | "registration") {
    super("Canonical client-order capture evidence could not be sealed safely");
    this.name = "CanonicalClientOrderCaptureEvidenceSealerError";
  }
}

/**
 * The second, correlation-bound ArcPay GET response is sealed separately from the raw webhook.
 * Its semantic digest deliberately describes the stable captured economic fact, not incidental
 * response fields such as whether ArcPay later reports the same payment as `settled`.
 */
export function createCanonicalClientOrderCaptureEvidenceSealer(
  input: Readonly<{
    privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "writeImmutable">;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    retention: Readonly<{ policyId: string; policyVersion: string }>;
  }>
): CanonicalCaptureEvidenceSealer {
  const retention = normalizeRetention(input.retention);
  return Object.freeze({
    async sealCanonicalCapture(request) {
      assertInput(request);
      const responseDigest = digest(request.rawCanonicalResponseBytes);
      const artifactId = canonicalArtifactId(
        request.canonicalPayment.providerPaymentId,
        responseDigest
      );
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
          binding: { kind: "provider", providerAccount: request.correlation.providerAccount },
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
        providerAccount: request.correlation.providerAccount,
        webhookId: request.claim.webhookId,
        semanticSourceKind: "payment_transition",
        semanticSourceId: createCapturedProviderPaymentSemanticSourceId(
          request.canonicalPayment.providerPaymentId
        ),
        economicPaymentIntentId: request.correlation.economicPaymentIntentId,
        economicPaymentSessionId: request.correlation.economicPaymentSessionId,
        providerPaymentId: request.canonicalPayment.providerPaymentId,
        amountMinor: String(request.canonicalPayment.amountMinor),
        currency: "RUB",
        purpose: "client_order",
        canonicalFactDigest: capturedPaymentFactDigest(request),
        artifact,
        observedAt: request.canonicalPayment.observedAt
      }) as VerifiedWebhookSemanticEvidence;
    }
  } satisfies CanonicalCaptureEvidenceSealer);
}

function assertInput(
  request: Parameters<CanonicalCaptureEvidenceSealer["sealCanonicalCapture"]>[0]
): void {
  if (
    request.canonicalPayment.providerPaymentId.length < 1 ||
    request.canonicalPayment.externalId !== request.correlation.externalId ||
    request.canonicalPayment.amountMinor < 1 ||
    request.canonicalPayment.capturedAmountMinor !== request.canonicalPayment.amountMinor ||
    request.canonicalPayment.currency !== "RUB" ||
    (request.canonicalPayment.status !== "captured" &&
      request.canonicalPayment.status !== "settled") ||
    !Number.isFinite(Date.parse(request.canonicalPayment.observedAt)) ||
    request.rawCanonicalResponseBytes.byteLength < 1
  ) {
    fail("invalid_input");
  }
}

function capturedPaymentFactDigest(
  request: Parameters<CanonicalCaptureEvidenceSealer["sealCanonicalCapture"]>[0]
): FinanceDigest {
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        kind: "arc_pay_client_order_captured_payment",
        schemaVersion: 1,
        providerAccount: {
          seriesId: request.correlation.providerAccount.seriesId,
          providerAccountId: request.correlation.providerAccount.providerAccountId,
          identityVersion: request.correlation.providerAccount.identityVersion
        },
        providerPaymentId: request.canonicalPayment.providerPaymentId,
        externalId: request.correlation.externalId,
        amountMinor: String(request.canonicalPayment.amountMinor),
        currency: "RUB"
      })
    )
  );
}

function canonicalArtifactId(providerPaymentId: string, responseDigest: FinanceDigest): string {
  return `arc-canonical-payment:${providerPaymentId}:${responseDigest.slice("sha256:".length)}`;
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

function digest(bytes: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(reason: CanonicalClientOrderCaptureEvidenceSealerError["reason"]): never {
  throw new CanonicalClientOrderCaptureEvidenceSealerError(reason);
}
