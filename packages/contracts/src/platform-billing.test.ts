import { describe, expect, it } from "vitest";
import {
  billingOverviewResponseSchema,
  platformBillingProviderSchema,
  platformPlanFeatureCodeSchema
} from "./platform-billing";

const overview = {
  provider: {
    code: "arc_pay",
    status: "not_configured",
    managePaymentMethodUrl: null,
    checkoutUrl: null
  },
  billingCycle: "month",
  currentPlan: {
    id: "pro",
    code: "pro",
    name: "Pro",
    tagline: "Для активной практики",
    monthlyPriceMinor: 199000,
    yearlyPriceMinor: 1910000,
    currency: "RUB",
    platformFeeBps: 400,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: true,
    isActive: true,
    features: ["engine", "pdf", "natal", "products", "analytics"]
  },
  currentPlanSource: "subscription",
  integrityIssues: [],
  currentSubscription: {
    id: "11111111-1111-4111-8111-111111111111",
    planId: "pro",
    status: "active",
    billingCycle: "month",
    currentPeriodEndsAt: "2026-08-01T00:00:00.000Z",
    cancelAtPeriodEnd: false
  },
  plans: [
    {
      id: "start",
      code: "start",
      name: "Старт",
      tagline: "Чтобы начать практику",
      monthlyPriceMinor: 0,
      yearlyPriceMinor: 0,
      currency: "RUB",
      platformFeeBps: 800,
      seatsLimit: 1,
      bookingsLimit: 30,
      aiRequestsLimit: 20,
      automationLimit: 1,
      isPopular: false,
      isActive: true,
      features: ["engine", "pdf", "natal", "page"]
    },
    {
      id: "pro",
      code: "pro",
      name: "Pro",
      tagline: "Для активной практики",
      monthlyPriceMinor: 199000,
      yearlyPriceMinor: 1910000,
      currency: "RUB",
      platformFeeBps: 400,
      seatsLimit: 1,
      bookingsLimit: null,
      aiRequestsLimit: null,
      automationLimit: null,
      isPopular: true,
      isActive: true,
      features: ["engine", "pdf", "natal", "products", "analytics"]
    }
  ],
  paymentMethod: null,
  invoices: []
} as const;

describe("platform billing contracts", () => {
  it("parses a backend-backed billing overview without provider checkout data", () => {
    expect(billingOverviewResponseSchema.parse(overview)).toEqual(overview);
  });

  it("keeps provider and entitlement values explicit", () => {
    expect(platformBillingProviderSchema.parse("arc_pay")).toBe("arc_pay");
    expect(platformPlanFeatureCodeSchema.parse("products")).toBe("products");

    expect(() => platformBillingProviderSchema.parse("stripe")).toThrow();
    expect(() => platformPlanFeatureCodeSchema.parse("unknown_feature")).toThrow();
  });

  it("rejects unsafe monetary, commission and subscription states", () => {
    expect(() =>
      billingOverviewResponseSchema.parse({
        ...overview,
        plans: [{ ...overview.plans[0], monthlyPriceMinor: -1 }]
      })
    ).toThrow();

    expect(() =>
      billingOverviewResponseSchema.parse({
        ...overview,
        plans: [{ ...overview.plans[0], platformFeeBps: 10_001 }]
      })
    ).toThrow();

    expect(() =>
      billingOverviewResponseSchema.parse({
        ...overview,
        currentSubscription: {
          ...overview.currentSubscription,
          status: "paid"
        }
      })
    ).toThrow();
  });

  it("parses explicit billing integrity issues without inventing a current plan", () => {
    const parsed = billingOverviewResponseSchema.parse({
      ...overview,
      currentPlan: null,
      currentPlanSource: "unresolved",
      integrityIssues: [
        {
          code: "subscription_plan_not_found",
          severity: "error",
          planId: "legacy-plan",
          message: "Current subscription references an inactive or missing plan"
        }
      ],
      currentSubscription: {
        ...overview.currentSubscription,
        planId: "legacy-plan"
      }
    });

    expect(parsed.currentPlan).toBeNull();
    expect(parsed.currentPlanSource).toBe("unresolved");
    expect(parsed.integrityIssues[0]).toMatchObject({
      code: "subscription_plan_not_found",
      planId: "legacy-plan"
    });
  });
});
