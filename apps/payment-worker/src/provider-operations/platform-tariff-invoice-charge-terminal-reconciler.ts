import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  FinancePrivateObjectStoragePort,
  PlatformTariffInvoiceCanonicalCaptureUnitOfWork,
  PlatformTariffInvoiceCanonicalFailureUnitOfWork,
  PlatformTariffInvoiceCustomerActionUnitOfWork,
  PlatformTariffInvoiceChargeTerminalReconciliationCandidate,
  RawProviderArtifactRef,
  VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";
import { decodeArcPayThreeDsAction } from "@elevenhouse/finance-infrastructure";

import type { ArcPayCanonicalPaymentReader } from "../arc-pay/arc-pay-canonical-payment-reader";
import type { ProviderResponseArtifactRetention } from "./hosted-checkout-session-dispatcher";

export type PlatformTariffInvoiceChargeTerminalReconciliationResult =
  | Readonly<{ kind: "captured"; invoiceId: string }>
  | Readonly<{ kind: "awaiting_provider_terminal"; invoiceId: string }>
  | Readonly<{ kind: "requires_customer_action"; invoiceId: string }>
  | Readonly<{ kind: "declined" | "failed"; invoiceId: string }>
  | Readonly<{ kind: "requires_reversal_reconciliation"; invoiceId: string; status: "refunded" | "chargeback" }>;

export type PlatformTariffInvoiceChargeTerminalReconciler = Readonly<{
  reconcile(candidate: PlatformTariffInvoiceChargeTerminalReconciliationCandidate): Promise<PlatformTariffInvoiceChargeTerminalReconciliationResult>;
}>;

/** Canonical polling never repeats the MIT request; only a full canonical capture can activate. */
export function createPlatformTariffInvoiceChargeTerminalReconciler(input: Readonly<{
  canonicalReader: Pick<ArcPayCanonicalPaymentReader, "readPaymentOutcome">;
  privateObjectStorage: FinancePrivateObjectStoragePort;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  capture: PlatformTariffInvoiceCanonicalCaptureUnitOfWork;
  failure: PlatformTariffInvoiceCanonicalFailureUnitOfWork;
  customerAction: PlatformTariffInvoiceCustomerActionUnitOfWork;
  responseArtifactRetention: ProviderResponseArtifactRetention;
  now?: () => Date;
}>): PlatformTariffInvoiceChargeTerminalReconciler {
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async reconcile(candidate) {
      const observation = await input.canonicalReader.readPaymentOutcome({
        providerPaymentId: candidate.providerPaymentId,
        expectedExternalId: candidate.invoiceId
      });
      const payment = observation.payment;
      if (payment.status === "pending" || payment.status === "timeout") {
        return { kind: "awaiting_provider_terminal", invoiceId: candidate.invoiceId };
      }
      if (payment.status === "pending_3ds") {
        if (candidate.customerActionState === "recorded") {
          return { kind: "requires_customer_action", invoiceId: candidate.invoiceId };
        }
        const artifact = await sealCanonicalObservation({
          storage: input.privateObjectStorage,
          registry: input.artifactRegistry,
          candidate,
          rawResponseBytes: observation.rawResponseBytes,
          payment,
          retention: input.responseArtifactRetention
        });
        const action = decodeArcPayThreeDsAction({
          providerSetupId: candidate.providerPaymentId,
          responseBytes: observation.rawResponseBytes
        });
        if (
          candidate.providerOperation.operationKind === "saved_card_charge_3ds_method_complete" &&
          action.type !== "three_ds_challenge"
        ) {
          fail("canonical_response_invalid");
        }
        await input.customerAction.recordCustomerAction({
          invoiceId: candidate.invoiceId,
          expectedInvoiceVersion: candidate.expectedInvoiceVersion,
          economicPaymentIntentId: candidate.providerOperation.economicPaymentIntentId,
          expectedEconomicPaymentVersion: candidate.providerOperation.expectedEconomicPaymentVersion,
          economicPaymentSessionId: candidate.providerOperation.economicPaymentSessionId,
          providerOperationIntentId: candidate.providerOperation.providerOperationIntentId,
          expectedProviderOperationIntentVersion:
            candidate.providerOperation.expectedProviderOperationIntentVersion,
          providerPaymentId: candidate.providerPaymentId,
          providerAccount: candidate.providerOperation.providerAccount,
          providerResponseArtifact: artifact,
          actionType: action.type,
          phase: action.threeDs.phase
        });
        return { kind: "requires_customer_action", invoiceId: candidate.invoiceId };
      }
      if (payment.status === "declined" || payment.status === "failed") {
        const artifact = await sealCanonicalObservation({
          storage: input.privateObjectStorage,
          registry: input.artifactRegistry,
          candidate,
          rawResponseBytes: observation.rawResponseBytes,
          payment,
          retention: input.responseArtifactRetention
        });
        const providerResult = Object.freeze({
          economicPaymentIntentId: candidate.providerOperation.economicPaymentIntentId,
          expectedEconomicPaymentVersion: candidate.providerOperation.expectedEconomicPaymentVersion,
          providerOperationIntentId: candidate.providerOperation.providerOperationIntentId,
          expectedProviderOperationIntentVersion: candidate.providerOperation.expectedProviderOperationIntentVersion,
          evidence: verifiedFailureEvidence(candidate, artifact, payment.observedAt),
          operationEnvelope: candidate.providerOperation.operationEnvelope
        }) as unknown as Parameters<PlatformTariffInvoiceCanonicalFailureUnitOfWork["applyCanonicalFailure"]>[0]["providerResult"];
        await input.failure.applyCanonicalFailure({ providerResult, targetState: payment.status });
        return { kind: payment.status, invoiceId: candidate.invoiceId };
      }
      if (payment.status === "refunded" || payment.status === "chargeback") {
        return { kind: "requires_reversal_reconciliation", invoiceId: candidate.invoiceId, status: payment.status };
      }
      if (payment.capturedAmountMinor !== payment.amountMinor) {
        throw new PlatformTariffInvoiceChargeTerminalReconcilerError("canonical_amount_conflict");
      }
      const artifact = await sealCanonicalObservation({
        storage: input.privateObjectStorage,
        registry: input.artifactRegistry,
        candidate,
        rawResponseBytes: observation.rawResponseBytes,
        payment,
        retention: input.responseArtifactRetention
      });
      const providerResult = Object.freeze({
          economicPaymentIntentId: candidate.providerOperation.economicPaymentIntentId,
          expectedEconomicPaymentVersion: candidate.providerOperation.expectedEconomicPaymentVersion,
          providerOperationIntentId: candidate.providerOperation.providerOperationIntentId,
          expectedProviderOperationIntentVersion: candidate.providerOperation.expectedProviderOperationIntentVersion,
          evidence: verifiedCaptureEvidence(candidate, artifact, payment.amountMinor, payment.observedAt),
          operationEnvelope: candidate.providerOperation.operationEnvelope
        }) as unknown as Parameters<PlatformTariffInvoiceCanonicalCaptureUnitOfWork["applyCanonicalCapture"]>[0]["providerResult"];
      await input.capture.applyCanonicalCapture({
        providerResult,
        capturedAt: payment.observedAt,
        postedAt: instant(now())
      });
      return { kind: "captured", invoiceId: candidate.invoiceId };
    }
  });
}

export class PlatformTariffInvoiceChargeTerminalReconcilerError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CHARGE_TERMINAL_RECONCILER_ERROR" as const;
  constructor(readonly reason: "canonical_artifact_integrity" | "canonical_amount_conflict" | "canonical_response_invalid") { super("Canonical tariff charge reconciliation failed safely"); }
}

async function sealCanonicalObservation(input: Readonly<{
  storage: FinancePrivateObjectStoragePort; registry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  candidate: PlatformTariffInvoiceChargeTerminalReconciliationCandidate; rawResponseBytes: Uint8Array;
  payment: Awaited<ReturnType<ArcPayCanonicalPaymentReader["readPaymentOutcome"]>>["payment"]; retention: ProviderResponseArtifactRetention;
}>): Promise<RawProviderArtifactRef> {
  const rawResponseDigest = digest(input.rawResponseBytes);
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "arc_pay_platform_tariff_invoice_canonical_observation_v1", providerPaymentId: input.payment.providerPaymentId, externalId: input.payment.externalId, amountMinor: input.payment.amountMinor, capturedAmountMinor: input.payment.capturedAmountMinor, currency: input.payment.currency, status: input.payment.status, observedAt: input.payment.observedAt, rawResponseDigest }));
  const sha256Digest = digest(bytes);
  const artifactId = `arc-platform-tariff-invoice-canonical:${input.candidate.providerOperation.providerOperationIntentId}`;
  const privateObject = await input.storage.writeImmutable({ artifactId, contentType: "application/json", bytes, expectedSha256Digest: sha256Digest });
  if (privateObject.sha256Digest !== sha256Digest || privateObject.byteLength !== bytes.byteLength || privateObject.contentType !== "application/json") fail("canonical_artifact_integrity");
  const artifact = await input.registry.registerSealedArtifact({ artifact: { artifactId, sha256Digest, byteLength: bytes.byteLength }, artifactClass: "provider_canonical_read", binding: { kind: "provider", providerAccount: input.candidate.providerOperation.providerAccount }, contentType: "application/json", privateObject, retentionPolicyId: input.retention.policyId, retentionPolicyVersion: input.retention.policyVersion });
  if (!("artifactId" in artifact) || artifact.artifactId !== artifactId || artifact.sha256Digest !== sha256Digest || artifact.byteLength !== bytes.byteLength) fail("canonical_artifact_integrity");
  return artifact;
}

function verifiedCaptureEvidence(candidate: PlatformTariffInvoiceChargeTerminalReconciliationCandidate, artifact: RawProviderArtifactRef, amountMinor: number, observedAt: string) {
  const op = candidate.providerOperation;
  return Object.freeze({ kind: "verified_provider_operation_evidence" as const, providerAccount: op.providerAccount, economicPaymentIntentId: op.economicPaymentIntentId, economicPaymentSessionId: op.economicPaymentSessionId, sourceId: candidate.invoiceId, purpose: "platform_invoice" as const, providerOperationIntentId: op.providerOperationIntentId, operationKind: op.operationKind, providerOperationId: candidate.providerPaymentId, canonicalRequestDigest: op.canonicalRequestDigest, idempotencyKey: op.idempotencyKey, outcome: "succeeded" as const, providerPaymentId: candidate.providerPaymentId, amountMinor: String(amountMinor), currency: "RUB" as const, artifact, observedAt }) as VerifiedProviderOperationEvidence;
}
function verifiedFailureEvidence(candidate: PlatformTariffInvoiceChargeTerminalReconciliationCandidate, artifact: RawProviderArtifactRef, observedAt: string) {
  const op = candidate.providerOperation;
  return Object.freeze({ kind: "verified_provider_operation_evidence" as const, providerAccount: op.providerAccount, economicPaymentIntentId: op.economicPaymentIntentId, economicPaymentSessionId: op.economicPaymentSessionId, sourceId: candidate.invoiceId, purpose: "platform_invoice" as const, providerOperationIntentId: op.providerOperationIntentId, operationKind: op.operationKind, providerOperationId: candidate.providerPaymentId, canonicalRequestDigest: op.canonicalRequestDigest, idempotencyKey: op.idempotencyKey, outcome: "failed" as const, providerPaymentId: null, amountMinor: null, currency: null, artifact, observedAt }) as VerifiedProviderOperationEvidence;
}
function digest(bytes: Uint8Array): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function instant(value: Date): string { if (Number.isNaN(value.getTime())) fail("canonical_artifact_integrity"); return value.toISOString(); }
function fail(reason: PlatformTariffInvoiceChargeTerminalReconcilerError["reason"]): never { throw new PlatformTariffInvoiceChargeTerminalReconcilerError(reason); }
