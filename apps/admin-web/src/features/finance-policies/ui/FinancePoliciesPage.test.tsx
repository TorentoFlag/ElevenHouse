// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminPaymentReversalCase } from "@elevenhouse/contracts/payments";
import type {
  AdminPayoutQueueResponse,
  AdminPayoutRequestResponse
} from "@elevenhouse/contracts/payouts";
import {
  AdminFinancePoliciesApiError,
  type AdminFinancePoliciesApi
} from "../api/adminFinancePoliciesApi";
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

  it("submits dispute review actions through the admin-api and refreshes the queue", async () => {
    const api = apiStub();
    vi.mocked(api.listPaymentReversalCases).mockResolvedValue({
      summary: {
        refundCount: 0,
        chargebackCount: 1,
        criticalCount: 1,
        totalAmount: { amountMinor: 50_000, currency: "RUB" as const },
        negativeBalanceAmount: { amountMinor: 45_000, currency: "RUB" as const }
      },
      cases: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "chargeback",
          severity: "critical",
          provider: "arc_pay",
          environment: "sandbox",
          providerWebhookId: "wh_chargeback_1",
          providerPaymentId: "arc-payment-1",
          providerRefundId: null,
          paymentAttemptId: "22222222-2222-4222-8222-222222222222",
          orderId: "33333333-3333-4333-8333-333333333333",
          clientUserId: "44444444-4444-4444-8444-444444444444",
          astrologerUserId: "55555555-5555-4555-8555-555555555555",
          orderStatus: "chargeback",
          paymentAttemptStatus: "chargeback",
          amount: { amountMinor: 50_000, currency: "RUB" as const },
          refundStatus: null,
          ledgerOperationType: "chargeback_recorded",
          ledgerTransactionId: "66666666-6666-4666-8666-666666666666",
          review: null,
          walletBalance: {
            astrologerUserId: "55555555-5555-4555-8555-555555555555",
            pending: { amountMinor: 0, currency: "RUB" as const },
            available: { amountMinor: 0, currency: "RUB" as const },
            reserved: { amountMinor: 0, currency: "RUB" as const },
            payoutPending: { amountMinor: 0, currency: "RUB" as const },
            negativeBalance: { amountMinor: 45_000, currency: "RUB" as const },
            updatedAt: "2026-07-24T10:02:00.000Z"
          },
          occurredAt: "2026-07-24T10:00:00.000Z",
          receivedAt: "2026-07-24T10:01:00.000Z"
        }
      ]
    });

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Споры" }));
    await screen.findByText("Provider chargeback");
    fireEvent.change(screen.getByLabelText("Решение оператора"), {
      target: { value: "provider_follow_up_required" }
    });
    fireEvent.change(screen.getByLabelText("Комментарий оператора"), {
      target: { value: "Chargeback evidence requested from Arc Pay support" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать review" }));

    await waitFor(() =>
      expect(api.reviewPaymentReversalCase).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        {
          resolution: "provider_follow_up_required",
          adminNote: "Chargeback evidence requested from Arc Pay support"
        }
      )
    );
    expect(api.listPaymentReversalCases).toHaveBeenCalledTimes(2);
  });

  it("shows chargeback-blocked payout requests as terminal evidence without manual pay action", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue({
      summary: {
        requestedCount: 0,
        underReviewCount: 0,
        processingCount: 0,
        chargebackBlockedCount: 1,
        readyToPayAmount: { amountMinor: 0, currency: "RUB" as const },
        processingAmount: { amountMinor: 0, currency: "RUB" as const },
        chargebackBlockedAmount: { amountMinor: 45_000, currency: "RUB" as const }
      },
      requests: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          astrologerUserId: "55555555-5555-4555-8555-555555555555",
          status: "cancelled",
          amount: { amountMinor: 45_000, currency: "RUB" as const },
          method: "manual_bank_transfer",
          requestedAt: "2026-07-24T10:00:00.000Z",
          reviewedAt: "2026-07-24T10:01:00.000Z",
          completedAt: "2026-07-24T10:02:00.000Z",
          adminUserId: null,
          adminNote:
            "Blocked automatically by provider chargeback wh_chargeback_1 for order 33333333-3333-4333-8333-333333333333",
          failureReason: "Provider chargeback blocked payout before paid confirmation",
          externalReference: null,
          transferredAt: null,
          providerPayoutId: null,
          blockedByChargeback: true
        }
      ]
    });

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрытые" }));

    expect(await screen.findAllByText("Chargeback blocked")).toHaveLength(2);
    expect(screen.getAllByText(/450/)).toHaveLength(3);
    expect(
      screen.getByText("Provider chargeback blocked payout before paid confirmation")
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Отметить оплаченной" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(api.updatePayoutRequestStatus).not.toHaveBeenCalled();
  });

  it("shows an actionable CSRF/session error for protected finance mutations", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.updatePayoutRequestStatus).mockRejectedValue(
      new AdminFinancePoliciesApiError(403, {
        message: "CSRF token is missing or invalid"
      })
    );

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("External reference"), {
      target: { value: "bank-transfer-1001" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("CSRF");
    expect(alert.textContent).toContain("Обновите страницу");
  });

  it("shows payout evidence guidance when a finance mutation is rejected as invalid", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.updatePayoutRequestStatus).mockRejectedValue(
      new AdminFinancePoliciesApiError(400, {
        message: "payout_status_evidence_invalid"
      })
    );

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("External reference"), {
      target: { value: "bank-transfer-1001" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("проверьте подтверждение выплаты");
    expect(alert.textContent).toContain("External reference");
  });

  it("shows stale-state guidance when a payout mutation conflicts with backend state", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.updatePayoutRequestStatus).mockRejectedValue(
      new AdminFinancePoliciesApiError(409, {
        message: "payout_status_transition_invalid"
      })
    );

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("External reference"), {
      target: { value: "bank-transfer-1001" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Состояние уже изменилось");
    expect(alert.textContent).toContain("Обновите очередь");
  });
});

function payoutQueue(requests: AdminPayoutRequestResponse[]): AdminPayoutQueueResponse {
  return {
    summary: {
      requestedCount: 0,
      underReviewCount: 0,
      processingCount: requests.length,
      chargebackBlockedCount: 0,
      readyToPayAmount: { amountMinor: 0, currency: "RUB" as const },
      processingAmount: {
        amountMinor: requests.reduce((sum, request) => sum + request.amount.amountMinor, 0),
        currency: "RUB" as const
      },
      chargebackBlockedAmount: { amountMinor: 0, currency: "RUB" as const }
    },
    requests
  };
}

function payoutRequest(
  overrides: Partial<AdminPayoutRequestResponse> = {}
): AdminPayoutRequestResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    astrologerUserId: "55555555-5555-4555-8555-555555555555",
    status: "processing_manual",
    amount: { amountMinor: 45_000, currency: "RUB" },
    method: "manual_bank_transfer",
    requestedAt: "2026-07-24T10:00:00.000Z",
    reviewedAt: "2026-07-24T10:01:00.000Z",
    completedAt: null,
    adminUserId: null,
    adminNote: null,
    failureReason: null,
    externalReference: null,
    transferredAt: null,
    providerPayoutId: null,
    blockedByChargeback: false,
    ...overrides
  };
}

function apiStub(): AdminFinancePoliciesApi {
  const reviewedReversalCase: AdminPaymentReversalCase = {
    id: "11111111-1111-4111-8111-111111111111",
    type: "chargeback",
    severity: "critical",
    provider: "arc_pay",
    environment: "sandbox",
    providerWebhookId: "wh_chargeback_1",
    providerPaymentId: "arc-payment-1",
    providerRefundId: null,
    paymentAttemptId: "22222222-2222-4222-8222-222222222222",
    orderId: "33333333-3333-4333-8333-333333333333",
    clientUserId: "44444444-4444-4444-8444-444444444444",
    astrologerUserId: "55555555-5555-4555-8555-555555555555",
    orderStatus: "chargeback",
    paymentAttemptStatus: "chargeback",
    amount: { amountMinor: 50_000, currency: "RUB" },
    refundStatus: null,
    ledgerOperationType: "chargeback_recorded",
    ledgerTransactionId: "66666666-6666-4666-8666-666666666666",
    review: {
      resolution: "provider_follow_up_required",
      adminNote: "Chargeback evidence requested from Arc Pay support",
      reviewedByUserId: "77777777-7777-4777-8777-777777777777",
      reviewedAt: "2026-07-24T10:03:00.000Z"
    },
    walletBalance: null,
    occurredAt: "2026-07-24T10:00:00.000Z",
    receivedAt: "2026-07-24T10:01:00.000Z"
  };
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
        chargebackBlockedCount: 0,
        readyToPayAmount: { amountMinor: 0, currency: "RUB" as const },
        processingAmount: { amountMinor: 0, currency: "RUB" as const },
        chargebackBlockedAmount: { amountMinor: 0, currency: "RUB" as const }
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
    reviewPaymentReversalCase: vi.fn(async () => reviewedReversalCase),
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
