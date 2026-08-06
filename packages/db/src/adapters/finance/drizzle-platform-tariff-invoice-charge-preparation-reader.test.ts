/* eslint-disable @typescript-eslint/no-explicit-any -- Persistence row fixtures are intentionally untyped to cover malformed joins. */
import { describe, expect, it } from "vitest";

import { mapPlatformTariffInvoiceChargePreparationCandidate } from "./drizzle-platform-tariff-invoice-charge-preparation-reader";

describe("platform tariff invoice charge preparation reader mapping", () => {
  it("returns only a token-free, still-chargeable pending aggregate", () => {
    const candidate = mapPlatformTariffInvoiceChargePreparationCandidate(row());

    expect(candidate).toEqual(expect.objectContaining({
      preparationRequestId: "10000000-0000-4000-8000-000000000001",
      attemptNumber: 1,
      preparationRequestVersion: 1,
      recurringConsentId: "consent-1",
      recurringConsentVersion: 1,
      buyerContact: { kind: "email", value: "astro@example.test" },
      environment: "sandbox",
      savedCardCredential: {
        kind: "restricted_saved_card_credential_ref",
        schemaVersion: 1,
        credentialId: "credential-1",
        credentialVersion: 1
      }
    }));
    expect(JSON.stringify(candidate)).not.toContain("vault://");
    expect(JSON.stringify(candidate)).not.toContain("provider-customer-1");
  });

  it("fails closed when the consent is revoked after the outbox event was written", () => {
    const value = row();
    value.consentHead.currentLifecycle = "revoked";

    expect(mapPlatformTariffInvoiceChargePreparationCandidate(value)).toBeNull();
  });

  it("permits only the exact next period while renewal is past_due", () => {
    const value = row();
    value.subscription = {
      ...value.subscription,
      state: "past_due",
      startsAt: new Date("2026-07-04T12:00:00.000Z"),
      endsAt: new Date("2026-08-04T12:00:00.000Z")
    };
    value.invoice = {
      ...value.invoice,
      billingPeriodStartAt: new Date("2026-08-04T12:00:00.000Z"),
      billingPeriodEndAt: new Date("2026-09-04T12:00:00.000Z")
    };
    expect(mapPlatformTariffInvoiceChargePreparationCandidate(value)).toMatchObject({
      subscription: { state: "past_due", endsAt: "2026-08-04T12:00:00.000Z" }
    });
    value.invoice.billingPeriodStartAt = new Date("2026-08-04T12:00:01.000Z");
    expect(mapPlatformTariffInvoiceChargePreparationCandidate(value)).toBeNull();
  });
});

function row(): any {
  return {
    request: {
      id: "10000000-0000-4000-8000-000000000001", invoiceId: "platform-tariff-invoice:1", subscriptionId: "20000000-0000-4000-8000-000000000002",
      attemptNumber: 1, expectedInvoiceVersion: 1, expectedSubscriptionVersion: 1, state: "pending", version: "1", economicPaymentIntentId: null, economicPaymentSessionId: null, providerOperationIntentId: null
    },
    invoice: {
      id: "platform-tariff-invoice:1", subscriptionId: "20000000-0000-4000-8000-000000000002", ownerUserId: "30000000-0000-4000-8000-000000000003", tariffSeriesId: "pro", tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", amountMinor: 9_900, currency: "RUB", state: "open", version: 1,
      billingPeriodStartAt: new Date("2026-08-04T12:00:00.000Z"), billingPeriodEndAt: new Date("2026-09-03T12:00:00.000Z")
    },
    subscription: {
      id: "20000000-0000-4000-8000-000000000002", ownerUserId: "30000000-0000-4000-8000-000000000003", tariffSeriesId: "pro", tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", commissionBpsSnapshot: 1_000, billingCycle: "month", state: "awaiting_initial_payment", version: 1, startsAt: null, endsAt: null
    },
    credential: {
      credentialId: "credential-1", credentialVersion: "1", consentId: "consent-1", consentVersion: "1", seriesId: "arcpay-sandbox", providerAccountId: "merchant-sandbox", providerIdentityVersion: 1, providerCustomerId: "provider-customer-1", restrictedTokenHandleRef: "vault://restricted-token-1"
    },
    credentialHead: { currentLifecycle: "active", currentCredentialId: "credential-1", currentCredentialVersion: "1" },
    consent: {
      consentId: "consent-1", consentVersion: "1", subscriptionId: "20000000-0000-4000-8000-000000000002", ownerUserId: "30000000-0000-4000-8000-000000000003", tariffSeriesId: "pro", tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", seriesId: "arcpay-sandbox", providerAccountId: "merchant-sandbox", providerIdentityVersion: 1, providerCustomerId: "provider-customer-1", buyerContactKind: "email", buyerContactValue: "astro@example.test"
    },
    consentHead: { currentLifecycle: "granted" },
    providerAccount: { provider: "arc_pay", seriesId: "arcpay-sandbox", providerAccountId: "merchant-sandbox", identityVersion: 1, environment: "sandbox" }
  };
}
