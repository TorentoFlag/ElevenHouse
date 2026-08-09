import { describe, expect, it } from "vitest";

import {
  adminTariffDraftRequestSchema,
  adminTariffPublishRequestSchema,
  adminTariffUpdateRequestSchema,
  astrologerTariffCatalogResponseSchema,
  astrologerTariffEntitlementsResponseSchema,
  startAstrologerTariffSubscriptionRequestSchema,
  startAstrologerTariffSubscriptionResponseSchema,
  initiateSavedCardSetupRequestSchema,
  initiateSavedCardSetupResponseSchema,
  executeSavedCardSetupRequestSchema,
  executeSavedCardSetupResponseSchema,
  completeSavedCardSetupThreeDsMethodRequestSchema,
  completeSavedCardSetupThreeDsMethodResponseSchema,
  savedCardSetupDisclosureResponseSchema,
  savedCardSetupStatusResponseSchema,
  tariffInvoicePaymentStatusResponseSchema
} from "./platform-tariffs";

const tariffTerms = {
  tariffSeriesId: "pro",
  version: 1,
  name: "Pro",
  tagline: "For active practice",
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
};

describe("admin tariff contracts", () => {
  it("accepts only editable terms when creating a draft", () => {
    expect(adminTariffDraftRequestSchema.parse(tariffTerms)).toEqual(tariffTerms);
    expect(() => adminTariffDraftRequestSchema.parse({ ...tariffTerms, canonicalDigest: "sha256:forged" })).toThrow();
  });

  it("requires optimistic revision and rejects duplicate capabilities on edits", () => {
    expect(adminTariffUpdateRequestSchema.parse({ ...tariffTerms, expectedDraftRevision: 2 })).toMatchObject({
      expectedDraftRevision: 2,
      tariffSeriesId: "pro"
    });
    expect(() => adminTariffUpdateRequestSchema.parse({ ...tariffTerms, expectedDraftRevision: 2, features: ["engine", "engine"] })).toThrow();
  });

  it("publishes only an exact draft revision", () => {
    expect(adminTariffPublishRequestSchema.parse({ expectedDraftRevision: 3 })).toEqual({ expectedDraftRevision: 3 });
    expect(() => adminTariffPublishRequestSchema.parse({ expectedDraftRevision: 0 })).toThrow();
  });
});

describe("saved-card setup contracts", () => {
  it("requires a specific disclosure digest and an affirmative consent", () => {
    const request = {
      expectedSubscriptionVersion: 1,
      disclosureVersion: 2,
      disclosureDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      noticeLocale: "ru" as const,
      acceptedDisclosure: true as const,
      buyerContact: { kind: "email" as const, value: "billing@example.com" }
    };
    expect(initiateSavedCardSetupRequestSchema.parse(request)).toEqual(request);
    expect(() => initiateSavedCardSetupRequestSchema.parse({ ...request, acceptedDisclosure: false }))
      .toThrow();
    expect(() => initiateSavedCardSetupRequestSchema.parse({
      ...request,
      buyerContact: { kind: "email", value: "not-an-email" }
    })).toThrow();
    expect(() => initiateSavedCardSetupRequestSchema.parse({
      ...request,
      buyerContact: { kind: "phone", value: "+79990000000" },
      unexpectedBuyerContact: true
    })).toThrow();
    expect(initiateSavedCardSetupResponseSchema.parse({
      setupSessionId: "11111111-1111-4111-8111-111111111111",
      setupSessionVersion: 1,
      state: "setup_requested"
    })).toMatchObject({ state: "setup_requested" });
    expect(savedCardSetupDisclosureResponseSchema.parse({
      subscriptionId: "11111111-1111-4111-8111-111111111111",
      expectedSubscriptionVersion: 1,
      disclosure: {
        disclosureSeriesId: "platform-tariff-saved-card",
        version: 2,
        locale: "ru",
        body: "Я соглашаюсь с условиями.",
        canonicalDigest: request.disclosureDigest
      }
    })).toMatchObject({ expectedSubscriptionVersion: 1 });
  });

  it("exposes a browser tokenization action only for a created provider setup", () => {
    const status = {
      setupSessionId: "11111111-1111-4111-8111-111111111111",
      subscriptionId: "22222222-2222-4222-8222-222222222222",
      setupSessionVersion: 3,
      state: "tokenization_required",
      nextAction: "tokenize_card",
      tokenization: {
        providerSetupId: "33333333-3333-4333-8333-333333333333",
        apiBaseUrl: "https://api.arcpay.space",
        publishableKey: "pk_test_example"
      },
      customerAction: null
    } as const;
    expect(savedCardSetupStatusResponseSchema.parse(status)).toEqual(status);
    expect(() => savedCardSetupStatusResponseSchema.parse({ ...status, tokenization: null })).toThrow();
  });

  it("delivers a 3DS browser handoff only as an exact customer-action state", () => {
    const status = {
      setupSessionId: "11111111-1111-4111-8111-111111111111",
      subscriptionId: "22222222-2222-4222-8222-222222222222",
      setupSessionVersion: 5,
      state: "requires_customer_action",
      nextAction: "complete_3ds",
      tokenization: null,
      customerAction: {
        type: "three_ds_method",
        threeDs: {
          version: "2",
          phase: "method",
          submit: {
            method: "POST",
            url: "https://acs.example.test/method",
            target: "hidden_iframe",
            fields: [{ name: "threeDSMethodData", value: "opaque" }]
          }
        }
      }
    } as const;
    expect(savedCardSetupStatusResponseSchema.parse(status)).toEqual(status);
    expect(() => savedCardSetupStatusResponseSchema.parse({ ...status, nextAction: "provider_confirmation_pending" })).toThrow();
  });

  it("accepts one browser tokenization result only with the setup optimistic revision", () => {
    const request = {
      expectedSetupSessionVersion: 3,
      cardTokenId: "44444444-4444-4444-8444-444444444444",
      browserInfo: {
        acceptHeader: "application/json",
        language: "ru-RU",
        screenWidth: 1440,
        screenHeight: 900,
        colorDepth: 24,
        timezoneOffsetMinutes: -180,
        userAgent: "Mozilla/5.0",
        javaEnabled: false,
        windowSize: "05"
      }
    } as const;
    expect(executeSavedCardSetupRequestSchema.parse(request)).toEqual(request);
    expect(executeSavedCardSetupResponseSchema.parse({
      setupSessionId: "11111111-1111-4111-8111-111111111111",
      setupSessionVersion: 4,
      state: "execution_pending"
    })).toMatchObject({ state: "execution_pending" });
    expect(() => executeSavedCardSetupRequestSchema.parse({ ...request, browserInfo: { ...request.browserInfo, ignored: true } })).toThrow();
  });

  it("accepts only a browser Method completion indicator and never provider-controlled 3DS values", () => {
    const request = { expectedSetupSessionVersion: 5, completionIndicator: "Y" } as const;
    expect(completeSavedCardSetupThreeDsMethodRequestSchema.parse(request)).toEqual(request);
    expect(() => completeSavedCardSetupThreeDsMethodRequestSchema.parse({
      ...request,
      threeDsServerTransactionId: "forged-server-value"
    })).toThrow();
    expect(completeSavedCardSetupThreeDsMethodResponseSchema.parse({
      setupSessionId: "11111111-1111-4111-8111-111111111111",
      setupSessionVersion: 6,
      state: "execution_pending"
    })).toMatchObject({ state: "execution_pending" });
  });
});

describe("tariff invoice payment contracts", () => {
  it("exposes a 3DS action only while the same invoice is awaiting customer action", () => {
    const status = {
      invoiceId: "11111111-1111-4111-8111-111111111111",
      subscriptionId: "22222222-2222-4222-8222-222222222222",
      invoiceVersion: 2,
      state: "requires_customer_action",
      nextAction: "complete_3ds",
      customerAction: {
        type: "three_ds_challenge",
        threeDs: {
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
    } as const;
    expect(tariffInvoicePaymentStatusResponseSchema.parse(status)).toEqual(status);
    expect(() => tariffInvoicePaymentStatusResponseSchema.parse({
      ...status,
      customerAction: null
    })).toThrow();
  });
});

describe("astrologer tariff subscription contracts", () => {
  it("accepts a published catalog and a paid selection awaiting saved-card setup", () => {
    const request = { tariffSeriesId: "pro", version: 1, billingCycle: "month" } as const;
    expect(startAstrologerTariffSubscriptionRequestSchema.parse(request)).toEqual(request);

    const response = {
      subscription: {
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        tariffSeriesId: "pro",
        tariffVersion: 1,
        state: "incomplete_setup",
        commissionBpsSnapshot: 800,
        startsAt: null,
        endsAt: null
      },
      billingCycle: "month",
      nextAction: "saved_card_setup_required"
    } as const;
    expect(startAstrologerTariffSubscriptionResponseSchema.parse(response)).toEqual(response);
    expect(
      astrologerTariffCatalogResponseSchema.parse({ tariffs: [], currentSubscription: null })
    ).toEqual({ tariffs: [], currentSubscription: null });
  });

  it("exposes product and funnel access as explicit server-authoritative projections", () => {
    const response = {
      products: {
        read: "allow",
        mutation: "allow"
      },
      funnels: {
        read: "allow",
        mutation: "read_only"
      }
    } as const;

    expect(astrologerTariffEntitlementsResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      astrologerTariffEntitlementsResponseSchema.parse({
        products: { read: "allow", mutation: "allow", inferredFromCatalog: true },
        funnels: { read: "allow", mutation: "read_only" }
      })
    ).toThrow();
  });
});
