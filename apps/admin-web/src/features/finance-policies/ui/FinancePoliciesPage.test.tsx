// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminFinancePoliciesApi } from "../api/adminFinancePoliciesApi";
import { FinancePoliciesPage } from "./FinancePoliciesPage";

describe("FinancePoliciesPage", () => {
  afterEach(() => cleanup());

  it("renders the admin finance policy controls instead of the shell placeholder", () => {
    const html = renderToStaticMarkup(<FinancePoliciesPage api={apiStub()} />);

    expect(html).toContain("Финансы");
    expect(html).toContain("Выплаты");
    expect(html).toContain("Споры");
    expect(html).toContain("Сверка");
    expect(html).toContain("Политики");
    expect(html).toContain("Finance controls");
    expect(html).not.toContain("Admin surface");
  });

  it("reloads admin queues with server-backed payout and reconciliation filters", async () => {
    const api = apiStub();

    render(<FinancePoliciesPage api={api} />);

    await waitFor(() => expect(api.listPayoutRequests).toHaveBeenCalledWith({ status: "open" }));

    fireEvent.click(screen.getByRole("button", { name: "Выплаты" }));
    await screen.findByRole("heading", { name: "Заявки на вывод" });
    fireEvent.click(screen.getByRole("button", { name: "В обработке" }));

    await waitFor(() =>
      expect(api.listPayoutRequests).toHaveBeenLastCalledWith({ status: "processing" })
    );
    expect(screen.getByRole("button", { name: "В обработке" }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Сверка" }));
    await screen.findByRole("heading", { name: "Exceptions сверки" });
    fireEvent.click(screen.getByRole("button", { name: "Settlement" }));

    await waitFor(() =>
      expect(api.listReconciliationExceptions).toHaveBeenLastCalledWith({
        evidence: "settlement"
      })
    );
    expect(screen.getByRole("button", { name: "Settlement" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
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
    listReconciliationExceptions: vi.fn(async () => ({
      summary: {
        openCount: 0,
        oldestOpenAt: null
      },
      exceptions: []
    })),
    resolveReconciliationException: vi.fn(),
    updatePayoutRequestStatus: vi.fn()
  };
}
