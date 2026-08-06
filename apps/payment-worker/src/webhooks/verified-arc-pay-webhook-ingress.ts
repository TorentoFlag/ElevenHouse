/* eslint-disable no-control-regex -- Webhook validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";
import type {
  FinanceProviderAccountIdentity,
  VerifiedWebhookIngressEvidence
} from "@elevenhouse/domain/finance-core";

import type { ArcPayWebhookSignatureInspection } from "../arc-pay/arc-pay-signature";
import type { ArcPayWebhookTransportEnvelope } from "../arc-pay/arc-pay-webhook";

export class VerifiedArcPayWebhookIngressEvidenceError extends Error {
  constructor(readonly reason: "invalid_signature" | "correlation" | "invalid_input") {
    super("Verified ArcPay webhook ingress evidence could not be issued");
    this.name = "VerifiedArcPayWebhookIngressEvidenceError";
  }
}

/**
 * The payment worker is the only issuer for this brand: it runs after HMAC verification and
 * after the exact raw payload has been sealed in private storage. Domain code receives the
 * branded evidence but has no factory capable of minting it.
 */
export function createVerifiedArcPayWebhookIngressEvidence(input: Readonly<{
  signature: ArcPayWebhookSignatureInspection;
  transport: ArcPayWebhookTransportEnvelope;
  providerAccount: FinanceProviderAccountIdentity;
  sealedPayloadRef: string;
  /** Exact transport bytes that were HMAC-verified and sealed; never a reparsed payload. */
  rawBody: Uint8Array;
  webhookSigningKeyVersionId: string;
  verifiedAt: string;
  receivedAt: string;
}>): VerifiedWebhookIngressEvidence {
  if (input.signature.kind !== "verified") fail("invalid_signature");
  if (input.signature.webhookId !== input.transport.providerWebhookId) fail("correlation");
  const sealedPayloadRef = identifier(input.sealedPayloadRef);
  const webhookSigningKeyVersionId = identifier(input.webhookSigningKeyVersionId);
  const verifiedAt = isoInstant(input.verifiedAt);
  const receivedAt = isoInstant(input.receivedAt);
  if (Date.parse(verifiedAt) > Date.parse(receivedAt)) fail("invalid_input");
  const providerEventType = eventType(input.transport.providerEventType);

  return Object.freeze({
    kind: "verified_webhook_ingress_evidence",
    provider: "arc_pay",
    providerAccount: input.providerAccount,
    receivingEnvironment: input.transport.environment,
    webhookId: input.signature.webhookId,
    providerEventType,
    rawBodyDigest: digest(input.rawBody),
    sealedPayloadRef,
    signatureScheme: "arc_pay_hmac_sha256_v1",
    verifierContractVersion: "arc_pay_webhook_ingress_v1",
    webhookSigningKeyVersionId,
    signedTimestamp: isoInstant(input.signature.signedTimestamp),
    signatureEvidenceDigest: input.signature.signatureEvidenceDigest,
    verifiedAt,
    receivedAt
  }) as VerifiedWebhookIngressEvidence;
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function eventType(value: unknown): string {
  return identifier(value);
}

function isoInstant(value: unknown): string {
  if (typeof value !== "string") fail("invalid_input");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail("invalid_input");
  return value;
}

function fail(reason: VerifiedArcPayWebhookIngressEvidenceError["reason"]): never {
  throw new VerifiedArcPayWebhookIngressEvidenceError(reason);
}
