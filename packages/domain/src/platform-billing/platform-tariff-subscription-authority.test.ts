import { describe, expect, it } from "vitest";

import {
  applyVerifiedTariffInvoiceCapture,
  createPlatformTariffDraft,
  PlatformTariffAuthorityError,
  preparePlatformTariffInitialInvoice,
  preparePlatformTariffSubscriptionPurchase,
  publishPlatformTariffDraft
} from "./platform-tariff-authority";

const publishedTariff = publishPlatformTariffDraft(
  createPlatformTariffDraft({
    tariffSeriesId: "start",
    version: 1,
    name: "Start",
    tagline: "Base tariff",
    monthlyPriceMinor: 2_500,
    yearlyPriceMinor: 25_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 800,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 0,
    features: []
  })
);

describe("preparePlatformTariffSubscriptionPurchase", () => {
  it("pins a paid tariff selection without creating an invoice before verified saved-card activation", () => {
    const purchase = preparePlatformTariffSubscriptionPurchase({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      tariff: publishedTariff,
      billingCycle: "month",
      now: "2026-01-31T10:00:00.000Z"
    });

    expect(purchase.subscription).toMatchObject({
      tariffSeriesId: "start",
      tariffVersion: 1,
      tariffVersionDigest: publishedTariff.canonicalDigest,
      commissionBpsSnapshot: 800,
      billingCycle: "month",
      state: "incomplete_setup",
      startsAt: null,
      endsAt: null
    });
    expect(purchase.invoice).toBeNull();
  });

  it("creates the first paid invoice only after the credential-activation authority advances setup", () => {
    const selected = preparePlatformTariffSubscriptionPurchase({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      tariff: publishedTariff,
      billingCycle: "month",
      now: "2026-01-31T10:00:00.000Z"
    });

    const prepared = preparePlatformTariffInitialInvoice({
      subscription: selected.subscription,
      tariff: publishedTariff,
      now: "2026-01-31T10:00:00.000Z"
    });

    expect(prepared.subscription).toMatchObject({ state: "awaiting_initial_payment" });
    expect(prepared.invoice).toEqual({
      amountMinor: 2_500,
      currency: "RUB",
      state: "open",
      billingPeriodStartAt: "2026-01-31T10:00:00Z",
      billingPeriodEndAt: "2026-02-28T10:00:00Z"
    });
  });

  it("activates a free tariff without creating a chargeable invoice", () => {
    const purchase = preparePlatformTariffSubscriptionPurchase({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      tariff: publishPlatformTariffDraft(
        createPlatformTariffDraft({
          ...publishedTariff,
          tariffSeriesId: "free",
          version: 1,
          monthlyPriceMinor: 0,
          yearlyPriceMinor: 0,
          monthlyRecurringFrequencyDays: null,
          yearlyRecurringFrequencyDays: null
        })
      ),
      billingCycle: "year",
      now: "2026-01-31T10:00:00.000Z"
    });

    expect(purchase.invoice).toBeNull();
    expect(purchase.subscription).toMatchObject({
      state: "active",
      startsAt: "2026-01-31T10:00:00Z",
      endsAt: "2027-01-31T10:00:00Z"
    });
  });

  it("rejects a retired tariff for a new purchase", () => {
    expect(() =>
      preparePlatformTariffSubscriptionPurchase({
        ownerUserId: "11111111-1111-4111-8111-111111111111",
        tariff: { ...publishedTariff, lifecycle: "retired" },
        billingCycle: "month",
        now: "2026-08-04T10:00:00.000Z"
      })
    ).toThrow(expect.objectContaining<Partial<PlatformTariffAuthorityError>>({
      reason: "tariff_not_purchasable"
    }));
  });

  it("activates the pending subscription only from its payment-pending invoice evidence", () => {
    const purchase = preparePlatformTariffSubscriptionPurchase({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      tariff: publishedTariff,
      billingCycle: "month",
      now: "2026-08-04T10:00:00.000Z"
    });
    const prepared = preparePlatformTariffInitialInvoice({
      subscription: purchase.subscription,
      tariff: publishedTariff,
      now: "2026-08-04T10:00:00.000Z"
    });
    if (!prepared.invoice) throw new Error("Expected post-credential invoice fixture");

    const captured = applyVerifiedTariffInvoiceCapture({
      subscription: prepared.subscription,
      invoice: invoiceAuthority(prepared, "payment_pending"),
      capturedAt: "2026-08-04T10:01:00.000Z"
    });

    expect(captured.subscription).toMatchObject({
      state: "active",
      startsAt: prepared.invoice.billingPeriodStartAt,
      endsAt: prepared.invoice.billingPeriodEndAt
    });
    expect(captured.invoice).toMatchObject({ state: "captured", capturedAt: "2026-08-04T10:01:00Z" });
  });

  it("does not let an open invoice grant an entitlement", () => {
    const purchase = preparePlatformTariffSubscriptionPurchase({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      tariff: publishedTariff,
      billingCycle: "month",
      now: "2026-08-04T10:00:00.000Z"
    });
    const prepared = preparePlatformTariffInitialInvoice({
      subscription: purchase.subscription,
      tariff: publishedTariff,
      now: "2026-08-04T10:00:00.000Z"
    });

    expect(() =>
      applyVerifiedTariffInvoiceCapture({
        subscription: prepared.subscription,
        invoice: invoiceAuthority(prepared, "open"),
        capturedAt: "2026-08-04T10:01:00.000Z"
      })
    ).toThrow(expect.objectContaining<Partial<PlatformTariffAuthorityError>>({
      reason: "invoice_capture_transition_invalid"
    }));
  });
});

function invoiceAuthority(
  purchase: ReturnType<typeof preparePlatformTariffInitialInvoice>,
  state: "open" | "payment_pending"
) {
  if (!purchase.invoice) throw new Error("Expected paid invoice fixture");
  return {
    ...purchase.invoice,
    ownerUserId: purchase.subscription.ownerUserId,
    tariffSeriesId: purchase.subscription.tariffSeriesId,
    tariffVersion: purchase.subscription.tariffVersion,
    tariffVersionDigest: purchase.subscription.tariffVersionDigest,
    state
  };
}
