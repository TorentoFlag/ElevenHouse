import { describe, expect, it } from "vitest";
import {
  getPlatformBillingOverview,
  platformPlanSeedData,
  type PlatformBillingStore
} from "./index";

class InMemoryPlatformBillingStore implements PlatformBillingStore {
  readonly plans = [...platformPlanSeedData];
  subscription: Awaited<ReturnType<PlatformBillingStore["findCurrentSubscription"]>> = null;

  async listActivePlans() {
    return this.plans.filter((plan) => plan.isActive);
  }

  async findCurrentSubscription() {
    return this.subscription;
  }

  async findDefaultPaymentMethod() {
    return null;
  }

  async listRecentInvoices() {
    return [];
  }
}

describe("platform billing use cases", () => {
  it("builds an overview from the active plan catalog and defaults to Start without fake payment data", async () => {
    const store = new InMemoryPlatformBillingStore();

    const overview = await getPlatformBillingOverview({
      store,
      ownerUserId: "owner-1",
      providerConfigured: false
    });

    expect(overview.provider).toEqual({
      code: "arc_pay",
      status: "not_configured",
      managePaymentMethodUrl: null,
      checkoutUrl: null
    });
    expect(overview.billingCycle).toBe("month");
    expect(overview.currentPlan?.code).toBe("start");
    expect(overview.currentPlanSource).toBe("default");
    expect(overview.integrityIssues).toEqual([]);
    expect(overview.currentSubscription).toBeNull();
    expect(overview.paymentMethod).toBeNull();
    expect(overview.invoices).toEqual([]);
    expect(overview.plans.map((plan) => plan.code)).toEqual(["start", "pro", "studio"]);
    expect(overview.plans.find((plan) => plan.code === "start")).toMatchObject({
      monthlyPriceMinor: 0,
      platformFeeBps: 800,
      bookingsLimit: 30,
      features: expect.arrayContaining(["page", "calendar", "crm"])
    });
  });

  it("uses the persisted subscription cycle and selected plan when one exists", async () => {
    const store = new InMemoryPlatformBillingStore();
    store.subscription = {
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "owner-1",
      planId: "pro",
      status: "active",
      billingCycle: "year",
      currentPeriodEndsAt: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    };

    const overview = await getPlatformBillingOverview({
      store,
      ownerUserId: "owner-1",
      providerConfigured: true
    });

    expect(overview.provider.status).toBe("ready");
    expect(overview.billingCycle).toBe("year");
    expect(overview.currentPlan?.code).toBe("pro");
    expect(overview.currentPlanSource).toBe("subscription");
    expect(overview.integrityIssues).toEqual([]);
    expect(overview.currentSubscription).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      planId: "pro",
      status: "active",
      billingCycle: "year",
      currentPeriodEndsAt: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: false
    });
  });

  it("surfaces a billing integrity issue when a subscription references a missing plan", async () => {
    const store = new InMemoryPlatformBillingStore();
    store.subscription = {
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "owner-1",
      planId: "legacy-plan",
      status: "active",
      billingCycle: "month",
      currentPeriodEndsAt: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    };

    const overview = await getPlatformBillingOverview({
      store,
      ownerUserId: "owner-1",
      providerConfigured: true
    });

    expect(overview.currentPlan).toBeNull();
    expect(overview.currentPlanSource).toBe("unresolved");
    expect(overview.integrityIssues).toEqual([
      {
        code: "subscription_plan_not_found",
        severity: "error",
        planId: "legacy-plan",
        message: "Current subscription references an inactive or missing plan"
      }
    ]);
  });
});
