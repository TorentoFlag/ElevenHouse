import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminFinancePoliciesApi } from "../api/adminFinancePoliciesApi";
import { FinancePoliciesPage } from "./FinancePoliciesPage";

describe("FinancePoliciesPage", () => {
  it("renders the admin finance policy controls instead of the shell placeholder", () => {
    const html = renderToStaticMarkup(<FinancePoliciesPage api={apiStub()} />);

    expect(html).toContain("Финансы");
    expect(html).toContain("Выплаты");
    expect(html).toContain("Споры");
    expect(html).toContain("Политики");
    expect(html).toContain("Finance controls");
    expect(html).not.toContain("Admin surface");
  });
});

function apiStub(): AdminFinancePoliciesApi {
  return {
    listPolicies: vi.fn(async () => ({ policies: [] })),
    ensureDefaultPolicy: vi.fn(),
    updateDefaultPolicy: vi.fn(),
    updateAstrologerRiskProfile: vi.fn(),
    listPayoutRequests: vi.fn(async () => ({
      summary: {
        requestedCount: 0,
        underReviewCount: 0,
        processingCount: 0,
        readyToPayAmount: { amountMinor: 0, currency: "RUB" as const },
        processingAmount: { amountMinor: 0, currency: "RUB" as const }
      },
      requests: []
    })),
    listPaymentReversalCases: vi.fn(async () => ({
      summary: {
        refundCount: 0,
        chargebackCount: 0,
        criticalCount: 0,
        totalAmount: { amountMinor: 0, currency: "RUB" as const },
        negativeBalanceAmount: { amountMinor: 0, currency: "RUB" as const }
      },
      cases: []
    })),
    updatePayoutRequestStatus: vi.fn()
  };
}
