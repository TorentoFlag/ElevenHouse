import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type {
  PlatformTariffEntitlementStore,
  PlatformTariffSubscriptionSnapshot,
  PlatformTariffVersion
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformTariffCapabilityGuard } from "./platform-tariff-capability.guard";
import type { PlatformTariffCapabilityPolicy } from "./platform-tariff-capability.policy";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const now = new Date("2026-08-04T12:00:00.000Z");

describe("PlatformTariffCapabilityGuard", () => {
  it("returns typed entitlement_required when no current or historical grant exists", async () => {
    const guard = createGuard(entitlementStore({ subscription: null }), policy("read"));

    await expect(guard.canActivate(context(authenticatedRequest()))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: "entitlement_required",
        capability: "funnels",
        operation: "read",
        access: "deny"
      })
    });
  });

  it("allows read operations from a verified historical grant", async () => {
    const tariff = tariffWithFunnels();
    const guard = createGuard(
      entitlementStore({ subscription: null, historicalGrant: historicalGrant(tariff) }),
      policy("read")
    );

    await expect(guard.canActivate(context(authenticatedRequest()))).resolves.toBe(true);
  });

  it.each(["mutation", "generation"] as const)(
    "blocks %s operations when access is read_only",
    async (operation) => {
      const tariff = tariffWithFunnels();
      const guard = createGuard(
        entitlementStore({ subscription: null, historicalGrant: historicalGrant(tariff) }),
        policy(operation)
      );

      await expect(guard.canActivate(context(authenticatedRequest()))).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          code: "entitlement_required",
          capability: "funnels",
          operation,
          access: "read_only"
        })
      });
    }
  );

  it("allows any annotated operation from the current exact tariff-version snapshot", async () => {
    const tariff = tariffWithFunnels();
    const guard = createGuard(
      entitlementStore({ subscription: activeSubscription(tariff), tariff }),
      policy("generation")
    );

    await expect(guard.canActivate(context(authenticatedRequest()))).resolves.toBe(true);
  });

  it("requires every resource-aware capability instead of granting AI from the shared capability alone", async () => {
    const tariff = { ...tariffWithFunnels(), features: ["ai"] as const };
    const guard = createGuard(entitlementStore({ subscription: activeSubscription(tariff), tariff }), {
      surfaceId: "ai.chart.draft",
      capabilities: ["ai", "natal"],
      operation: "generation"
    });

    await expect(guard.canActivate(context(authenticatedRequest()))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: "entitlement_required",
        capability: "natal",
        operation: "generation",
        access: "deny"
      })
    });
  });

  it("does not turn an entitlement policy into a substitute for authentication", async () => {
    const guard = createGuard(entitlementStore({ subscription: null }), policy("read"));

    await expect(guard.canActivate(context({ headers: {} }))).rejects.toThrow(
      UnauthorizedException
    );
  });
});

function createGuard(
  store: PlatformTariffEntitlementStore,
  entitlementPolicy: PlatformTariffCapabilityPolicy | undefined
): PlatformTariffCapabilityGuard {
  const reflector: Pick<Reflector, "getAllAndOverride"> = {
    getAllAndOverride: vi.fn(() => entitlementPolicy)
  };
  return new PlatformTariffCapabilityGuard(reflector as Reflector, store, {
    now: () => now
  } as SystemClock);
}

function policy(
  operation: PlatformTariffCapabilityPolicy["operation"]
): PlatformTariffCapabilityPolicy {
  return { surfaceId: `funnels.test.${operation}`, capability: "funnels", operation };
}

function context(request: AstrologerSessionRequest) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request })
  } as never;
}

function authenticatedRequest(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: { id: ownerUserId, status: "active", roles: ["astrologer"] }
    }
  };
}

function activeSubscription(tariff: PlatformTariffVersion): PlatformTariffSubscriptionSnapshot {
  return {
    subscriptionId: "4d550054-7248-4b73-895d-8a945d40bb5d",
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

function historicalGrant(tariff: PlatformTariffVersion) {
  return {
    subscription: {
      ...activeSubscription(tariff),
      state: "expired" as const,
      startsAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-07-01T00:00:00.000Z"
    },
    tariff: { ...tariff, lifecycle: "retired" as const }
  };
}

function tariffWithFunnels(): PlatformTariffVersion {
  return {
    tariffSeriesId: "pro",
    version: 1,
    draftRevision: 1,
    lifecycle: "published",
    name: "Pro",
    tagline: "",
    monthlyPriceMinor: 10_000,
    yearlyPriceMinor: 100_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 1000,
    seatsLimit: null,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 1,
    features: ["funnels"],
    canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };
}

function entitlementStore(input: Readonly<{
  subscription: PlatformTariffSubscriptionSnapshot | null;
  tariff?: PlatformTariffVersion;
  historicalGrant?: Awaited<
    ReturnType<PlatformTariffEntitlementStore["findLatestHistoricalCapabilityGrant"]>
  >;
}>): PlatformTariffEntitlementStore {
  return {
    findCurrentSubscription: vi.fn(async () => input.subscription),
    findTariffVersion: vi.fn(async () => input.tariff ?? null),
    findLatestHistoricalCapabilityGrant: vi.fn(async () => input.historicalGrant ?? null)
  };
}
