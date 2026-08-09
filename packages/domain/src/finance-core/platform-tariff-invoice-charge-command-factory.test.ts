import { describe, expect, it, vi } from "vitest";

import {
  createFiscalProfile,
  createFinanceOperationResourcePolicyDraft,
  createPlatformTariffInvoiceChargeCommandFactory,
  publishFinanceOperationResourcePolicyDraft,
} from "./index";
import type {
  PlatformTariffInvoiceRecord,
  PlatformTariffSubscriptionRecord
} from "../platform-billing/platform-tariff-authority-store";
import type { PlatformTariffVersion } from "../platform-billing/platform-tariff-authority";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("platform tariff invoice saved-card charge command factory", () => {
  it("derives a recurring ArcPay charge only from the exact invoice, tariff, verified buyer and active provider facts", async () => {
    const factory = createPlatformTariffInvoiceChargeCommandFactory(dependencies());

    const result = await factory.prepare({
      invoice: invoice(),
      subscription: subscription(),
      tariff: tariff(),
      savedCardCredential: {
        kind: "restricted_saved_card_credential_ref",
        schemaVersion: 1,
        credentialId: "credential-1",
        credentialVersion: 1
      },
      buyerContact: { kind: "email", value: "astro@example.test" }
    });

    expect(result).toMatchObject({
      providerAccount: { seriesId: "arc-sandbox", providerAccountId: "merchant-sandbox", identityVersion: 1 },
      operationEnvelope: { policyId: "platform-invoice-charge" },
      dispatchEnvelope: {
        kind: "saved_card_charge",
        externalId: "platform-tariff-invoice:1",
        storedCredentialReason: "recurring",
        recurringFrequencyDays: 31,
        amount: { amountMinor: 199_000, currency: "RUB" },
        fiscalSnapshot: { transactionCategory: "platform_subscription", buyerContact: { kind: "email", value: "astro@example.test" } }
      }
    });
  });

  it("fails closed rather than choosing a tariff cadence or buyer contact", async () => {
    await expect(createPlatformTariffInvoiceChargeCommandFactory(dependencies({ contact: null })).prepare(input()))
      .rejects.toMatchObject({ reason: "buyer_contact_unverified" });

    await expect(createPlatformTariffInvoiceChargeCommandFactory(dependencies()).prepare({
      ...input(), tariff: { ...tariff(), monthlyRecurringFrequencyDays: null }
    })).rejects.toMatchObject({ reason: "tariff_schedule_unavailable" });

    await expect(createPlatformTariffInvoiceChargeCommandFactory(dependencies()).prepare({
      ...input(), invoice: { ...invoice(), version: 0 }
    })).rejects.toMatchObject({ reason: "invoice_not_chargeable" });
  });
});

function input() {
  return {
    invoice: invoice(), subscription: subscription(), tariff: tariff(),
    savedCardCredential: { kind: "restricted_saved_card_credential_ref" as const, schemaVersion: 1 as const, credentialId: "credential-1", credentialVersion: 1 },
    buyerContact: { kind: "email" as const, value: "astro@example.test" }
  };
}

function invoice(): PlatformTariffInvoiceRecord {
  return { invoiceId: "platform-tariff-invoice:1", subscriptionId: subscription().subscriptionId, ownerUserId: subscription().ownerUserId, tariffSeriesId: "pro", tariffVersion: 1, tariffVersionDigest: digest, amountMinor: 199_000, currency: "RUB", state: "open", version: 1, billingPeriodStartAt: "2026-08-04T10:00:00.000Z", billingPeriodEndAt: "2026-09-04T10:00:00.000Z" };
}

function subscription(): PlatformTariffSubscriptionRecord {
  return { subscriptionId: "11111111-1111-4111-8111-111111111111", ownerUserId: "22222222-2222-4222-8222-222222222222", tariffSeriesId: "pro", tariffVersion: 1, tariffVersionDigest: digest, commissionBpsSnapshot: 800, version: 2, billingCycle: "month", state: "awaiting_initial_payment", startsAt: null, endsAt: null };
}

function tariff(): PlatformTariffVersion {
  return { tariffSeriesId: "pro", version: 1, draftRevision: 1, lifecycle: "published", name: "ElevenHouse Pro", tagline: "For active practice", monthlyPriceMinor: 199_000, yearlyPriceMinor: 1_910_400, monthlyRecurringFrequencyDays: 31, yearlyRecurringFrequencyDays: 365, clientSaleCommissionBps: 800, seatsLimit: 1, bookingsLimit: null, aiRequestsLimit: null, automationLimit: null, isPopular: false, displayOrder: 1, features: [], canonicalDigest: digest };
}

function dependencies(options: { contact?: { kind: "email"; value: string } | null } = {}) {
  const fiscalProfile = createFiscalProfile({
    profileSeriesId: "platform-subscription", version: 1, transactionCategory: "platform_subscription", currency: "RUB", fiscalizationProvider: "arc_pay_embedded", merchantTaxId: "7701234567", buyerContactRequirement: "email_or_phone",
    lineTemplate: { vatRate: "no_vat", paymentObject: "service", paymentMethod: "full_payment", measure: "piece", itemCode: "platform-plan" }
  });
  const policy = publishFinanceOperationResourcePolicyDraft(createFinanceOperationResourcePolicyDraft({ policyId: "platform-invoice-charge", version: 1, operationKind: "platform_invoice_charge", maximumRows: 100, maximumDecimalDigits: 38, maximumArtifactBytes: 2_097_152 }));
  return {
    providerAccounts: { findActiveProviderAccount: vi.fn(async () => ({ seriesId: "arc-sandbox", providerAccountId: "merchant-sandbox", identityVersion: 1 })) },
    fiscalProfiles: { findPublishedProfile: vi.fn(async () => fiscalProfile) },
    buyerContacts: { findVerifiedFiscalBuyerContact: vi.fn(async () => options.contact === undefined ? { kind: "email" as const, value: "astro@example.test" } : options.contact) },
    operationPolicies: { findPublishedForOperation: vi.fn(async () => policy) }
  };
}
