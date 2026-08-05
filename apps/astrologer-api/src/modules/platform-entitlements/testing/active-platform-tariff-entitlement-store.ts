import type {
  PlatformPlanFeatureCode,
  PlatformTariffEntitlementStore,
  PlatformTariffSubscriptionSnapshot,
  PlatformTariffVersion
} from "@elevenhouse/domain";
import { vi } from "vitest";

/**
 * Explicit in-memory port for HTTP tests that exercise a protected surface.
 * Production always receives the PostgreSQL adapter from PlatformEntitlementsModule.
 */
export function createActivePlatformTariffEntitlementStore(input: Readonly<{
  ownerUserId: string;
  features: readonly PlatformPlanFeatureCode[];
}>) {
  const tariff: PlatformTariffVersion = {
    tariffSeriesId: "test-pro",
    version: 1,
    draftRevision: 1,
    lifecycle: "published",
    name: "Test Pro",
    tagline: "",
    monthlyPriceMinor: 10_000,
    yearlyPriceMinor: 100_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 1_000,
    seatsLimit: null,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 1,
    features: [...input.features],
    canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };
  const subscription: PlatformTariffSubscriptionSnapshot = {
    subscriptionId: "4d550054-7248-4b73-895d-8a945d40bb5d",
    ownerUserId: input.ownerUserId,
    tariffSeriesId: tariff.tariffSeriesId,
    tariffVersion: tariff.version,
    tariffVersionDigest: tariff.canonicalDigest,
    commissionBpsSnapshot: tariff.clientSaleCommissionBps,
    version: 1,
    state: "active",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2027-01-01T00:00:00.000Z"
  };

  return {
    findCurrentSubscription: vi.fn<PlatformTariffEntitlementStore["findCurrentSubscription"]>(
      async () => subscription
    ),
    findTariffVersion: vi.fn<PlatformTariffEntitlementStore["findTariffVersion"]>(
      async () => tariff
    ),
    findLatestHistoricalCapabilityGrant: vi.fn<
      PlatformTariffEntitlementStore["findLatestHistoricalCapabilityGrant"]
    >(async () => null)
  } satisfies PlatformTariffEntitlementStore;
}
