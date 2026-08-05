import { NotFoundException } from "@nestjs/common";
import {
  createPlatformTariffDraft,
  type AvailabilityStore,
  type ClientAstrologerRelationshipReader,
  type FinancePolicyStore,
  type PlatformTariffEntitlementStore,
  type PlatformTariffSubscriptionSnapshot,
  type Product,
  type ProductStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { ClientCommerceService } from "./client-commerce.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-05T10:00:00.000Z");
const tariff = {
  ...createPlatformTariffDraft({
    tariffSeriesId: "pro", version: 1, name: "Pro", tagline: "For active practice",
    monthlyPriceMinor: 2_500, yearlyPriceMinor: 25_000, clientSaleCommissionBps: 800,
    monthlyRecurringFrequencyDays: 30, yearlyRecurringFrequencyDays: 365,
    seatsLimit: 1, bookingsLimit: null, aiRequestsLimit: null, automationLimit: null,
    isPopular: false, displayOrder: 0, features: ["products"]
  }),
  lifecycle: "published" as const
};

describe("ClientCommerceService", () => {
  it("returns only active supported one-time products after proving the relationship", async () => {
    const service = createService({ products: [asyncProduct(), subscriptionProduct(), freeProduct()] });

    await expect(service.listPurchaseOptions(clientUserId, astrologerUserId)).resolves.toEqual({
      astrologerUserId,
      products: [
        expect.objectContaining({
          id: asyncProduct().id,
          paymentModel: "once",
          executionMode: "async"
        })
      ]
    });
  });

  it("does not read products before an active direct relationship is proven", async () => {
    const productStore = { listByOwner: vi.fn() } satisfies Pick<ProductStore, "listByOwner">;
    const service = createService({ relationship: false, productStore });

    await expect(service.listPurchaseOptions(clientUserId, astrologerUserId)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(productStore.listByOwner).not.toHaveBeenCalled();
  });

  it("does not expose products when sale authority is absent", async () => {
    const service = createService({ subscription: null, products: [asyncProduct()] });
    await expect(service.listPurchaseOptions(clientUserId, astrologerUserId)).resolves.toEqual({
      astrologerUserId,
      products: []
    });
  });
});

function createService(options: {
  readonly relationship?: boolean;
  readonly products?: readonly Product[];
  readonly subscription?: PlatformTariffSubscriptionSnapshot | null;
  readonly productStore?: Pick<ProductStore, "listByOwner">;
} = {}) {
  const relationshipReader: ClientAstrologerRelationshipReader = {
    hasActiveRelationship: vi.fn(async () => options.relationship ?? true)
  };
  const subscription: PlatformTariffSubscriptionSnapshot | null = Object.hasOwn(
    options,
    "subscription"
  )
    ? (options.subscription ?? null)
    : activeSubscription();
  const tariffAuthority = {
    findCurrentSubscription: vi.fn(async () => subscription),
    findTariffVersion: vi.fn(async () => tariff),
    findLatestHistoricalCapabilityGrant: vi.fn(async () => null)
  } satisfies PlatformTariffEntitlementStore;
  const productStore = options.productStore ?? {
    listByOwner: vi.fn(async () => ({
      products: options.products ?? [asyncProduct()],
      total: (options.products ?? [asyncProduct()]).length,
      counts: { all: 1, active: 1, draft: 0, archived: 0 }
    }))
  } satisfies Pick<ProductStore, "listByOwner">;
  return new ClientCommerceService(
    relationshipReader,
    productStore as Pick<ProductStore, "listByOwner" | "findByOwnerAndId">,
    tariffAuthority,
    {
      findEffectivePolicyForAstrologer: vi.fn(async () => ({
        policyId: "77777777-7777-4777-8777-777777777777",
        policyVersion: 1,
        riskTier: "standard" as const,
        baseRiskTier: "standard" as const,
        profile: null,
        holdDurationHours: 48,
        reserveBps: 0,
        reserveReleaseDelayDays: 0,
        providerSettlementRequired: true
      }))
    } satisfies Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">,
    {} as AvailabilityStore,
    { now: () => now }
  );
}

function activeSubscription(): PlatformTariffSubscriptionSnapshot {
  return {
    subscriptionId: "33333333-3333-4333-8333-333333333333",
    ownerUserId: astrologerUserId,
    tariffSeriesId: tariff.tariffSeriesId,
    tariffVersion: tariff.version,
    tariffVersionDigest: tariff.canonicalDigest,
    commissionBpsSnapshot: tariff.clientSaleCommissionBps,
    version: 1,
    state: "active" as const,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z"
  };
}

function asyncProduct(): Product {
  return product({ id: "44444444-4444-4444-8444-444444444444", type: "async", executionMode: "async", paymentModel: "once", durationMinutes: null });
}

function subscriptionProduct(): Product {
  return product({ id: "55555555-5555-4555-8555-555555555555", type: "sub", executionMode: "async", paymentModel: "sub", durationMinutes: null });
}

function freeProduct(): Product {
  return product({ id: "66666666-6666-4666-8666-666666666666", type: "async", executionMode: "async", paymentModel: "free", durationMinutes: null, priceMinor: 0 });
}

function product(input: Pick<Product, "id" | "type" | "executionMode" | "paymentModel" | "durationMinutes"> & { readonly priceMinor?: number }): Product {
  return {
    ...input,
    ownerUserId: astrologerUserId, status: "active", title: "Natal reading", subtitle: null,
    priceMinor: input.priceMinor ?? 500_00, currency: "RUB", coverMediaId: null, introVideoUrl: null,
    durationLabel: null, slaLabel: null, packageSessionCount: null, packageDiscountPercent: null,
    subscriptionPeriod: null, trialDays: null, participantMode: "solo", groupSize: null,
    deliveryFormats: ["text"], requiredClientData: [], methods: [], accessGrants: [], includedItems: [], modifiers: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString()
  };
}
