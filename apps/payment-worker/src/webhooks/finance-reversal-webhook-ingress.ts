import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  hasAsciiControlCharacter,
  type ActiveProviderAccountWebhookContextReaderPort,
  type FinancePrivateObjectStoragePort,
  type WebhookIngressStorageUnitOfWork
} from "@elevenhouse/domain/finance-core";

import type { ArcPayWebhookSignatureInspection } from "../arc-pay/arc-pay-signature";
import type { ArcPayWebhookTransportEnvelope } from "../arc-pay/arc-pay-webhook";
import { createVerifiedArcPayWebhookIngressEvidence } from "./verified-arc-pay-webhook-ingress";

/**
 * Durable ingress for any ArcPay event whose financial meaning is resolved only by a later
 * canonical provider read. The event type remains an immutable inbox fact; this boundary does
 * not infer a refund, capture or ledger transition from raw transport payload.
 */
export type FinanceWebhookIngress = Readonly<{
  store(
    input: Readonly<{
      signature: ArcPayWebhookSignatureInspection;
      transport: ArcPayWebhookTransportEnvelope;
      /** Exact bytes already HMAC-verified by the HTTP boundary. */
      rawBody: Uint8Array;
    }>
  ): Promise<Readonly<{ duplicate: boolean }>>;
}>;

/** @deprecated Use FinanceWebhookIngress; retained while callers move from reversal-only wiring. */
export type FinanceReversalWebhookIngress = FinanceWebhookIngress;

export class FinanceReversalWebhookIngressError extends Error {
  readonly code = "FINANCE_REVERSAL_WEBHOOK_INGRESS_ERROR" as const;

  constructor(
    readonly reason:
      | "invalid_input"
      | "provider_account_unavailable"
      | "tenant_mismatch"
      | "artifact_integrity"
      | "artifact_registration"
      | "storage"
  ) {
    super("Verified reversal webhook could not be durably stored");
    this.name = "FinanceReversalWebhookIngressError";
  }
}

/**
 * The legacy webhook projector may not process reversals once the finance dispatcher is active:
 * its old ledger is not the authority for the new refund/chargeback aggregates.  This boundary
 * therefore accepts a verified reversal only after immutable evidence and a webhook-inbox receipt
 * have committed.  A later worker applies a canonical provider fact and the one authoritative
 * aggregate/journal transition.
 */
export function createFinanceWebhookIngress(
  input: Readonly<{
    providerAccounts: ActiveProviderAccountWebhookContextReaderPort;
    privateObjectStorage: FinancePrivateObjectStoragePort;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    ingressStorage: WebhookIngressStorageUnitOfWork;
    webhookSigningKeyVersionId: string;
    webhookArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
    now?: () => Date;
  }>
): FinanceWebhookIngress {
  const now = input.now ?? (() => new Date());
  const retention = normalizeRetention(input.webhookArtifactRetention);
  const signingKeyVersionId = identifier(input.webhookSigningKeyVersionId);

  return Object.freeze({
    async store(request) {
      if (request.signature.kind !== "verified") fail("invalid_input");
      const providerContext = await input.providerAccounts.findActiveWebhookContext({
        provider: "arc_pay"
      });
      if (!providerContext) fail("provider_account_unavailable");
      if (providerContext.merchantTenantId !== request.transport.merchantTenantId) {
        fail("tenant_mismatch");
      }
      const providerAccount = providerContext.providerAccount;

      const sha256Digest = digest(request.rawBody);
      const artifactId = artifactIdentity(
        providerAccount,
        request.transport.providerWebhookId,
        sha256Digest
      );
      let privateObject;
      try {
        privateObject = await input.privateObjectStorage.writeImmutable({
          artifactId,
          contentType: "application/json",
          bytes: request.rawBody,
          expectedSha256Digest: sha256Digest
        });
      } catch {
        fail("storage");
      }
      if (
        privateObject.sha256Digest !== sha256Digest ||
        privateObject.byteLength !== request.rawBody.byteLength ||
        privateObject.contentType !== "application/json"
      ) {
        fail("artifact_integrity");
      }

      let artifact;
      try {
        artifact = await input.artifactRegistry.registerSealedArtifact({
          artifact: { artifactId, sha256Digest, byteLength: request.rawBody.byteLength },
          artifactClass: "provider_webhook",
          binding: { kind: "provider", providerAccount },
          contentType: "application/json",
          privateObject,
          retentionPolicyId: retention.policyId,
          retentionPolicyVersion: retention.policyVersion
        });
      } catch {
        fail("artifact_registration");
      }
      if (
        "bankCashPoolId" in artifact ||
        artifact.artifactId !== artifactId ||
        artifact.sha256Digest !== sha256Digest ||
        artifact.byteLength !== request.rawBody.byteLength
      ) {
        fail("artifact_integrity");
      }

      const receivedAt = instant(now());
      const ingressEvidence = createVerifiedArcPayWebhookIngressEvidence({
        signature: request.signature,
        transport: request.transport,
        providerAccount,
        sealedPayloadRef: artifactId,
        rawBody: request.rawBody,
        webhookSigningKeyVersionId: signingKeyVersionId,
        verifiedAt: receivedAt,
        receivedAt
      });
      try {
        const receipt = await input.ingressStorage.storeBeforeAcknowledgement({
          ingressEvidence,
          expectedTransportIdentityAbsent: true
        });
        return Object.freeze({ duplicate: receipt.dedupeResult === "transport_replay" });
      } catch {
        fail("storage");
      }
    }
  } satisfies FinanceWebhookIngress);
}

/** @deprecated Use createFinanceWebhookIngress; retained for compatibility with reversal wiring. */
export const createFinanceReversalWebhookIngress = createFinanceWebhookIngress;

function artifactIdentity(
  providerAccount: Readonly<{
    seriesId: string;
    providerAccountId: string;
    identityVersion: number;
  }>,
  webhookId: string,
  sha256Digest: `sha256:${string}`
): string {
  return `arc-webhook:${createHash("sha256")
    .update(
      JSON.stringify({
        providerAccount,
        webhookId: identifier(webhookId),
        sha256Digest
      }),
      "utf8"
    )
    .digest("hex")}`;
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizeRetention(value: Readonly<{ policyId: string; policyVersion: string }>) {
  return Object.freeze({
    policyId: identifier(value.policyId),
    policyVersion: revision(value.policyVersion)
  });
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function revision(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) fail("invalid_input");
  return value;
}

function instant(value: Date): string {
  if (Number.isNaN(value.getTime())) fail("invalid_input");
  return value.toISOString();
}

function fail(reason: FinanceReversalWebhookIngressError["reason"]): never {
  throw new FinanceReversalWebhookIngressError(reason);
}
