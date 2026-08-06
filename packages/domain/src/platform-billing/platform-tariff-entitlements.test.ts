import { describe, expect, it, vi } from "vitest";

import {
  createPlatformTariffDraft,
  type PlatformTariffEntitlementStore,
  type PlatformTariffSubscriptionSnapshot,
  type PlatformTariffVersion
} from "./index";
import {
  resolvePlatformTariffCapabilities,
  resolvePlatformTariffCapability
} from "./platform-tariff-entitlements";

const ownerUserId = "owner-1";
const now = "2026-08-04T12:00:00.000Z";

describe("resolvePlatformTariffCapability", () => {
  it("fails closed when neither a current nor a historical exact grant exists", async () => {
    const store = entitlementStore({ subscription: null, historicalGrant: null });

    await expect(
      resolvePlatformTariffCapability({
        store,
        ownerUserId,
        capability: "funnels",
        operation: "read",
        now
      })
    ).resolves.toBe("deny");
    expect(store.findTariffVersion).not.toHaveBeenCalled();
    expect(store.findLatestHistoricalCapabilityGrant).toHaveBeenCalledWith({
      ownerUserId,
      capability: "funnels",
      at: now
    });
  });

  it("loads only the current subscription's exact tariff digest before allowing new work", async () => {
    const tariff = tariffWith("funnels");
    const subscription = activeSubscription(tariff);
    const store = entitlementStore({ subscription, tariff, historicalGrant: null });

    await expect(
      resolvePlatformTariffCapability({
        store,
        ownerUserId,
        capability: "funnels",
        operation: "generation",
        now
      })
    ).resolves.toBe("allow");
    expect(store.findTariffVersion).toHaveBeenCalledWith({
      tariffSeriesId: "pro",
      version: 1,
      canonicalDigest: tariff.canonicalDigest
    });
    expect(store.findLatestHistoricalCapabilityGrant).not.toHaveBeenCalled();
  });

  it("checks multiple capabilities against one current immutable subscription snapshot", async () => {
    const tariff = {
      ...tariffWith("funnels"),
      features: ["ai", "natal"] as const
    };
    const subscription = activeSubscription(tariff);
    const store = entitlementStore({ subscription, tariff, historicalGrant: null });

    await expect(
      resolvePlatformTariffCapabilities({
        store,
        ownerUserId,
        capabilities: ["ai", "natal"],
        operation: "generation",
        now
      })
    ).resolves.toEqual([
      { capability: "ai", decision: "allow" },
      { capability: "natal", decision: "allow" }
    ]);
    expect(store.findCurrentSubscription).toHaveBeenCalledTimes(1);
    expect(store.findTariffVersion).toHaveBeenCalledTimes(1);
    expect(store.findLatestHistoricalCapabilityGrant).not.toHaveBeenCalled();
  });

  it("returns read_only from a verified prior grant after current entitlement expires", async () => {
    const tariff = tariffWith("funnels");
    const historicalGrant = {
      subscription: expiredSubscription(tariff),
      tariff: { ...tariff, lifecycle: "retired" as const }
    };
    const store = entitlementStore({ subscription: null, historicalGrant });

    await expect(
      resolvePlatformTariffCapability({
        store,
        ownerUserId,
        capability: "funnels",
        operation: "mutation",
        now
      })
    ).resolves.toBe("read_only");
  });

  it("does not preserve any capability while a failed renewal is past_due", async () => {
    const tariff = tariffWith("funnels");
    const subscription = { ...expiredSubscription(tariff), state: "past_due" as const };
    const store = entitlementStore({ subscription: null, historicalGrant: { subscription, tariff } });
    await expect(resolvePlatformTariffCapability({
      store, ownerUserId, capability: "funnels", operation: "read", now
    })).resolves.toBe("deny");
  });

  it("rejects malformed historical evidence instead of treating any old subscription as a grant", async () => {
    const tariff = tariffWith("funnels");
    const store = entitlementStore({
      subscription: null,
      historicalGrant: {
        subscription: { ...expiredSubscription(tariff), ownerUserId: "other-owner" },
        tariff
      }
    });

    await expect(
      resolvePlatformTariffCapability({
        store,
        ownerUserId,
        capability: "funnels",
        operation: "read",
        now
      })
    ).resolves.toBe("deny");
  });
});

function tariffWith(feature: "funnels"): PlatformTariffVersion {
  return {
    ...createPlatformTariffDraft({
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
      features: [feature]
    }),
    lifecycle: "published"
  };
}

function activeSubscription(tariff: PlatformTariffVersion): PlatformTariffSubscriptionSnapshot {
  return {
    subscriptionId: "subscription-1",
    ownerUserId,
    tariffSeriesId: tariff.tariffSeriesId,
    tariffVersion: tariff.version,
    tariffVersionDigest: tariff.canonicalDigest,
    commissionBpsSnapshot: tariff.clientSaleCommissionBps,
    version: 1,
    state: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z"
  };
}

function expiredSubscription(tariff: PlatformTariffVersion): PlatformTariffSubscriptionSnapshot {
  return {
    ...activeSubscription(tariff),
    state: "expired",
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-07-01T00:00:00.000Z"
  };
}

function entitlementStore(input: Readonly<{
  subscription: PlatformTariffSubscriptionSnapshot | null;
  tariff?: PlatformTariffVersion;
  historicalGrant: Awaited<
    ReturnType<PlatformTariffEntitlementStore["findLatestHistoricalCapabilityGrant"]>
  >;
}>): PlatformTariffEntitlementStore {
  return {
    findCurrentSubscription: vi.fn(async () => input.subscription),
    findTariffVersion: vi.fn(async () => input.tariff ?? null),
    findLatestHistoricalCapabilityGrant: vi.fn(async () => input.historicalGrant)
  };
}
