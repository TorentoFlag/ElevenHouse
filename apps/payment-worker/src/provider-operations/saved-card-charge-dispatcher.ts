import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type FinanceDigest,
  type FinancePrivateObjectStoragePort,
  type FinanceRestrictedProviderCredentialVaultPort,
  type ProviderOperationDispatchWorkItem,
  type ProviderOperationResultApplicationUnitOfWork,
  type ProviderOperationTransportUnknownUnitOfWork,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";

import {
  ArcPaySavedCardChargeClientError,
  createArcPaySavedCardChargeClient
} from "../arc-pay/arc-pay-saved-card-charge-client";
import { decodeArcPayExactJson } from "../arc-pay/arc-pay-exact-json";
import type { ProviderResponseArtifactRetention } from "./hosted-checkout-session-dispatcher";
import type { ProviderOperationDispatcher } from "./provider-operation-dispatch-relay";

type ArcPaySavedCardChargeClient = ReturnType<typeof createArcPaySavedCardChargeClient>;

export class SavedCardChargeDispatcherError extends Error {
  readonly code = "SAVED_CARD_CHARGE_DISPATCHER_ERROR" as const;
  constructor(readonly reason: "unsupported_operation" | "request_artifact_integrity" | "request_envelope_invalid" | "response_artifact_integrity" | "response_payload_invalid" | "response_identity_conflict") {
    super("Saved-card charge dispatch could not be completed safely");
  }
}

/**
 * The immediate response to an MIT charge is transport evidence only.  It is persisted as
 * `ambiguous` even when its status says captured: the later canonical GET is the sole source
 * allowed to trigger invoice capture, a ledger mutation, or an entitlement activation.
 */
export function createSavedCardChargeDispatcher(input: Readonly<{
  privateObjectStorage: FinancePrivateObjectStoragePort;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  credentialVault: FinanceRestrictedProviderCredentialVaultPort;
  savedCardClient: ArcPaySavedCardChargeClient;
  providerResult: ProviderOperationResultApplicationUnitOfWork;
  transportUnknown: ProviderOperationTransportUnknownUnitOfWork;
  responseArtifactRetention: ProviderResponseArtifactRetention;
  now?: () => Date;
}>): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind !== "saved_card_charge" || workItem.savedCardCredential === null) {
        fail("unsupported_operation");
      }
      const envelope = await loadEnvelope(input.privateObjectStorage, workItem);
      const credential = await input.credentialVault.resolveArcPaySavedCardCredential({
        restrictedTokenHandleRef: workItem.savedCardCredential.restrictedTokenHandleRef,
        expectedCredentialId: workItem.savedCardCredential.credentialId,
        expectedProviderCustomerId: workItem.savedCardCredential.providerCustomerId
      });
      if (
        credential.kind !== "arc_pay_restricted_saved_card_credential" ||
        credential.credentialId !== workItem.savedCardCredential.credentialId ||
        credential.providerCustomerId !== workItem.savedCardCredential.providerCustomerId
      ) fail("response_identity_conflict");
      let response;
      try {
        response = await input.savedCardClient.chargeSavedCard({
          envelope,
          providerCustomerId: credential.providerCustomerId,
          cardTokenId: credential.cardTokenId,
          idempotencyKey: workItem.dispatch.idempotencyKey
        });
      } catch (error) {
        if (error instanceof ArcPaySavedCardChargeClientError && error.reason === "transport") {
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
      assertResponse(response);
      const responseArtifact = await sealResponse({
        storage: input.privateObjectStorage,
        registry: input.artifactRegistry,
        workItem,
        rawResponseBytes: response.rawResponseBytes,
        retention
      });
      const observedAt = instant(now());
      await input.providerResult.applyVerifiedProviderResult({
        economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
        expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
        providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
        expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
        evidence: ambiguousEvidence(workItem, response.providerPaymentId, responseArtifact, observedAt),
        operationEnvelope: workItem.operationEnvelope
      });
    }
  } satisfies ProviderOperationDispatcher);
}

async function loadEnvelope(storage: FinancePrivateObjectStoragePort, workItem: ProviderOperationDispatchWorkItem) {
  const artifact = await storage.readImmutable(workItem.privateObject);
  if (artifact.contentType !== "application/json" || artifact.sha256Digest !== workItem.dispatchArtifact.sha256Digest || artifact.byteLength !== workItem.dispatchArtifact.byteLength) fail("request_artifact_integrity");
  decodeExact(artifact.bytes, artifact.sha256Digest, "request_envelope_invalid");
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes)); } catch { fail("request_envelope_invalid"); }
  let envelope;
  try { envelope = createProviderDispatchEnvelope(payload); } catch { fail("request_envelope_invalid"); }
  if (
    envelope.kind !== "saved_card_charge" ||
    digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest ||
    envelope.externalId !== workItem.dispatch.sourceId ||
    String(envelope.amount.amountMinor) !== workItem.dispatch.amountMinor ||
    envelope.amount.currency !== workItem.dispatch.currency ||
    envelope.savedCardCredential.credentialId !== workItem.savedCardCredential!.credentialId ||
    envelope.savedCardCredential.credentialVersion !== workItem.savedCardCredential!.credentialVersion
  ) fail("request_envelope_invalid");
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
  const artifactId = `arc-saved-card-charge-response:${input.workItem.dispatch.providerOperationIntentId}`;
  const privateObject = await input.storage.writeImmutable({ artifactId, contentType: "application/json", bytes: input.rawResponseBytes, expectedSha256Digest: sha256Digest });
  if (privateObject.sha256Digest !== sha256Digest || privateObject.byteLength !== input.rawResponseBytes.byteLength || privateObject.contentType !== "application/json") fail("response_artifact_integrity");
  const artifact = await input.registry.registerSealedArtifact({
    artifact: { artifactId, sha256Digest, byteLength: input.rawResponseBytes.byteLength },
    artifactClass: "provider_response",
    binding: { kind: "provider", providerAccount: input.workItem.dispatch.providerAccount },
    contentType: "application/json",
    privateObject,
    retentionPolicyId: input.retention.policyId,
    retentionPolicyVersion: input.retention.policyVersion
  });
  if ("bankCashPoolId" in artifact || artifact.artifactId !== artifactId || artifact.sha256Digest !== sha256Digest || artifact.byteLength !== input.rawResponseBytes.byteLength) fail("response_artifact_integrity");
  return artifact;
}

function ambiguousEvidence(workItem: ProviderOperationDispatchWorkItem, providerPaymentId: string, artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: number }>, observedAt: string): VerifiedProviderOperationEvidence {
  const dispatch = workItem.dispatch;
  return Object.freeze({
    kind: "verified_provider_operation_evidence" as const,
    providerAccount: dispatch.providerAccount,
    economicPaymentIntentId: dispatch.economicPaymentIntentId,
    economicPaymentSessionId: dispatch.economicPaymentSessionId,
    sourceId: dispatch.sourceId,
    purpose: dispatch.purpose,
    providerOperationIntentId: dispatch.providerOperationIntentId,
    operationKind: "saved_card_charge" as const,
    providerOperationId: providerPaymentId,
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

function assertResponse(value: Readonly<{ providerPaymentId: string; status: string; rawResponseBytes: Uint8Array }>): void {
  const decoded = decodeExact(value.rawResponseBytes, digest(value.rawResponseBytes), "response_payload_invalid");
  if (
    typeof decoded.value !== "object" ||
    decoded.value === null ||
    Array.isArray(decoded.value) ||
    (decoded.value as Record<string, unknown>).payment_id !== value.providerPaymentId ||
    (decoded.value as Record<string, unknown>).status !== value.status
  ) fail("response_identity_conflict");
}
function decodeExact(bytes: Uint8Array, expectedDigest: FinanceDigest, failure: "request_envelope_invalid" | "response_payload_invalid") { try { return decodeArcPayExactJson({ rawBody: bytes, expectedDigest, maximumBytes: 2 * 1024 * 1024 }); } catch { fail(failure); } }
function normalizeRetention(value: ProviderResponseArtifactRetention): ProviderResponseArtifactRetention { if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value.policyId) || !/^[1-9][0-9]*$/.test(value.policyVersion)) fail("response_artifact_integrity"); return value; }
function digest(bytes: Uint8Array): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function instant(value: Date): string { if (Number.isNaN(value.getTime())) fail("response_payload_invalid"); return value.toISOString(); }
function fail(reason: SavedCardChargeDispatcherError["reason"]): never { throw new SavedCardChargeDispatcherError(reason); }
