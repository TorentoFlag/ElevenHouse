import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { platformPlanSeedData, type PlatformBillingStore } from "@elevenhouse/domain";
import { PlatformBillingService } from "./platform-billing.service";

class InMemoryPlatformBillingStore implements PlatformBillingStore {
  async listActivePlans() {
    return platformPlanSeedData;
  }

  async findCurrentSubscription() {
    return null;
  }

  async findDefaultPaymentMethod() {
    return null;
  }

  async listRecentInvoices() {
    return [];
  }
}

describe("PlatformBillingService", () => {
  it("returns a contract-shaped overview for the current astrologer account", async () => {
    const service = new PlatformBillingService(new InMemoryPlatformBillingStore(), {
      providerConfigured: false
    });

    await expect(
      service.getCurrentBillingOverview({
        currentAstrologerAccount: {
          account: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "active",
            roles: ["astrologer"]
          }
        }
      })
    ).resolves.toMatchObject({
      provider: {
        code: "arc_pay",
        status: "not_configured"
      },
      currentSubscription: null,
      paymentMethod: null,
      invoices: [],
      plans: expect.arrayContaining([
        expect.objectContaining({
          code: "start",
          monthlyPriceMinor: 0,
          platformFeeBps: 800
        })
      ])
    });
  });

  it("rejects requests without an astrologer session", async () => {
    const service = new PlatformBillingService(new InMemoryPlatformBillingStore(), {
      providerConfigured: false
    });

    await expect(service.getCurrentBillingOverview({})).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});
