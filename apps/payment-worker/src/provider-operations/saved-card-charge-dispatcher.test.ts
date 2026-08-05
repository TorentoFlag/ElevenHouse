/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately incomplete dispatch fixtures isolate provider boundary behavior. */
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createFiscalChargeSnapshot,
  createFiscalProfile,
  digestFinanceCanonicalValueV1,
  type
  FinancePrivateObjectStoragePort,
  FinanceRestrictedProviderCredentialVaultPort,
  ProviderOperationResultApplicationUnitOfWork,
  ProviderOperationTransportUnknownUnitOfWork
} from "@elevenhouse/domain/finance-core";

import { createArcPaySavedCardChargeClient } from "../arc-pay/arc-pay-saved-card-charge-client";
import { ArcPaySavedCardChargeClientError } from "../arc-pay/arc-pay-saved-card-charge-client";
import { createSavedCardChargeDispatcher } from "./saved-card-charge-dispatcher";

describe("saved-card charge dispatcher", () => {
  it("records every definitive POST response as ambiguous evidence and never treats it as a capture", async () => {
    const rawResponseBytes = new TextEncoder().encode(JSON.stringify({ payment_id: "10000000-0000-4000-8000-000000000008", status: "captured" }));
    const readImmutable = vi.fn(async () => ({ bytes: requestBytes(), sha256Digest: digest(requestBytes()), byteLength: requestBytes().byteLength, contentType: "application/json" }));
    const writeImmutable = vi.fn(async ({ bytes }: { bytes: Uint8Array }) => ({ privateObjectKey: "finance/response", privateObjectVersion: "v1", envelopeKeyVersion: "kms-1", sha256Digest: digest(bytes), byteLength: bytes.byteLength, contentType: "application/json" }));
    const registerSealedArtifact = vi.fn(async ({ artifact }: any) => artifact);
    const applyVerifiedProviderResult = vi.fn(async () => ({ kind: "provider_operation_result_commit_receipt" }));
    const resolveArcPaySavedCardCredential = vi.fn(async () => ({ kind: "arc_pay_restricted_saved_card_credential" as const, credentialId: "credential-1", providerCustomerId: "customer-1", cardTokenId: "10000000-0000-4000-8000-000000000007" }));
    const chargeSavedCard = vi.fn(async () => ({ providerPaymentId: "10000000-0000-4000-8000-000000000008", status: "captured" as const, rawResponseBytes }));

    await createSavedCardChargeDispatcher({
      privateObjectStorage: { readImmutable, writeImmutable } as unknown as FinancePrivateObjectStoragePort,
      artifactRegistry: { registerSealedArtifact } as unknown as Pick<FinanceArtifactRegistry, "registerSealedArtifact">,
      credentialVault: { resolveArcPaySavedCardCredential } as unknown as FinanceRestrictedProviderCredentialVaultPort,
      savedCardClient: { chargeSavedCard } as ReturnType<typeof createArcPaySavedCardChargeClient>,
      providerResult: { applyVerifiedProviderResult } as unknown as ProviderOperationResultApplicationUnitOfWork,
      transportUnknown: { markProviderOperationTransportUnknown: vi.fn() } as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "response", policyVersion: "1" },
      now: () => new Date("2026-08-04T12:00:00.000Z")
    }).dispatch(workItem());

    expect(resolveArcPaySavedCardCredential).toHaveBeenCalledWith({ restrictedTokenHandleRef: "vault://credential-1", expectedCredentialId: "credential-1", expectedProviderCustomerId: "customer-1" });
    expect(chargeSavedCard).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "10000000-0000-4000-8000-000000000004" }));
    expect(applyVerifiedProviderResult).toHaveBeenCalledWith(expect.objectContaining({
      expectedEconomicPaymentVersion: 1,
      expectedProviderOperationIntentVersion: 0,
      evidence: expect.objectContaining({ outcome: "ambiguous", providerPaymentId: "10000000-0000-4000-8000-000000000008", amountMinor: null, currency: null, observedAt: "2026-08-04T12:00:00.000Z" })
    }));
  });

  it("does not retry an uncertain transport in-process and persists provider_unknown instead", async () => {
    const markProviderOperationTransportUnknown = vi.fn(async () => undefined);
    const applyVerifiedProviderResult = vi.fn();
    await createSavedCardChargeDispatcher({
      privateObjectStorage: { readImmutable: vi.fn(async () => ({ bytes: requestBytes(), sha256Digest: digest(requestBytes()), byteLength: requestBytes().byteLength, contentType: "application/json" })) } as unknown as FinancePrivateObjectStoragePort,
      artifactRegistry: { registerSealedArtifact: vi.fn() } as unknown as Pick<FinanceArtifactRegistry, "registerSealedArtifact">,
      credentialVault: { resolveArcPaySavedCardCredential: vi.fn(async () => ({ kind: "arc_pay_restricted_saved_card_credential", credentialId: "credential-1", providerCustomerId: "customer-1", cardTokenId: "10000000-0000-4000-8000-000000000007" })) } as unknown as FinanceRestrictedProviderCredentialVaultPort,
      savedCardClient: { chargeSavedCard: vi.fn(async () => { throw new ArcPaySavedCardChargeClientError("transport"); }) } as unknown as ReturnType<typeof createArcPaySavedCardChargeClient>,
      providerResult: { applyVerifiedProviderResult } as unknown as ProviderOperationResultApplicationUnitOfWork,
      transportUnknown: { markProviderOperationTransportUnknown } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "response", policyVersion: "1" }
    }).dispatch(workItem());

    expect(markProviderOperationTransportUnknown).toHaveBeenCalledWith({ economicPaymentIntentId: "10000000-0000-4000-8000-000000000006", expectedEconomicPaymentVersion: 1, providerOperationIntentId: "10000000-0000-4000-8000-000000000004", expectedProviderOperationIntentVersion: 0 });
    expect(applyVerifiedProviderResult).not.toHaveBeenCalled();
  });

  it("retains an ArcPay 3DS next action as ambiguous evidence for the durable action flow", async () => {
    const rawResponseBytes = new TextEncoder().encode(JSON.stringify({ payment_id: "10000000-0000-4000-8000-000000000008", status: "pending_3ds", next_action: { type: "three_ds_challenge" } }));
    const applyVerifiedProviderResult = vi.fn(async () => ({ kind: "provider_operation_result_commit_receipt" }));
    await createSavedCardChargeDispatcher({
      privateObjectStorage: { readImmutable: vi.fn(async () => ({ bytes: requestBytes(), sha256Digest: digest(requestBytes()), byteLength: requestBytes().byteLength, contentType: "application/json" })), writeImmutable: vi.fn(async ({ bytes }: { bytes: Uint8Array }) => ({ privateObjectKey: "finance/response", privateObjectVersion: "v1", envelopeKeyVersion: "kms-1", sha256Digest: digest(bytes), byteLength: bytes.byteLength, contentType: "application/json" })) } as unknown as FinancePrivateObjectStoragePort,
      artifactRegistry: { registerSealedArtifact: vi.fn(async ({ artifact }) => artifact) } as unknown as Pick<FinanceArtifactRegistry, "registerSealedArtifact">,
      credentialVault: { resolveArcPaySavedCardCredential: vi.fn(async () => ({ kind: "arc_pay_restricted_saved_card_credential", credentialId: "credential-1", providerCustomerId: "customer-1", cardTokenId: "10000000-0000-4000-8000-000000000007" })) } as unknown as FinanceRestrictedProviderCredentialVaultPort,
      savedCardClient: { chargeSavedCard: vi.fn(async () => ({ providerPaymentId: "10000000-0000-4000-8000-000000000008", status: "pending_3ds", rawResponseBytes })) } as unknown as ReturnType<typeof createArcPaySavedCardChargeClient>,
      providerResult: { applyVerifiedProviderResult } as unknown as ProviderOperationResultApplicationUnitOfWork,
      transportUnknown: { markProviderOperationTransportUnknown: vi.fn() } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "response", policyVersion: "1" }
    }).dispatch(workItem());

    expect(applyVerifiedProviderResult).toHaveBeenCalledWith(expect.objectContaining({ evidence: expect.objectContaining({ outcome: "ambiguous", providerPaymentId: "10000000-0000-4000-8000-000000000008" }) }));
  });
});

function workItem(): any {
  return {
    status: "pending_dispatch", operationKind: "saved_card_charge",
    dispatch: { providerOperationIntentId: "10000000-0000-4000-8000-000000000004", providerOperationIntentVersion: 0, economicPaymentIntentId: "10000000-0000-4000-8000-000000000006", economicPaymentVersion: 1, economicPaymentSessionId: "10000000-0000-4000-8000-000000000005", sourceId: "platform-tariff-invoice:1", purpose: "platform_invoice", amountMinor: "9900", currency: "RUB", providerAccount: { seriesId: "arc-series", providerAccountId: "arc-account", identityVersion: 1 }, canonicalRequestDigest: digestFinanceCanonicalValueV1(envelope()), idempotencyKey: "10000000-0000-4000-8000-000000000004" },
    operationEnvelope: { kind: "resolved_finance_operation_envelope", policyId: "platform-invoice", policyVersion: 1, policyDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", maximumRows: 1, maximumDecimalDigits: 38, maximumArtifactBytes: 4096 },
    dispatchArtifact: { artifactId: "request-1", sha256Digest: digest(requestBytes()), byteLength: requestBytes().byteLength },
    privateObject: { privateObjectKey: "finance/request", privateObjectVersion: "v1", envelopeKeyVersion: "kms-1" }, artifactAccessAuditEventId: "audit-1", transientSecret: null, savedCardSetup: null,
    savedCardCredential: { credentialId: "credential-1", credentialVersion: 1, providerCustomerId: "customer-1", restrictedTokenHandleRef: "vault://credential-1" }
  };
}

function requestBytes() { return new TextEncoder().encode(JSON.stringify(envelope())); }
function envelope() { return { kind: "saved_card_charge" as const, amount: { amountMinor: 9900, currency: "RUB" as const }, savedCardCredential: { kind: "restricted_saved_card_credential_ref" as const, schemaVersion: 1 as const, credentialId: "credential-1", credentialVersion: 1 }, externalId: "platform-tariff-invoice:1", storedCredentialReason: "recurring" as const, recurringFrequencyDays: 30, fiscalSnapshot: createFiscalChargeSnapshot({ profile: createFiscalProfile({ profileSeriesId: "platform", version: 1, transactionCategory: "platform_subscription", currency: "RUB", fiscalizationProvider: "arc_pay_embedded", merchantTaxId: "7701234567", buyerContactRequirement: "email_or_phone", lineTemplate: { vatRate: "no_vat", paymentObject: "service", paymentMethod: "full_payment", measure: "piece", itemCode: "plan" } }), buyerContact: { kind: "email", value: "astro@example.test" }, lines: [{ sourceLineId: "platform-tariff-invoice:1", name: "Pro", amountMinor: 9900 }] }) }; }
function digest(bytes: Uint8Array): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
