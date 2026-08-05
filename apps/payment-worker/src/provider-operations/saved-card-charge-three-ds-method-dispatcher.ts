import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type FinanceDigest,
  type FinancePrivateObjectStoragePort,
  type FinanceTransientSecretVaultPort,
  type PlatformTariffInvoiceCustomerActionUnitOfWork,
  type ProviderOperationDispatchWorkItem,
  type ProviderOperationResultApplicationUnitOfWork,
  type ProviderOperationTransportUnknownUnitOfWork,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";
import { decodeArcPayThreeDsAction } from "@elevenhouse/finance-infrastructure";

import {
  ArcPayCardSetupClientError,
  createArcPayCardSetupClient
} from "../arc-pay/arc-pay-card-setup-client";
import { decodeArcPayExactJson } from "../arc-pay/arc-pay-exact-json";
import type { ProviderResponseArtifactRetention } from "./hosted-checkout-session-dispatcher";
import type { ProviderOperationDispatcher } from "./provider-operation-dispatch-relay";

type ArcPayMethodClient = ReturnType<typeof createArcPayCardSetupClient>;

export class SavedCardChargeThreeDsMethodDispatcherError extends Error {
  readonly code = "SAVED_CARD_CHARGE_THREE_DS_METHOD_DISPATCHER_ERROR" as const;
  constructor(readonly reason: "unsupported_operation" | "request_artifact_integrity" | "request_envelope_invalid" | "response_artifact_integrity" | "response_payload_invalid" | "response_identity_conflict") {
    super("Saved-card charge 3DS Method dispatch could not be completed safely");
  }
}

/**
 * Completes ArcPay 3DS Method for an existing saved-card payment. It never sends a saved-card
 * token and never makes a second MIT request. A challenge is persisted as a new durable action;
 * every other provider response remains ambiguous until canonical reconciliation.
 */
export function createSavedCardChargeThreeDsMethodDispatcher(input: Readonly<{
  privateObjectStorage: FinancePrivateObjectStoragePort;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  transientSecretVault: FinanceTransientSecretVaultPort;
  methodClient: ArcPayMethodClient;
  customerAction: PlatformTariffInvoiceCustomerActionUnitOfWork;
  providerResult: ProviderOperationResultApplicationUnitOfWork;
  transportUnknown: ProviderOperationTransportUnknownUnitOfWork;
  responseArtifactRetention: ProviderResponseArtifactRetention;
  now?: () => Date;
}>): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind !== "saved_card_charge_3ds_method_complete" || workItem.transientSecret === null || !workItem.threeDsMethodAction) {
        fail("unsupported_operation");
      }
      const envelope = await loadEnvelope(input.privateObjectStorage, workItem);
      const action = await loadMethodAction(input.privateObjectStorage, workItem);
      const context = await input.transientSecretVault.consumeArcPayThreeDsMethodContext({
        secretRef: workItem.transientSecret.sealedSecretRef,
        expectedProviderSetupId: envelope.providerPaymentId
      });
      let response;
      try {
        response = await input.methodClient.completeThreeDsMethod({
          providerSetupId: envelope.providerPaymentId,
          completionIndicator: envelope.completionIndicator,
          threeDsServerTransactionId: action.threeDs.threeDsServerTransactionId!,
          browserInfo: context.browserInfo,
          idempotencyKey: workItem.dispatch.idempotencyKey
        });
      } catch (error) {
        if (error instanceof ArcPayCardSetupClientError && error.reason === "transport") {
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
      assertResponseIdentity(response, envelope.providerPaymentId);
      const responseArtifact = await sealResponse({
        storage: input.privateObjectStorage,
        registry: input.artifactRegistry,
        workItem,
        rawResponseBytes: response.rawResponseBytes,
        retention
      });
      if (response.status === "pending_3ds" && response.nextAction?.type === "three_ds_challenge") {
        await input.customerAction.recordCustomerAction({
          invoiceId: envelope.invoiceId,
          expectedInvoiceVersion: requiredInvoiceVersion(workItem),
          economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
          expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
          economicPaymentSessionId: requiredSession(workItem),
          providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
          expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
          providerPaymentId: envelope.providerPaymentId,
          providerAccount: workItem.dispatch.providerAccount,
          providerResponseArtifact: responseArtifact,
          actionType: "three_ds_challenge",
          phase: "challenge"
        });
        return;
      }
      await input.providerResult.applyVerifiedProviderResult({
        economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
        expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
        providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
        expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
        evidence: ambiguousEvidence(workItem, envelope.providerPaymentId, responseArtifact, now().toISOString()),
        operationEnvelope: workItem.operationEnvelope
      });
    }
  } satisfies ProviderOperationDispatcher);
}

async function loadEnvelope(storage: FinancePrivateObjectStoragePort, workItem: ProviderOperationDispatchWorkItem) {
  const artifact = await storage.readImmutable(workItem.privateObject);
  if (artifact.contentType !== "application/json" || artifact.sha256Digest !== workItem.dispatchArtifact.sha256Digest || artifact.byteLength !== workItem.dispatchArtifact.byteLength) fail("request_artifact_integrity");
  decodeExact(artifact.bytes, artifact.sha256Digest, "request_envelope_invalid");
  let envelope;
  try { envelope = createProviderDispatchEnvelope(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes))); } catch { fail("request_envelope_invalid"); }
  if (
    workItem.transientSecret === null || !workItem.threeDsMethodAction ||
    envelope.kind !== "saved_card_charge_3ds_method" || workItem.dispatch.purpose !== "platform_invoice" ||
    workItem.dispatch.economicPaymentSessionId === null || workItem.dispatch.amountMinor === "0" ||
    digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest ||
    envelope.invoiceId !== workItem.dispatch.sourceId || envelope.providerPaymentId !== workItem.transientSecret.providerSetupId ||
    envelope.providerPaymentId !== workItem.threeDsMethodAction.providerSetupId ||
    envelope.customerActionId !== workItem.threeDsMethodAction.customerActionId ||
    envelope.threeDsMethodContextSecret.secretRef !== workItem.transientSecret.sealedSecretRef
  ) fail("request_envelope_invalid");
  return envelope;
}

async function loadMethodAction(storage: FinancePrivateObjectStoragePort, workItem: ProviderOperationDispatchWorkItem) {
  const action = workItem.threeDsMethodAction;
  if (!action) fail("request_envelope_invalid");
  const artifact = await storage.readImmutable(action.privateObject);
  if (artifact.contentType !== "application/json" || artifact.sha256Digest !== action.responseArtifact.sha256Digest || artifact.byteLength !== action.responseArtifact.byteLength) fail("request_artifact_integrity");
  let decoded;
  try { decoded = decodeArcPayThreeDsAction({ providerSetupId: action.providerSetupId, responseBytes: artifact.bytes }); } catch { fail("request_envelope_invalid"); }
  if (decoded.type !== "three_ds_method" || decoded.threeDs.phase !== "method" || decoded.threeDs.threeDsServerTransactionId === null) fail("request_envelope_invalid");
  return decoded;
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
  const artifactId = `arc-saved-card-charge-method-response:${input.workItem.dispatch.providerOperationIntentId}`;
  const privateObject = await input.storage.writeImmutable({ artifactId, contentType: "application/json", bytes: input.rawResponseBytes, expectedSha256Digest: sha256Digest });
  if (privateObject.contentType !== "application/json" || privateObject.sha256Digest !== sha256Digest || privateObject.byteLength !== input.rawResponseBytes.byteLength) fail("response_artifact_integrity");
  const artifact = await input.registry.registerSealedArtifact({
    artifact: { artifactId, sha256Digest, byteLength: input.rawResponseBytes.byteLength }, artifactClass: "provider_response",
    binding: { kind: "provider", providerAccount: input.workItem.dispatch.providerAccount }, contentType: "application/json", privateObject,
    retentionPolicyId: input.retention.policyId, retentionPolicyVersion: input.retention.policyVersion
  });
  if ("bankCashPoolId" in artifact || artifact.artifactId !== artifactId || artifact.sha256Digest !== sha256Digest || artifact.byteLength !== input.rawResponseBytes.byteLength) fail("response_artifact_integrity");
  return artifact;
}

function ambiguousEvidence(workItem: ProviderOperationDispatchWorkItem, providerPaymentId: string, artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: number }>, observedAt: string): VerifiedProviderOperationEvidence {
  return Object.freeze({
    kind: "verified_provider_operation_evidence", providerAccount: workItem.dispatch.providerAccount,
    economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId, economicPaymentSessionId: requiredSession(workItem),
    sourceId: workItem.dispatch.sourceId, purpose: "platform_invoice", providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
    operationKind: "saved_card_charge_3ds_method_complete", providerOperationId: providerPaymentId,
    canonicalRequestDigest: workItem.dispatch.canonicalRequestDigest, idempotencyKey: workItem.dispatch.idempotencyKey,
    outcome: "ambiguous", providerPaymentId, amountMinor: null, currency: null, artifact, observedAt
  }) as VerifiedProviderOperationEvidence;
}

function requiredInvoiceVersion(workItem: ProviderOperationDispatchWorkItem): number {
  const value = workItem.threeDsMethodAction?.invoiceVersion;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail("request_envelope_invalid");
  return value;
}
function requiredSession(workItem: ProviderOperationDispatchWorkItem): string { if (workItem.dispatch.economicPaymentSessionId === null) fail("request_envelope_invalid"); return workItem.dispatch.economicPaymentSessionId; }
function assertResponseIdentity(value: Readonly<{ providerSetupId: string; status: string; rawResponseBytes: Uint8Array }>, providerPaymentId: string): void { const decoded = decodeExact(value.rawResponseBytes, digest(value.rawResponseBytes), "response_payload_invalid"); if (value.providerSetupId !== providerPaymentId || typeof decoded.value !== "object" || decoded.value === null || Array.isArray(decoded.value) || (decoded.value as Record<string, unknown>).payment_id !== providerPaymentId || (decoded.value as Record<string, unknown>).status !== value.status) fail("response_identity_conflict"); }
function decodeExact(bytes: Uint8Array, expectedDigest: FinanceDigest, failure: "request_envelope_invalid" | "response_payload_invalid") { try { return decodeArcPayExactJson({ rawBody: bytes, expectedDigest, maximumBytes: 2 * 1024 * 1024 }); } catch { fail(failure); } }
function normalizeRetention(value: ProviderResponseArtifactRetention): ProviderResponseArtifactRetention { if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value.policyId) || !/^[1-9][0-9]*$/.test(value.policyVersion)) fail("response_artifact_integrity"); return value; }
function digest(bytes: Uint8Array): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function fail(reason: SavedCardChargeThreeDsMethodDispatcherError["reason"]): never { throw new SavedCardChargeThreeDsMethodDispatcherError(reason); }
