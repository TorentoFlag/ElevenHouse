import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import {
  type FinancePrivateObjectStoragePort,
  type PlatformTariffInvoiceChargeCommandFactory,
  type PlatformTariffInvoiceChargePreparationReaderPort,
  type PlatformTariffInvoiceChargePreparationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import type { PlatformTariffAuthorityStore } from "@elevenhouse/domain";

import {
  createPlatformTariffInvoiceChargePreparer,
  deterministicPlatformTariffInvoiceChargeId
} from "./platform-tariff-invoice-charge-preparer";

const preparationRequestId = "10000000-0000-4000-8000-000000000001";

describe("platform tariff invoice charge preparer", () => {
  it("seals one authoritative request and sends stable operation identities into the atomic preparation UoW", async () => {
    const reader: PlatformTariffInvoiceChargePreparationReaderPort = {
      findForPreparation: vi.fn(async () => candidate())
    };
    const writeImmutable = vi.fn(async ({ bytes }: { bytes: Uint8Array }) => privateObject(bytes));
    const preparePlatformTariffInvoiceCharge = vi.fn(async () => receipt());
    const prepare = vi.fn(async () => ({
      providerAccount: {
        seriesId: "arcpay-sandbox",
        providerAccountId: "merchant-sandbox",
        identityVersion: 1
      },
      operationEnvelope: policyEnvelope(),
      dispatchEnvelope: {
        kind: "saved_card_charge" as const,
        amount: { amountMinor: 9_900, currency: "RUB" as const },
        savedCardCredential: {
          kind: "restricted_saved_card_credential_ref" as const,
          schemaVersion: 1 as const,
          credentialId: "credential-1",
          credentialVersion: 1
        },
        externalId: "platform-tariff-invoice:1",
        storedCredentialReason: "recurring" as const,
        recurringFrequencyDays: 30,
        fiscalSnapshot: fiscalSnapshot()
      }
    }));

    await createPlatformTariffInvoiceChargePreparer({
      preparations: reader,
      tariffs: { findTariffVersion: vi.fn(async () => tariff()) } as Pick<PlatformTariffAuthorityStore, "findTariffVersion">,
      commandFactory: { prepare } as unknown as PlatformTariffInvoiceChargeCommandFactory,
      preparation: { preparePlatformTariffInvoiceCharge } as PlatformTariffInvoiceChargePreparationUnitOfWork,
      privateObjectStorage: { writeImmutable } as unknown as FinancePrivateObjectStoragePort,
      requestArtifactRetention: { policyId: "finance-request", policyVersion: "1" },
      idempotencyRetentionMs: 72 * 60 * 60 * 1000,
      now: () => new Date("2026-08-04T12:00:00.000Z")
    }).prepare({ preparationRequestId });

    const prepareResult = prepare.mock.results[0];
    expect(prepareResult).toBeDefined();
    const expectedEnvelope = (await prepareResult!.value).dispatchEnvelope;
    const expectedBytes = new TextEncoder().encode(JSON.stringify(expectedEnvelope));
    expect(writeImmutable).toHaveBeenCalledWith({
      artifactId: `arc-platform-tariff-invoice-charge-request:${preparationRequestId}`,
      contentType: "application/json",
      bytes: expectedBytes,
      expectedSha256Digest: digest(expectedBytes)
    });
    expect(preparePlatformTariffInvoiceCharge).toHaveBeenCalledWith(expect.objectContaining({
      preparationRequestId,
      expectedPreparationRequestVersion: 1,
      economicPaymentIntentId: deterministicPlatformTariffInvoiceChargeId(preparationRequestId, "economic-payment-intent"),
      economicPaymentSessionId: deterministicPlatformTariffInvoiceChargeId(preparationRequestId, "economic-payment-session"),
      providerOperationIntentId: deterministicPlatformTariffInvoiceChargeId(preparationRequestId, "provider-operation-intent"),
      recurringConsentId: "consent-1",
      recurringConsentVersion: 1,
      idempotencyKey: deterministicPlatformTariffInvoiceChargeId(preparationRequestId, "provider-operation-intent"),
      idempotencyRetentionDeadline: "2026-08-07T12:00:00.000Z",
      dispatchArtifact: {
        artifactId: `arc-platform-tariff-invoice-charge-request:${preparationRequestId}`,
        sha256Digest: digest(expectedBytes),
        byteLength: expectedBytes.byteLength
      }
    }));
  });

  it("does not write or prepare when the authoritative pending request cannot be read", async () => {
    const writeImmutable = vi.fn();
    const preparePlatformTariffInvoiceCharge = vi.fn();

    await expect(createPlatformTariffInvoiceChargePreparer({
      preparations: { findForPreparation: vi.fn(async () => null) },
      tariffs: { findTariffVersion: vi.fn() } as Pick<PlatformTariffAuthorityStore, "findTariffVersion">,
      commandFactory: { prepare: vi.fn() } as PlatformTariffInvoiceChargeCommandFactory,
      preparation: { preparePlatformTariffInvoiceCharge } as PlatformTariffInvoiceChargePreparationUnitOfWork,
      privateObjectStorage: { writeImmutable } as unknown as FinancePrivateObjectStoragePort,
      requestArtifactRetention: { policyId: "finance-request", policyVersion: "1" },
      idempotencyRetentionMs: 72 * 60 * 60 * 1000,
      now: () => new Date()
    }).prepare({ preparationRequestId })).rejects.toThrow("unavailable");

    expect(writeImmutable).not.toHaveBeenCalled();
    expect(preparePlatformTariffInvoiceCharge).not.toHaveBeenCalled();
  });
});

function candidate() {
  return {
    preparationRequestId,
    attemptNumber: 1,
    preparationRequestVersion: 1,
    invoice: {
      invoiceId: "platform-tariff-invoice:1", subscriptionId: "20000000-0000-4000-8000-000000000002", ownerUserId: "30000000-0000-4000-8000-000000000003",
      tariffSeriesId: "pro", tariffVersion: 1, tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      amountMinor: 9_900, currency: "RUB" as const, state: "open" as const, version: 1,
      billingPeriodStartAt: "2026-08-04T12:00:00.000Z", billingPeriodEndAt: "2026-09-03T12:00:00.000Z"
    },
    subscription: {
      subscriptionId: "20000000-0000-4000-8000-000000000002", ownerUserId: "30000000-0000-4000-8000-000000000003", tariffSeriesId: "pro", tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const, commissionBpsSnapshot: 1_000,
      billingCycle: "month" as const, state: "awaiting_initial_payment" as const, version: 1, startsAt: null, endsAt: null
    },
    savedCardCredential: {
      kind: "restricted_saved_card_credential_ref" as const, schemaVersion: 1 as const, credentialId: "credential-1", credentialVersion: 1
    },
    recurringConsentId: "consent-1", recurringConsentVersion: 1,
    buyerContact: { kind: "email" as const, value: "astro@example.test" }
  };
}

function tariff() {
  return {
    tariffSeriesId: "pro", version: 1, draftRevision: 1, lifecycle: "published" as const, name: "Pro", tagline: "", monthlyPriceMinor: 9_900,
    yearlyPriceMinor: 99_000, monthlyRecurringFrequencyDays: 30, yearlyRecurringFrequencyDays: 365, clientSaleCommissionBps: 1_000,
    seatsLimit: null, bookingsLimit: null, aiRequestsLimit: null, automationLimit: null, isPopular: false, displayOrder: 1, features: [],
    canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
  };
}

function fiscalSnapshot() {
  return {
    schemaVersion: 1 as const, profileId: "profile-1", profileVersion: 1, profileCanonicalDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
    buyerContact: { kind: "email" as const, value: "astro@example.test" }, currency: "RUB" as const,
    lines: [{ sourceLineId: "platform-tariff-invoice:1", name: "Pro", amountMinor: 9_900, quantity: 1, tax: "none", paymentMethod: "full_payment", paymentObject: "service" }]
  };
}

function policyEnvelope() {
  return { operationKind: "platform_invoice_charge" as const, policyId: "policy", policyVersion: 1, maximumRows: 1, maximumDecimalDigits: 38, maximumArtifactBytes: 4_096, canonicalDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const };
}

function privateObject(bytes: Uint8Array) {
  return { privateObjectKey: "finance/immutable/request.json", privateObjectVersion: "v1", envelopeKeyVersion: "kms-1", sha256Digest: digest(bytes), byteLength: bytes.byteLength, contentType: "application/json" };
}

function receipt() { return { kind: "platform_tariff_invoice_charge_preparation_receipt" as const, preparationRequestId, preparationRequestVersion: 2, invoiceId: "platform-tariff-invoice:1", invoiceVersion: 2, economicPaymentIntentId: "", economicPaymentSessionId: "", providerOperationIntentId: "" }; }
function digest(bytes: Uint8Array): `sha256:${string}` { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
