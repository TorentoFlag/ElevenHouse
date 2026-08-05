import { describe, expect, it } from "vitest";

import {
  createPlatformTariffDraft,
  publishPlatformTariffDraft
} from "./platform-tariff-authority";
import { resolveActiveTariffCommission } from "./platform-tariff-commission-resolver";

const tariff = publishPlatformTariffDraft(createPlatformTariffDraft({
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
}));

describe("resolveActiveTariffCommission", () => {
  it("returns the exact active tariff snapshot as the only client-sale commission authority", async () => {
    await expect(resolveActiveTariffCommission({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      now: "2026-08-04T12:00:00.000Z",
      store: {
        findCurrentSubscription: async () => ({
          subscriptionId: "22222222-2222-4222-8222-222222222222",
          ownerUserId: "11111111-1111-4111-8111-111111111111",
          tariffSeriesId: tariff.tariffSeriesId,
          tariffVersion: tariff.version,
          tariffVersionDigest: tariff.canonicalDigest,
          commissionBpsSnapshot: 800,
          version: 1,
          state: "active",
          startsAt: "2026-08-01T00:00:00.000Z",
          endsAt: "2026-09-01T00:00:00.000Z"
        }),
        findTariffVersion: async () => tariff
      }
    })).resolves.toEqual({
      subscriptionId: "22222222-2222-4222-8222-222222222222",
      tariffSeriesId: "pro",
      tariffVersion: 1,
      tariffVersionDigest: tariff.canonicalDigest,
      commissionBps: 800
    });
  });

  it("fails closed for an expired, mismatched, or unpublished tariff snapshot", async () => {
    const base = {
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      now: "2026-08-04T12:00:00.000Z",
      store: {
        findCurrentSubscription: async () => ({
          subscriptionId: "22222222-2222-4222-8222-222222222222",
          ownerUserId: "11111111-1111-4111-8111-111111111111",
          tariffSeriesId: tariff.tariffSeriesId,
          tariffVersion: tariff.version,
          tariffVersionDigest: tariff.canonicalDigest,
          commissionBpsSnapshot: 800,
          version: 1,
          state: "active" as const,
          startsAt: "2026-07-01T00:00:00.000Z",
          endsAt: "2026-08-01T00:00:00.000Z"
        }),
        findTariffVersion: async () => tariff
      }
    };
    await expect(resolveActiveTariffCommission(base)).resolves.toBeNull();
    await expect(resolveActiveTariffCommission({
      ...base,
      store: {
        ...base.store,
        findCurrentSubscription: async () => ({
          ...(await base.store.findCurrentSubscription()),
          startsAt: "2026-08-01T00:00:00.000Z",
          endsAt: "2026-09-01T00:00:00.000Z",
          commissionBpsSnapshot: 801
        })
      }
    })).resolves.toBeNull();
  });
});
