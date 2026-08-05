/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately malformed persistence fixtures exercise fail-closed reconciliation. */
import { describe, expect, it, vi } from "vitest";

import { createPlatformTariffInvoiceChargeTerminalReconciler } from "./platform-tariff-invoice-charge-terminal-reconciler";

const candidate: any = {
  invoiceId: "platform-tariff-invoice:1", expectedInvoiceVersion: 1, providerPaymentId: "10000000-0000-4000-8000-000000000001",
  providerOperation: { economicPaymentIntentId: "intent-1", expectedEconomicPaymentVersion: 1, providerOperationIntentId: "operation-1", expectedProviderOperationIntentVersion: 1, economicPaymentSessionId: "session-1", providerAccount: { seriesId: "arc", providerAccountId: "merchant", identityVersion: 1 }, canonicalRequestDigest: `sha256:${"a".repeat(64)}`, idempotencyKey: "operation-1", operationEnvelope: { kind: "resolved_finance_operation_envelope", policyId: "p", policyVersion: 1, policyDigest: `sha256:${"b".repeat(64)}`, maximumRows: 1, maximumDecimalDigits: 38, maximumArtifactBytes: 4096 } }
};

function dependencies(status: string) {
  const response = status === "pending_3ds"
    ? {
        status,
        next_action: {
          type: "three_ds_challenge",
          three_ds: {
            version: "2",
            phase: "challenge",
            submit: {
              method: "POST",
              url: "https://acs.example.test/challenge",
              target: "browser",
              fields: [{ name: "creq", value: "opaque" }]
            }
          }
        }
      }
    : {};
  const canonicalReader = { readPaymentOutcome: vi.fn(async () => ({ payment: { providerPaymentId: candidate.providerPaymentId, externalId: candidate.invoiceId, amountMinor: 9900, capturedAmountMinor: status === "captured" ? 9900 : 0, currency: "RUB", status, observedAt: "2026-08-04T12:00:00.000Z" }, rawResponseBytes: new TextEncoder().encode(JSON.stringify(response)) })) };
  const privateObjectStorage = { writeImmutable: vi.fn(async ({ artifactId, expectedSha256Digest, bytes }: any) => ({ privateObjectKey: artifactId, privateObjectVersion: "1", envelopeKeyVersion: "k", sha256Digest: expectedSha256Digest, byteLength: bytes.byteLength, contentType: "application/json" })) };
  const artifactRegistry = { registerSealedArtifact: vi.fn(async ({ artifact }: any) => artifact) };
  const capture = { applyCanonicalCapture: vi.fn(async () => ({ kind: "verified_capture_application_commit_receipt" })) };
  const failure = { applyCanonicalFailure: vi.fn(async () => ({ kind: "platform_tariff_invoice_canonical_failure_commit_receipt" })) };
  const customerAction = { recordCustomerAction: vi.fn(async () => ({ kind: "platform_tariff_invoice_customer_action_commit_receipt" })) };
  return { canonicalReader, privateObjectStorage, artifactRegistry, capture, failure, customerAction };
}

describe("platform tariff invoice terminal reconciler", () => {
  it("activates only from a sealed full canonical capture", async () => {
    const deps = dependencies("captured");
    const reconciler = createPlatformTariffInvoiceChargeTerminalReconciler({ ...deps as any, responseArtifactRetention: { policyId: "provider", policyVersion: "1" }, now: () => new Date("2026-08-04T12:01:00.000Z") });
    await expect(reconciler.reconcile(candidate)).resolves.toEqual({ kind: "captured", invoiceId: candidate.invoiceId });
    expect(deps.capture.applyCanonicalCapture).toHaveBeenCalledOnce();
    expect(deps.artifactRegistry.registerSealedArtifact).toHaveBeenCalledWith(expect.objectContaining({ artifactClass: "provider_canonical_read" }));
  });

  it("does not mutate a pending provider outcome or issue another charge", async () => {
    const deps = dependencies("pending");
    const reconciler = createPlatformTariffInvoiceChargeTerminalReconciler({ ...deps as any, responseArtifactRetention: { policyId: "provider", policyVersion: "1" } });
    await expect(reconciler.reconcile(candidate)).resolves.toEqual({ kind: "awaiting_provider_terminal", invoiceId: candidate.invoiceId });
    expect(deps.capture.applyCanonicalCapture).not.toHaveBeenCalled();
    expect(deps.privateObjectStorage.writeImmutable).not.toHaveBeenCalled();
  });

  it("persists a sealed canonical refusal without a capture or financial posting", async () => {
    const deps = dependencies("declined");
    const reconciler = createPlatformTariffInvoiceChargeTerminalReconciler({ ...deps as any, responseArtifactRetention: { policyId: "provider", policyVersion: "1" } });
    await expect(reconciler.reconcile(candidate)).resolves.toEqual({ kind: "declined", invoiceId: candidate.invoiceId });
    expect(deps.failure.applyCanonicalFailure).toHaveBeenCalledWith(expect.objectContaining({ targetState: "declined" }));
    expect(deps.capture.applyCanonicalCapture).not.toHaveBeenCalled();
    expect(deps.artifactRegistry.registerSealedArtifact).toHaveBeenCalledWith(expect.objectContaining({ artifactClass: "provider_canonical_read" }));
  });

  it("persists a sealed 3DS action without treating the charge as captured", async () => {
    const deps = dependencies("pending_3ds");
    const reconciler = createPlatformTariffInvoiceChargeTerminalReconciler({ ...deps as any, responseArtifactRetention: { policyId: "provider", policyVersion: "1" } });

    await expect(reconciler.reconcile(candidate)).resolves.toEqual({ kind: "requires_customer_action", invoiceId: candidate.invoiceId });

    expect(deps.customerAction.recordCustomerAction).toHaveBeenCalledOnce();
    expect(deps.customerAction.recordCustomerAction).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: candidate.invoiceId,
      expectedInvoiceVersion: 1,
      providerPaymentId: candidate.providerPaymentId,
      actionType: "three_ds_challenge",
      phase: "challenge"
    }));
    expect(deps.capture.applyCanonicalCapture).not.toHaveBeenCalled();
    expect(deps.failure.applyCanonicalFailure).not.toHaveBeenCalled();
    expect(deps.artifactRegistry.registerSealedArtifact).toHaveBeenCalledWith(expect.objectContaining({ artifactClass: "provider_canonical_read" }));
  });
});
