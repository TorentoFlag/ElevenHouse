/* eslint-disable no-control-regex -- Boundary validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type ClientCheckoutProviderTransportUnknownUnitOfWork,
  type ClientCheckoutSessionResultUnitOfWork,
  type FinanceDigest,
  type FinancePrivateObjectStoragePort,
  type ProviderOperationDispatchWorkItem,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";

import {
  ArcPayCheckoutSessionClientError,
  createArcPayCheckoutSessionClient
} from "../arc-pay/arc-pay-checkout-session-client";
import { decodeArcPayExactJson } from "../arc-pay/arc-pay-exact-json";
import type { ProviderOperationDispatcher } from "./provider-operation-dispatch-relay";

type ArcPayHostedCheckoutClient = ReturnType<typeof createArcPayCheckoutSessionClient>;

export type ProviderResponseArtifactRetention = Readonly<{
  policyId: string;
  policyVersion: string;
}>;

export class HostedCheckoutSessionDispatcherError extends Error {
  readonly code = "HOSTED_CHECKOUT_SESSION_DISPATCHER_ERROR" as const;

  constructor(
    readonly reason:
      | "unsupported_operation"
      | "request_artifact_integrity"
      | "request_envelope_invalid"
      | "response_artifact_integrity"
      | "response_payload_invalid"
      | "response_identity_conflict"
  ) {
    super("Hosted Checkout session dispatch could not be completed safely");
  }
}

/**
 * HPP-only provider dispatcher. It reconstructs the request from its private immutable artifact,
 * seals the exact provider response, then atomically publishes the non-monetary session action.
 * The hosted URL is deliberately absent from every durable/public result.
 */
export function createHostedCheckoutSessionDispatcher(
  input: Readonly<{
    privateObjectStorage: FinancePrivateObjectStoragePort;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    checkoutClient: ArcPayHostedCheckoutClient;
    sessionResult: ClientCheckoutSessionResultUnitOfWork;
    transportUnknown: ClientCheckoutProviderTransportUnknownUnitOfWork;
    responseArtifactRetention: ProviderResponseArtifactRetention;
  }>
): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind !== "checkout_session_create") fail("unsupported_operation");
      const envelope = await loadCheckoutEnvelope(input.privateObjectStorage, workItem);
      let response;
      try {
        response = await input.checkoutClient.createHostedCheckout({
          envelope,
          idempotencyKey: workItem.dispatch.idempotencyKey
        });
      } catch (error) {
        if (error instanceof ArcPayCheckoutSessionClientError && error.reason === "transport") {
          await input.transportUnknown.markClientCheckoutProviderTransportUnknown({
            economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
            expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
            providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
            expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion
          });
          return;
        }
        throw error;
      }
      assertExactResponse(response);
      const responseArtifact = await sealResponse({
        storage: input.privateObjectStorage,
        registry: input.artifactRegistry,
        workItem,
        rawResponseBytes: response.rawResponseBytes,
        retention
      });
      await input.sessionResult.completeClientCheckoutSession({
        providerResult: {
          economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
          expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
          providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
          expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
          evidence: providerSessionEvidence(
            workItem,
            response.providerCheckoutId,
            responseArtifact
          ),
          operationEnvelope: workItem.operationEnvelope
        },
        providerCheckoutId: response.providerCheckoutId,
        responseArtifactId: responseArtifact.artifactId,
        responseArtifactDigest: responseArtifact.sha256Digest
      });
    }
  });
}

async function loadCheckoutEnvelope(
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
  decodeExactJson(artifact.bytes, artifact.sha256Digest, "request_envelope_invalid");
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
    envelope.kind !== "checkout_session_create" ||
    digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest ||
    envelope.amount.amountMinor !== Number(workItem.dispatch.amountMinor) ||
    envelope.amount.currency !== workItem.dispatch.currency ||
    envelope.orderId !== workItem.dispatch.sourceId
  ) {
    fail("request_envelope_invalid");
  }
  return envelope;
}

async function sealResponse(
  input: Readonly<{
    storage: FinancePrivateObjectStoragePort;
    registry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    workItem: ProviderOperationDispatchWorkItem;
    rawResponseBytes: Uint8Array;
    retention: ProviderResponseArtifactRetention;
  }>
) {
  const responseDigest = digest(input.rawResponseBytes);
  decodeExactJson(input.rawResponseBytes, responseDigest, "response_payload_invalid");
  const artifactId = `arc-hpp-session-response:${input.workItem.dispatch.providerOperationIntentId}`;
  const privateObject = await input.storage.writeImmutable({
    artifactId,
    contentType: "application/json",
    bytes: input.rawResponseBytes,
    expectedSha256Digest: responseDigest
  });
  if (
    privateObject.sha256Digest !== responseDigest ||
    privateObject.byteLength !== input.rawResponseBytes.byteLength ||
    privateObject.contentType !== "application/json"
  ) {
    fail("response_artifact_integrity");
  }
  const artifact = await input.registry.registerSealedArtifact({
    artifact: {
      artifactId,
      sha256Digest: responseDigest,
      byteLength: input.rawResponseBytes.byteLength
    },
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
    artifact.sha256Digest !== responseDigest ||
    artifact.byteLength !== input.rawResponseBytes.byteLength
  ) {
    fail("response_artifact_integrity");
  }
  return artifact;
}

function providerSessionEvidence(
  workItem: ProviderOperationDispatchWorkItem,
  providerCheckoutId: string,
  artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: number }>
): VerifiedProviderOperationEvidence {
  const dispatch = workItem.dispatch;
  return Object.freeze({
    kind: "verified_provider_operation_evidence" as const,
    providerAccount: dispatch.providerAccount,
    economicPaymentIntentId: dispatch.economicPaymentIntentId,
    economicPaymentSessionId: dispatch.economicPaymentSessionId,
    sourceId: dispatch.sourceId,
    purpose: dispatch.purpose,
    providerOperationIntentId: dispatch.providerOperationIntentId,
    operationKind: "checkout_session_create" as const,
    providerOperationId: providerCheckoutId,
    canonicalRequestDigest: dispatch.canonicalRequestDigest,
    idempotencyKey: dispatch.idempotencyKey,
    outcome: "succeeded" as const,
    providerPaymentId: null,
    amountMinor: null,
    currency: null,
    artifact,
    observedAt: new Date().toISOString()
  }) as VerifiedProviderOperationEvidence;
}

function assertExactResponse(
  value: Readonly<{
    providerCheckoutId: string;
    checkoutUrl: string;
    rawResponseBytes: Uint8Array;
  }>
): void {
  const document = decodeExactJson(
    value.rawResponseBytes,
    digest(value.rawResponseBytes),
    "response_payload_invalid"
  );
  if (
    typeof document.value !== "object" ||
    document.value === null ||
    Array.isArray(document.value) ||
    Object.keys(document.value).length !== 2 ||
    (document.value as Record<string, unknown>).id !== value.providerCheckoutId ||
    (document.value as Record<string, unknown>).url !== value.checkoutUrl
  ) {
    fail("response_identity_conflict");
  }
}

function decodeExactJson(
  rawBody: Uint8Array,
  expectedDigest: FinanceDigest,
  failure: "request_envelope_invalid" | "response_payload_invalid"
) {
  try {
    return decodeArcPayExactJson({ rawBody, expectedDigest, maximumBytes: 2 * 1024 * 1024 });
  } catch {
    fail(failure);
  }
}

function normalizeRetention(
  value: ProviderResponseArtifactRetention
): ProviderResponseArtifactRetention {
  if (!value || !identifier(value.policyId) || !/^[1-9][0-9]*$/.test(value.policyVersion)) {
    fail("response_artifact_integrity");
  }
  return Object.freeze({ policyId: value.policyId, policyVersion: value.policyVersion });
}

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function digest(bytes: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as FinanceDigest;
}

function fail(reason: HostedCheckoutSessionDispatcherError["reason"]): never {
  throw new HostedCheckoutSessionDispatcherError(reason);
}
