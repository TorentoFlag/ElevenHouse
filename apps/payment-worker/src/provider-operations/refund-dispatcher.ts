import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type FinanceDigest,
  type FinancePrivateObjectStoragePort,
  type ProviderOperationDispatchWorkItem,
  type ProviderOperationResultApplicationUnitOfWork,
  type ProviderOperationTransportUnknownUnitOfWork,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";

import {
  ArcPayRefundClientError,
  createArcPayRefundClient
} from "../arc-pay/arc-pay-refund-client";
import { decodeArcPayExactJson } from "../arc-pay/arc-pay-exact-json";
import type { ProviderResponseArtifactRetention } from "./hosted-checkout-session-dispatcher";
import type { ProviderOperationDispatcher } from "./provider-operation-dispatch-relay";

type ArcPayRefundClient = ReturnType<typeof createArcPayRefundClient>;

export class RefundDispatcherError extends Error {
  readonly code = "REFUND_DISPATCHER_ERROR" as const;

  constructor(
    readonly reason:
      | "unsupported_operation"
      | "request_artifact_integrity"
      | "request_envelope_invalid"
      | "response_artifact_integrity"
      | "response_payload_invalid"
      | "response_identity_conflict"
  ) {
    super("Refund dispatch could not be completed safely");
    this.name = "RefundDispatcherError";
  }
}

/**
 * The ArcPay POST response establishes neither a successful refund nor a ledger reversal.
 * It is sealed as ambiguous transport evidence until a canonical provider outcome or webhook
 * applies the dedicated refund-result unit of work.
 */
export function createRefundDispatcher(input: Readonly<{
  privateObjectStorage: FinancePrivateObjectStoragePort;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  refundClient: ArcPayRefundClient;
  providerResult: ProviderOperationResultApplicationUnitOfWork;
  transportUnknown: ProviderOperationTransportUnknownUnitOfWork;
  responseArtifactRetention: ProviderResponseArtifactRetention;
  now?: () => Date;
}>): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind !== "refund") fail("unsupported_operation");
      const envelope = await loadEnvelope(input.privateObjectStorage, workItem);
      let response;
      try {
        response = await input.refundClient.createRefund({
          envelope,
          idempotencyKey: workItem.dispatch.idempotencyKey
        });
      } catch (error) {
        if (error instanceof ArcPayRefundClientError && error.reason === "transport") {
          await input.transportUnknown.markProviderOperationTransportUnknown({
            economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
            expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
            providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
            expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion
          });
          return;
        }
        throw error;
      }
      assertResponse(response, envelope);
      const responseArtifact = await sealResponse({
        storage: input.privateObjectStorage,
        registry: input.artifactRegistry,
        workItem,
        rawResponseBytes: response.rawResponseBytes,
        retention
      });
      await input.providerResult.applyVerifiedProviderResult({
        economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
        expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
        providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
        expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
        evidence: ambiguousEvidence(
          workItem,
          response.providerRefundId,
          response.providerPaymentId,
          responseArtifact,
          instant(now())
        ),
        operationEnvelope: workItem.operationEnvelope
      });
    }
  } satisfies ProviderOperationDispatcher);
}

async function loadEnvelope(
  storage: FinancePrivateObjectStoragePort,
  workItem: ProviderOperationDispatchWorkItem
) {
  const artifact = await storage.readImmutable(workItem.privateObject);
  if (
    artifact.contentType !== "application/json" ||
    artifact.sha256Digest !== workItem.dispatchArtifact.sha256Digest ||
    artifact.byteLength !== workItem.dispatchArtifact.byteLength
  ) {
    fail("request_artifact_integrity");
  }
  decodeExact(artifact.bytes, artifact.sha256Digest, "request_envelope_invalid");
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes));
  } catch {
    fail("request_envelope_invalid");
  }
  let envelope;
  try {
    envelope = createProviderDispatchEnvelope(payload);
  } catch {
    fail("request_envelope_invalid");
  }
  if (
    envelope.kind !== "refund" ||
    digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest ||
    String(envelope.amount.amountMinor) !== workItem.dispatch.amountMinor ||
    envelope.amount.currency !== workItem.dispatch.currency
  ) {
    fail("request_envelope_invalid");
  }
  return envelope;
}

async function sealResponse(input: Readonly<{
  storage: FinancePrivateObjectStoragePort;
  registry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  workItem: ProviderOperationDispatchWorkItem;
  rawResponseBytes: Uint8Array;
  retention: ProviderResponseArtifactRetention;
}>) {
  const sha256Digest = digest(input.rawResponseBytes);
  decodeExact(input.rawResponseBytes, sha256Digest, "response_payload_invalid");
  const artifactId = `arc-refund-response:${input.workItem.dispatch.providerOperationIntentId}`;
  const privateObject = await input.storage.writeImmutable({
    artifactId,
    contentType: "application/json",
    bytes: input.rawResponseBytes,
    expectedSha256Digest: sha256Digest
  });
  if (
    privateObject.sha256Digest !== sha256Digest ||
    privateObject.byteLength !== input.rawResponseBytes.byteLength ||
    privateObject.contentType !== "application/json"
  ) {
    fail("response_artifact_integrity");
  }
  const artifact = await input.registry.registerSealedArtifact({
    artifact: { artifactId, sha256Digest, byteLength: input.rawResponseBytes.byteLength },
    artifactClass: "provider_response",
    binding: { kind: "provider", providerAccount: input.workItem.dispatch.providerAccount },
    contentType: "application/json",
    privateObject,
    retentionPolicyId: input.retention.policyId,
    retentionPolicyVersion: input.retention.policyVersion
  });
  if (
    "bankCashPoolId" in artifact ||
    artifact.artifactId !== artifactId ||
    artifact.sha256Digest !== sha256Digest ||
    artifact.byteLength !== input.rawResponseBytes.byteLength
  ) {
    fail("response_artifact_integrity");
  }
  return artifact;
}

function ambiguousEvidence(
  workItem: ProviderOperationDispatchWorkItem,
  providerRefundId: string,
  providerPaymentId: string,
  artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: number }>,
  observedAt: string
): VerifiedProviderOperationEvidence {
  const dispatch = workItem.dispatch;
  return Object.freeze({
    kind: "verified_provider_operation_evidence" as const,
    providerAccount: dispatch.providerAccount,
    economicPaymentIntentId: dispatch.economicPaymentIntentId,
    economicPaymentSessionId: null,
    sourceId: dispatch.sourceId,
    purpose: "client_order" as const,
    providerOperationIntentId: dispatch.providerOperationIntentId,
    operationKind: "refund" as const,
    providerOperationId: providerRefundId,
    canonicalRequestDigest: dispatch.canonicalRequestDigest,
    idempotencyKey: dispatch.idempotencyKey,
    outcome: "ambiguous" as const,
    providerPaymentId,
    amountMinor: null,
    currency: null,
    artifact,
    observedAt
  }) as VerifiedProviderOperationEvidence;
}

function assertResponse(
  value: Readonly<{
    providerRefundId: string;
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    status: string;
    rawResponseBytes: Uint8Array;
  }>,
  envelope: Extract<ReturnType<typeof createProviderDispatchEnvelope>, { kind: "refund" }>
): void {
  const decoded = decodeExact(value.rawResponseBytes, digest(value.rawResponseBytes), "response_payload_invalid");
  if (
    typeof decoded.value !== "object" ||
    decoded.value === null ||
    Array.isArray(decoded.value) ||
    (decoded.value as Record<string, unknown>).id !== value.providerRefundId ||
    (decoded.value as Record<string, unknown>).payment_id !== value.providerPaymentId ||
    (decoded.value as Record<string, unknown>).amount !== String(value.amountMinor) ||
    value.providerPaymentId !== envelope.providerPaymentId ||
    value.amountMinor !== envelope.amount.amountMinor ||
    value.currency !== "RUB" ||
    !["pending", "succeeded", "failed"].includes(value.status)
  ) {
    fail("response_identity_conflict");
  }
}

function decodeExact(
  bytes: Uint8Array,
  expectedDigest: FinanceDigest,
  failure: "request_envelope_invalid" | "response_payload_invalid"
) {
  try {
    return decodeArcPayExactJson({ rawBody: bytes, expectedDigest, maximumBytes: 2 * 1024 * 1024 });
  } catch {
    fail(failure);
  }
}

function normalizeRetention(value: ProviderResponseArtifactRetention): ProviderResponseArtifactRetention {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value.policyId) || !/^[1-9][0-9]*$/.test(value.policyVersion)) {
    fail("response_artifact_integrity");
  }
  return value;
}

function digest(bytes: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as FinanceDigest;
}

function instant(value: Date): string {
  if (Number.isNaN(value.getTime())) fail("response_payload_invalid");
  return value.toISOString();
}

function fail(reason: RefundDispatcherError["reason"]): never {
  throw new RefundDispatcherError(reason);
}
