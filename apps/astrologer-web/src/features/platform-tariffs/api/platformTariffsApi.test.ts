import type {
  AstrologerTariffCatalogResponse,
  AstrologerTariffEntitlementsResponse,
  CompleteTariffInvoiceThreeDsMethodResponse,
  SavedCardSetupStatusResponse,
  StartAstrologerTariffSubscriptionResponse,
  TariffInvoicePaymentStatusResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import {
  getAstrologerTariffCatalog,
  getCurrentSavedCardSetupStatus,
  getCurrentTariffInvoicePaymentStatus,
  completeTariffInvoiceThreeDsMethod,
  getAstrologerTariffEntitlements,
  startAstrologerTariffSubscription
} from "./platformTariffsApi";

const catalog = {
  tariffs: [
    {
      tariffSeriesId: "pro",
      version: 1,
      name: "Pro",
      tagline: "Для активной практики",
      monthlyPriceMinor: 199_000,
      yearlyPriceMinor: 1_910_400,
      monthlyRecurringFrequencyDays: 31,
      yearlyRecurringFrequencyDays: 365,
      clientSaleCommissionBps: 400,
      seatsLimit: 1,
      bookingsLimit: null,
      aiRequestsLimit: null,
      automationLimit: null,
      isPopular: true,
      displayOrder: 1,
      features: ["products", "analytics"],
      lifecycle: "published"
    }
  ],
  currentSubscription: null,
  recentInvoices: [],
  paymentMethod: null
} satisfies AstrologerTariffCatalogResponse;

const startResult = {
  subscription: {
    subscriptionId: "11111111-1111-4111-8111-111111111111",
    tariffSeriesId: "pro",
    tariffVersion: 1,
    billingCycle: "month",
    state: "incomplete_setup",
    commissionBpsSnapshot: 400,
    startsAt: null,
    endsAt: null
  },
  billingCycle: "month",
  nextAction: "saved_card_setup_required"
} satisfies StartAstrologerTariffSubscriptionResponse;

const invoiceStatus = {
  invoiceId: "44444444-4444-4444-8444-444444444444",
  subscriptionId: startResult.subscription.subscriptionId,
  invoiceVersion: 2,
  state: "payment_pending",
  nextAction: "provider_confirmation_pending",
  customerAction: null
} satisfies TariffInvoicePaymentStatusResponse;

const methodCompletion = {
  invoiceId: invoiceStatus.invoiceId,
  subscriptionId: invoiceStatus.subscriptionId,
  invoiceVersion: 3,
  state: "payment_pending"
} satisfies CompleteTariffInvoiceThreeDsMethodResponse;

describe("platform tariffs API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resumes a saved-card setup through the owner-scoped status route", async () => {
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
    } satisfies SavedCardSetupStatusResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(status);

    await expect(getCurrentSavedCardSetupStatus(status.subscriptionId)).resolves.toEqual(status);

    expect(get).toHaveBeenCalledWith(`/tariffs/subscriptions/${status.subscriptionId}/saved-card-setup`);
  });

  it("treats the empty successful response before setup starts as no setup", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue(undefined);

    await expect(
      getCurrentSavedCardSetupStatus(startResult.subscription.subscriptionId)
    ).resolves.toBeNull();
  });

  it("loads only the published tariff catalog through the shared contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(catalog);

    await expect(getAstrologerTariffCatalog()).resolves.toEqual(catalog);

    expect(get).toHaveBeenCalledWith("/tariffs");
  });

  it("loads capability access from the server projection instead of inferring it from the catalog", async () => {
    const entitlements = {
      products: { read: "deny", mutation: "deny" },
      funnels: { read: "deny", mutation: "deny" }
    } satisfies AstrologerTariffEntitlementsResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(entitlements);

    await expect(getAstrologerTariffEntitlements()).resolves.toEqual(entitlements);

    expect(get).toHaveBeenCalledWith("/tariffs/entitlements");
  });

  it("recovers a server-authoritative pending invoice from its subscription after refresh", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(invoiceStatus);

    await expect(
      getCurrentTariffInvoicePaymentStatus(startResult.subscription.subscriptionId)
    ).resolves.toEqual(invoiceStatus);

    expect(get).toHaveBeenCalledWith(
      `/tariffs/subscriptions/${startResult.subscription.subscriptionId}/payment-status`
    );
  });

  it("treats the empty successful response before the first invoice as no pending invoice", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue(undefined);

    await expect(
      getCurrentTariffInvoicePaymentStatus(startResult.subscription.subscriptionId)
    ).resolves.toBeNull();
  });

  it("posts a 3DS Method outcome only to the owner-scoped invoice continuation route", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(methodCompletion);
    const body = {
      expectedInvoiceVersion: invoiceStatus.invoiceVersion,
      completionIndicator: "Y" as const,
      browserInfo: {
        acceptHeader: "text/html",
        language: "ru-RU",
        screenWidth: 1440,
        screenHeight: 900,
        colorDepth: 24 as const,
        timezoneOffsetMinutes: -180,
        userAgent: "test-browser"
      }
    };

    await expect(
      completeTariffInvoiceThreeDsMethod(invoiceStatus.invoiceId, {
        body,
        idempotencyKey: "tariff-method-1"
      })
    ).resolves.toEqual(methodCompletion);

    expect(post).toHaveBeenCalledWith(
      `/tariffs/invoices/${invoiceStatus.invoiceId}/complete-3ds-method`,
      body,
      { csrf: true, headers: { "idempotency-key": "tariff-method-1" } }
    );
  });

  it("selects a tariff through the CSRF and idempotency protected subscription command", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(startResult);
    const body = { tariffSeriesId: "pro", version: 1, billingCycle: "month" } as const;

    await expect(
      startAstrologerTariffSubscription({ body, idempotencyKey: "tariff-select-1" })
    ).resolves.toEqual(startResult);

    expect(post).toHaveBeenCalledWith("/tariffs/subscriptions", body, {
      csrf: true,
      headers: { "idempotency-key": "tariff-select-1" }
    });
  });
});
