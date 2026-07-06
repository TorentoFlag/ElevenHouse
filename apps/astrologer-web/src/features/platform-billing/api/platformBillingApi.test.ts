import type { BillingOverviewResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { getCurrentBillingOverview } from "./getCurrentBillingOverview";

const overview = {
  provider: {
    code: "arc_pay",
    status: "not_configured",
    managePaymentMethodUrl: null,
    checkoutUrl: null
  },
  billingCycle: "month",
  currentPlan: {
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
  currentPlanSource: "default",
  integrityIssues: [],
  currentSubscription: null,
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
    }
  ],
  paymentMethod: null,
  invoices: []
} satisfies BillingOverviewResponse;

describe("platform billing API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the current billing overview through the shared response contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(overview);

    await expect(getCurrentBillingOverview()).resolves.toEqual(overview);

    expect(get).toHaveBeenCalledWith("/platform-billing/me");
  });

  it("rejects malformed billing API responses", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({
      ...overview,
      plans: [{ ...overview.plans[0], monthlyPriceMinor: -1 }]
    });

    await expect(getCurrentBillingOverview()).rejects.toThrow();
  });
});
