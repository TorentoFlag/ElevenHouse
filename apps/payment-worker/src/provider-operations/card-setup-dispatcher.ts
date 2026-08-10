import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type FinanceDigest,
  type FinancePrivateObjectStoragePort,
  type FinanceTransientSecretVaultPort,
  type ProviderOperationDispatchWorkItem,
  type ProviderOperationResultApplicationUnitOfWork,
  type SavedCardSetupCustomerActionUnitOfWork,
  type SavedCardSetupResultUnitOfWork,
  type SavedCardSetupTerminalFailureUnitOfWork,
  type ProviderOperationTransportUnknownUnitOfWork,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";

import {
  ArcPayCardSetupClientError,
  createArcPayCardSetupClient
} from "../arc-pay/arc-pay-card-setup-client";
import { decodeArcPayExactJson } from "../arc-pay/arc-pay-exact-json";
import { decodeArcPayThreeDsAction } from "@elevenhouse/finance-infrastructure";
import type { ProviderResponseArtifactRetention } from "./hosted-checkout-session-dispatcher";
import type { ProviderOperationDispatcher } from "./provider-operation-dispatch-relay";

type ArcPayCardSetupClient = ReturnType<typeof createArcPayCardSetupClient>;

export class CardSetupDispatcherError extends Error {
  readonly code = "CARD_SETUP_DISPATCHER_ERROR" as const;

  constructor(
    readonly reason:
      | "unsupported_operation"
      | "request_artifact_integrity"
      | "request_envelope_invalid"
      | "response_artifact_integrity"
      | "response_payload_invalid"
      | "response_identity_conflict"
  ) {
    super("Card setup dispatch could not be completed safely");
  }
}

/**
 * Dispatches only ArcPay's zero-amount card-setup creation operation. This records the provider
 * setup ID and response evidence, but deliberately does not create a reusable credential or
 * activate a tariff: those require the later browser tokenization, execute, and verified result.
 */
export function createCardSetupDispatcher(
  input: Readonly<{
    privateObjectStorage: FinancePrivateObjectStoragePort;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    cardSetupClient: ArcPayCardSetupClient;
    providerResult: ProviderOperationResultApplicationUnitOfWork;
    setupResult: SavedCardSetupResultUnitOfWork;
    transportUnknown: ProviderOperationTransportUnknownUnitOfWork;
    responseArtifactRetention: ProviderResponseArtifactRetention;
  }>
): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind !== "card_setup") fail("unsupported_operation");
      const envelope = await loadCardSetupEnvelope(input.privateObjectStorage, workItem);
      let response;
      try {
        response = await input.cardSetupClient.createCardSetup({
          envelope,
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
      assertResponseIdentity(response);
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
        evidence: providerSetupEvidence(workItem, response.providerSetupId, responseArtifact),
        operationEnvelope: workItem.operationEnvelope
      });
      await input.setupResult.recordVerifiedCardSetupCreation({
        setupSessionId: workItem.dispatch.sourceId,
        providerSetupId: response.providerSetupId
      });
    }
  });
}

/**
 * Executes only an already tokenized setup. A `pending_3ds` response is deliberately persisted
 * as a customer action instead of being fed into the terminal provider-result or credential path.
 */
export function createCardSetupExecuteDispatcher(
  input: Readonly<{
    privateObjectStorage: FinancePrivateObjectStoragePort;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    transientSecretVault: FinanceTransientSecretVaultPort;
    cardSetupClient: ArcPayCardSetupClient;
    customerAction: SavedCardSetupCustomerActionUnitOfWork;
    failure: SavedCardSetupTerminalFailureUnitOfWork;
    transportUnknown: ProviderOperationTransportUnknownUnitOfWork;
    responseArtifactRetention: ProviderResponseArtifactRetention;
  }>
): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  return Object.freeze({
    async dispatch(workItem) {
      if (
        workItem.operationKind !== "card_setup_execute" ||
        workItem.transientSecret === null ||
        workItem.savedCardSetup === null
      ) {
        fail("unsupported_operation");
      }
      const envelope = await loadCardSetupExecuteEnvelope(input.privateObjectStorage, workItem);
      const tokenizationSecret = await input.transientSecretVault.consumeArcPayCardTokenizationSecret({
        secretRef: workItem.transientSecret.sealedSecretRef,
        expectedProviderSetupId: envelope.providerSetupId
      });
      let response;
      try {
        response = await input.cardSetupClient.executeCardSetup({
          envelope,
          tokenizationSecret,
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
      assertExecutionResponseIdentity(response);
      const responseArtifact = await sealResponse({
        storage: input.privateObjectStorage,
        registry: input.artifactRegistry,
        workItem,
        rawResponseBytes: response.rawResponseBytes,
        retention
      });
      if (response.status === "declined" || response.status === "failed") {
        await input.failure.applyTerminalFailure({
          providerResult: failedSetupProviderResult(workItem, response.providerSetupId, responseArtifact)
        });
        return;
      }
      if (response.status !== "pending_3ds" || response.nextAction === null) {
        // This branch remains fail-closed until the canonical-read activation UOW is composed.
        // It never records the execute response as a terminal credential fact.
        throw new CardSetupDispatcherError("response_payload_invalid");
      }
      await input.customerAction.recordCustomerAction({
        setupSessionId: workItem.dispatch.sourceId,
        expectedSetupSessionVersion: workItem.savedCardSetup.setupSessionVersion,
        economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId,
        expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
        providerOperationIntentId: workItem.dispatch.providerOperationIntentId,
        expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
        providerAccount: workItem.dispatch.providerAccount,
        providerSetupId: workItem.savedCardSetup.providerSetupId,
        actionType: response.nextAction.type,
        phase: response.nextAction.threeDs.phase,
        responseArtifact,
        observedAt: new Date().toISOString()
      });
    }
  });
}

/** Completes a browser-posted 3DS Method using only sealed provider evidence and a token-free context. */
export function createCardSetupThreeDsMethodDispatcher(
  input: Readonly<{
    privateObjectStorage: FinancePrivateObjectStoragePort;
    artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    transientSecretVault: FinanceTransientSecretVaultPort;
    cardSetupClient: ArcPayCardSetupClient;
    customerAction: SavedCardSetupCustomerActionUnitOfWork;
    failure: SavedCardSetupTerminalFailureUnitOfWork;
    transportUnknown: ProviderOperationTransportUnknownUnitOfWork;
    responseArtifactRetention: ProviderResponseArtifactRetention;
  }>
): ProviderOperationDispatcher {
  const retention = normalizeRetention(input.responseArtifactRetention);
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind !== "card_setup_3ds_method_complete" || workItem.transientSecret === null || workItem.savedCardSetup === null || !workItem.threeDsMethodAction) fail("unsupported_operation");
      const envelope = await loadCardSetupThreeDsMethodEnvelope(input.privateObjectStorage, workItem);
      const methodAction = await loadThreeDsMethodAction(input.privateObjectStorage, workItem);
      const context = await input.transientSecretVault.consumeArcPayThreeDsMethodContext({ secretRef: workItem.transientSecret.sealedSecretRef, expectedProviderSetupId: envelope.providerSetupId });
      let response;
      try {
        response = await input.cardSetupClient.completeThreeDsMethod({ providerSetupId: envelope.providerSetupId, completionIndicator: envelope.completionIndicator, threeDsServerTransactionId: methodAction.threeDs.threeDsServerTransactionId!, browserInfo: context.browserInfo, idempotencyKey: workItem.dispatch.idempotencyKey });
      } catch (error) {
        if (error instanceof ArcPayCardSetupClientError && error.reason === "transport") {
          await input.transportUnknown.markProviderOperationTransportUnknown({ economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId, expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion, providerOperationIntentId: workItem.dispatch.providerOperationIntentId, expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion });
          return;
        }
        throw error;
      }
      assertExecutionResponseIdentity(response);
      const responseArtifact = await sealResponse({ storage: input.privateObjectStorage, registry: input.artifactRegistry, workItem, rawResponseBytes: response.rawResponseBytes, retention });
      if (response.status === "declined" || response.status === "failed") {
        await input.failure.applyTerminalFailure({
          providerResult: failedSetupProviderResult(workItem, response.providerSetupId, responseArtifact)
        });
        return;
      }
      if (response.status !== "pending_3ds" || response.nextAction === null || response.nextAction.type !== "three_ds_challenge") throw new CardSetupDispatcherError("response_payload_invalid");
      await input.customerAction.recordCustomerAction({
        setupSessionId: workItem.dispatch.sourceId, expectedSetupSessionVersion: workItem.savedCardSetup.setupSessionVersion,
        economicPaymentIntentId: workItem.dispatch.economicPaymentIntentId, expectedEconomicPaymentVersion: workItem.dispatch.economicPaymentVersion,
        providerOperationIntentId: workItem.dispatch.providerOperationIntentId, expectedProviderOperationIntentVersion: workItem.dispatch.providerOperationIntentVersion,
        providerAccount: workItem.dispatch.providerAccount, providerSetupId: workItem.savedCardSetup.providerSetupId,
        actionType: "three_ds_challenge", phase: "challenge", responseArtifact, observedAt: new Date().toISOString()
      });
    }
  });
}

async function loadCardSetupEnvelope(
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
    envelope.kind !== "card_setup" ||
    envelope.step !== "create" ||
    workItem.dispatch.purpose !== "platform_card_setup" ||
    workItem.dispatch.amountMinor !== "0" ||
    workItem.dispatch.economicPaymentSessionId === null ||
    digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest ||
    envelope.setupExternalId !== workItem.dispatch.sourceId
  ) {
    fail("request_envelope_invalid");
  }
  return envelope;
}

async function loadCardSetupExecuteEnvelope(
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
    workItem.transientSecret === null ||
    envelope.kind !== "card_setup" ||
    envelope.step !== "execute" ||
    workItem.dispatch.purpose !== "platform_card_setup" ||
    workItem.dispatch.amountMinor !== "0" ||
    workItem.dispatch.economicPaymentSessionId === null ||
    digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest ||
    envelope.setupExternalId !== workItem.dispatch.sourceId ||
    envelope.providerSetupId !== workItem.transientSecret.providerSetupId ||
    envelope.tokenizationSecret.secretRef !== workItem.transientSecret.sealedSecretRef
  ) {
    fail("request_envelope_invalid");
  }
  return envelope;
}

async function loadCardSetupThreeDsMethodEnvelope(storage: FinancePrivateObjectStoragePort, workItem: ProviderOperationDispatchWorkItem) {
  const artifact = await storage.readImmutable(workItem.privateObject);
  if (artifact.contentType !== "application/json" || artifact.sha256Digest !== workItem.dispatchArtifact.sha256Digest || artifact.byteLength !== workItem.dispatchArtifact.byteLength) fail("request_artifact_integrity");
  decodeExactJson(artifact.bytes, artifact.sha256Digest, "request_envelope_invalid");
  let envelope;
  try { envelope = createProviderDispatchEnvelope(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes))); } catch { fail("request_envelope_invalid"); }
  if (workItem.transientSecret === null || !workItem.threeDsMethodAction || envelope.kind !== "card_setup" || envelope.step !== "complete_3ds_method" || workItem.dispatch.purpose !== "platform_card_setup" || workItem.dispatch.amountMinor !== "0" || workItem.dispatch.economicPaymentSessionId === null || digestFinanceCanonicalValueV1(envelope) !== workItem.dispatch.canonicalRequestDigest || envelope.setupExternalId !== workItem.dispatch.sourceId || envelope.providerSetupId !== workItem.transientSecret.providerSetupId || envelope.threeDsMethodContextSecret.secretRef !== workItem.transientSecret.sealedSecretRef || envelope.customerActionId !== workItem.threeDsMethodAction.customerActionId) fail("request_envelope_invalid");
  return envelope;
}

async function loadThreeDsMethodAction(storage: FinancePrivateObjectStoragePort, workItem: ProviderOperationDispatchWorkItem) {
  const action = workItem.threeDsMethodAction;
  if (!action) fail("request_envelope_invalid");
  const artifact = await storage.readImmutable(action.privateObject);
  if (artifact.contentType !== "application/json" || artifact.sha256Digest !== action.responseArtifact.sha256Digest || artifact.byteLength !== action.responseArtifact.byteLength) fail("request_artifact_integrity");
  let decoded;
  try { decoded = decodeArcPayThreeDsAction({ providerSetupId: action.providerSetupId, responseBytes: artifact.bytes }); } catch { fail("request_envelope_invalid"); }
  if (decoded.type !== "three_ds_method" || decoded.threeDs.phase !== "method" || decoded.threeDs.threeDsServerTransactionId === null) fail("request_envelope_invalid");
  return decoded;
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
  const artifactId = `arc-card-setup-response:${input.workItem.dispatch.providerOperationIntentId}`;
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
    artifact: { artifactId, sha256Digest: responseDigest, byteLength: input.rawResponseBytes.byteLength },
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

function providerSetupEvidence(
  workItem: ProviderOperationDispatchWorkItem,
  providerSetupId: string,
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
    operationKind: "card_setup" as const,
    providerOperationId: providerSetupId,
    canonicalRequestDigest: dispatch.canonicalRequestDigest,
    idempotencyKey: dispatch.idempotencyKey,
    outcome: "succeeded" as const,
    providerPaymentId: providerSetupId,
    amountMinor: "0",
    currency: "RUB" as const,
    artifact,
    observedAt: new Date().toISOString()
  }) as VerifiedProviderOperationEvidence;
}

function failedSetupProviderResult(
  workItem: ProviderOperationDispatchWorkItem,
  providerSetupId: string,
  artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: number }>
): Parameters<SavedCardSetupTerminalFailureUnitOfWork["applyTerminalFailure"]>[0]["providerResult"] {
  const dispatch = workItem.dispatch;
  return Object.freeze({
    economicPaymentIntentId: dispatch.economicPaymentIntentId,
    expectedEconomicPaymentVersion: dispatch.economicPaymentVersion,
    providerOperationIntentId: dispatch.providerOperationIntentId,
    expectedProviderOperationIntentVersion: dispatch.providerOperationIntentVersion,
    evidence: Object.freeze({
      kind: "verified_provider_operation_evidence" as const,
      providerAccount: dispatch.providerAccount,
      economicPaymentIntentId: dispatch.economicPaymentIntentId,
      economicPaymentSessionId: dispatch.economicPaymentSessionId,
      sourceId: dispatch.sourceId,
      purpose: dispatch.purpose,
      providerOperationIntentId: dispatch.providerOperationIntentId,
      operationKind: workItem.operationKind,
      providerOperationId: providerSetupId,
      canonicalRequestDigest: dispatch.canonicalRequestDigest,
      idempotencyKey: dispatch.idempotencyKey,
      outcome: "failed" as const,
      providerPaymentId: null,
      amountMinor: null,
      currency: null,
      artifact,
      observedAt: new Date().toISOString()
    }) as VerifiedProviderOperationEvidence & Readonly<{ outcome: "failed" }>,
    operationEnvelope: workItem.operationEnvelope
  }) as Parameters<SavedCardSetupTerminalFailureUnitOfWork["applyTerminalFailure"]>[0]["providerResult"];
}

function assertResponseIdentity(value: Readonly<{ providerSetupId: string; rawResponseBytes: Uint8Array }>) {
  const document = decodeExactJson(
    value.rawResponseBytes,
    digest(value.rawResponseBytes),
    "response_payload_invalid"
  );
  if (
    typeof document.value !== "object" ||
    document.value === null ||
    Array.isArray(document.value) ||
    (document.value as Record<string, unknown>).id !== value.providerSetupId
  ) {
    fail("response_identity_conflict");
  }
}

function assertExecutionResponseIdentity(value: Readonly<{ providerSetupId: string; rawResponseBytes: Uint8Array }>) {
  const document = decodeExactJson(
    value.rawResponseBytes,
    digest(value.rawResponseBytes),
    "response_payload_invalid"
  );
  if (
    typeof document.value !== "object" ||
    document.value === null ||
    Array.isArray(document.value) ||
    (document.value as Record<string, unknown>).payment_id !== value.providerSetupId
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

function normalizeRetention(value: ProviderResponseArtifactRetention): ProviderResponseArtifactRetention {
  if (
    typeof value.policyId !== "string" ||
    !value.policyId.trim() ||
    value.policyId.length > 160 ||
    typeof value.policyVersion !== "string" ||
    !/^[1-9][0-9]*$/.test(value.policyVersion)
  ) {
    throw new CardSetupDispatcherError("response_artifact_integrity");
  }
  return Object.freeze({ policyId: value.policyId, policyVersion: value.policyVersion });
}

function digest(value: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as FinanceDigest;
}

function fail(reason: CardSetupDispatcherError["reason"]): never {
  throw new CardSetupDispatcherError(reason);
}
