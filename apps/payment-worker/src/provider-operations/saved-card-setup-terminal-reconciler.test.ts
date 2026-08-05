/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately partial receipt fixtures isolate terminal reconciliation behavior. */
import { describe, expect, it, vi } from "vitest";
import type { SavedCardSetupTerminalReconciliationCandidate } from "@elevenhouse/domain/finance-core";

import { createSavedCardSetupTerminalReconciler } from "./saved-card-setup-terminal-reconciler";

const setupSessionId = "10000000-0000-4000-8000-000000000001";
const providerSetupId = "20000000-0000-4000-8000-000000000002";
const operationId = "30000000-0000-4000-8000-000000000003";
const paymentArtifact = new TextEncoder().encode(JSON.stringify({ id: providerSetupId }));
const cardsArtifact = new TextEncoder().encode(JSON.stringify({ cards: [] }));

function candidate(overrides: Record<string, unknown> = {}): SavedCardSetupTerminalReconciliationCandidate {
  return {
    state: "awaiting_provider_terminal" as const,
    setupSessionId,
    setupSessionVersion: 8,
    subscriptionId: "40000000-0000-4000-8000-000000000004",
    expectedSubscriptionVersion: 3,
    providerSetupId,
    providerCustomerId: "customer-live-1",
    providerOperation: {
      economicPaymentIntentId: "economic:setup:1",
      expectedEconomicPaymentVersion: 2,
      providerOperationIntentId: operationId,
      expectedProviderOperationIntentVersion: 5,
      operationKind: "card_setup_3ds_method_complete" as const,
      providerAccount: {
        seriesId: "arc-pay:live",
        providerAccountId: "merchant-1",
        identityVersion: 1,
        provider: "arc_pay" as const,
        merchantTenantId: "merchant-1",
        environment: "live" as const,
        terminalScope: "company",
        settlementScope: "company"
      },
      economicPaymentSessionId: "economic-session:setup:1",
      sourceId: setupSessionId,
      purpose: "platform_card_setup" as const,
      canonicalRequestDigest: `sha256:${"a".repeat(64)}`,
      idempotencyKey: "saved-card-setup-method:1",
      operationEnvelope: {
        kind: "resolved_finance_operation_envelope" as const,
        policyId: "provider-read-policy",
        policyVersion: 1,
        policyDigest: `sha256:${"b".repeat(64)}`,
        maximumRows: 10,
        maximumDecimalDigits: 38,
        maximumArtifactBytes: 2_000_000
      }
    },
    ...overrides
  } as unknown as SavedCardSetupTerminalReconciliationCandidate;
}

function dependencies() {
  const canonicalReader = {
    readActivatedSavedCardSetup: vi.fn(async () => ({
      setup: {
        providerSetupId,
        externalId: setupSessionId,
        cardTokenId: "50000000-0000-4000-8000-000000000005",
        displayBrand: "mir",
        displayLast4: "4242",
        displayMask: "************4242",
        expiryMonth: 12,
        expiryYear: 2030,
        observedAt: "2026-08-04T10:00:00.000Z"
      },
      rawPaymentResponseBytes: paymentArtifact,
      rawSavedCardsResponseBytes: cardsArtifact
    }))
  };
  const privateObjectStorage = {
    writeImmutable: vi.fn(async ({ artifactId, bytes, expectedSha256Digest }: any) => ({
      privateObjectKey: `sealed/${artifactId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1",
      sha256Digest: expectedSha256Digest,
      byteLength: bytes.byteLength,
      contentType: "application/json"
    }))
  };
  const artifactRegistry = {
    registerSealedArtifact: vi.fn(async ({ artifact }: any) => artifact)
  };
  const providerResult = {
    applyVerifiedProviderResult: vi.fn(async (command: any) => ({
      kind: "provider_operation_result_commit_receipt",
      providerOperationResultId: "60000000-0000-4000-8000-000000000006",
      providerOperationIntentId: command.providerOperationIntentId,
      providerOperationIntentVersion: command.expectedProviderOperationIntentVersion + 1,
      providerOperationId: providerSetupId,
      operationKind: command.evidence.operationKind,
      economicPaymentIntentId: command.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: command.expectedEconomicPaymentVersion,
      economicPaymentSessionId: command.evidence.economicPaymentSessionId,
      sourceId: setupSessionId,
      purpose: "platform_card_setup",
      providerAccount: command.evidence.providerAccount,
      outcome: "succeeded",
      providerPaymentId: providerSetupId,
      amountMinor: "0",
      currency: "RUB",
      evidenceArtifactId: command.evidence.artifact.artifactId,
      evidenceArtifactDigest: command.evidence.artifact.sha256Digest,
      canonicalRequestDigest: command.evidence.canonicalRequestDigest,
      observedAt: command.evidence.observedAt,
      persistenceTransactionBoundaryRef: "tx",
      committedAt: command.evidence.observedAt
    }))
  };
  const credentialVault = {
    sealArcPaySavedCardCredential: vi.fn(async () => ({
      kind: "sealed_restricted_provider_credential" as const,
      restrictedTokenHandleRef: "kms://s3/credential-token",
      providerCredentialFingerprint: `sha256:${"c".repeat(64)}`
    }))
  };
  const credentialActivation = {
    activateSavedCardCredential: vi.fn(async () => ({
      kind: "saved_card_credential_activation_receipt" as const,
      setupSessionId,
      setupSessionVersion: 9,
      savedCardCredentialId: `saved-card-credential:${setupSessionId}`,
      savedCardCredentialVersion: "1",
      activatedAt: "2026-08-04T10:00:00.000Z"
    }))
  };
  const tariffActivation = {
    createInitialInvoiceAfterVerifiedCredentialActivation: vi.fn(async () => ({
      kind: "platform_tariff_initial_invoice_activation_receipt" as const,
      subscriptionId: "40000000-0000-4000-8000-000000000004",
      subscriptionVersion: 4,
      invoiceId: "platform-tariff-invoice:1",
      invoiceState: "open" as const
    }))
  };
  return {
    canonicalReader: canonicalReader as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["canonicalReader"],
    privateObjectStorage: privateObjectStorage as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["privateObjectStorage"],
    artifactRegistry: artifactRegistry as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["artifactRegistry"],
    providerResult: providerResult as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["providerResult"],
    credentialVault: credentialVault as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["credentialVault"],
    credentialActivation: credentialActivation as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["credentialActivation"],
    tariffActivation: tariffActivation as unknown as Parameters<typeof createSavedCardSetupTerminalReconciler>[0]["tariffActivation"]
  };
}

describe("saved-card setup terminal reconciler", () => {
  it("uses canonical ArcPay evidence to activate the credential and open the first invoice", async () => {
    const deps = dependencies();
    const reconciler = createSavedCardSetupTerminalReconciler({
      ...deps,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" },
      now: () => new Date("2026-08-04T10:00:01.000Z")
    });

    const result = await reconciler.reconcile(candidate());

    expect(result).toEqual({ kind: "activated_and_invoice_opened", setupSessionId, invoiceId: "platform-tariff-invoice:1" });
    expect(deps.canonicalReader.readActivatedSavedCardSetup).toHaveBeenCalledWith({ providerSetupId, expectedExternalId: setupSessionId, providerCustomerId: "customer-live-1" });
    expect(deps.providerResult.applyVerifiedProviderResult).toHaveBeenCalledOnce();
    expect(deps.credentialVault.sealArcPaySavedCardCredential).toHaveBeenCalledWith({ credentialId: `saved-card-credential:${setupSessionId}`, providerCustomerId: "customer-live-1", cardTokenId: "50000000-0000-4000-8000-000000000005" });
    expect(deps.credentialActivation.activateSavedCardCredential).toHaveBeenCalledWith(expect.objectContaining({ setupSessionId, expectedSetupSessionVersion: 8, credential: expect.objectContaining({ credentialId: `saved-card-credential:${setupSessionId}` }) }));
    expect(deps.tariffActivation.createInitialInvoiceAfterVerifiedCredentialActivation).toHaveBeenCalledWith({ subscriptionId: "40000000-0000-4000-8000-000000000004", expectedSubscriptionVersion: 3, savedCardCredentialId: `saved-card-credential:${setupSessionId}`, savedCardCredentialVersion: "1", now: "2026-08-04T10:00:01.000Z" });
  });

  it("retries the invoice stage after credential activation without calling ArcPay again", async () => {
    const deps = dependencies();
    const reconciler = createSavedCardSetupTerminalReconciler({
      ...deps,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" },
      now: () => new Date("2026-08-04T10:00:01.000Z")
    });

    const result = await reconciler.reconcile(candidate({ state: "credential_active", savedCardCredentialId: `saved-card-credential:${setupSessionId}`, savedCardCredentialVersion: "1" }));

    expect(result).toEqual({ kind: "invoice_opened_after_replay", setupSessionId, invoiceId: "platform-tariff-invoice:1" });
    expect(deps.canonicalReader.readActivatedSavedCardSetup).not.toHaveBeenCalled();
    expect(deps.providerResult.applyVerifiedProviderResult).not.toHaveBeenCalled();
    expect(deps.credentialActivation.activateSavedCardCredential).not.toHaveBeenCalled();
    expect(deps.tariffActivation.createInitialInvoiceAfterVerifiedCredentialActivation).toHaveBeenCalledOnce();
  });
});
