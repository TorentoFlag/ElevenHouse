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
import type { AdminFinanceAuthorizationClient } from "../../finance-authorizations/api/adminFinanceAuthorizationsApi";
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

  it("keeps tariff administration discoverable from the finance workspace", () => {
    render(<FinancePoliciesPage api={apiStub()} />);

    expect(screen.getByRole("link", { name: "Тарифы" }).getAttribute("href")).toBe(
      "?section=tariffs"
    );
  });

  it("reloads admin queues with server-backed payout and reconciliation filters", async () => {
    const api = apiStub();

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationStub()} />);

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

    fireEvent.click(screen.getByRole("button", { name: /^Сверка/ }));
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

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationStub()} />);

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
          version: 1,
          blockedByChargeback: true
        }
      ]
    });

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationStub()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрытые" }));

    expect(await screen.findAllByText("Chargeback blocked")).toHaveLength(2);
    expect(screen.getAllByText(/450/)).toHaveLength(3);
    expect(
      screen.getAllByText("Provider chargeback blocked payout before paid confirmation").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      (screen.getByRole("button", { name: "Отметить оплаченной" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(api.updatePayoutRequestStatus).not.toHaveBeenCalled();
  });

  it("lets operators move a new payout through review, approval and manual processing before paid", async () => {
    const api = apiStub();
    const authorizationClient = authorizationStub();
    vi.mocked(api.listPayoutRequests)
      .mockResolvedValueOnce(payoutQueue([payoutRequest({ status: "requested", version: 1 })]))
      .mockResolvedValueOnce(payoutQueue([payoutRequest({ status: "under_review", version: 2 })]))
      .mockResolvedValueOnce(payoutQueue([payoutRequest({ status: "approved", version: 3 })]))
      .mockResolvedValue(payoutQueue([payoutRequest({ status: "processing_manual", version: 4 })]));

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationClient} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));

    fireEvent.click(screen.getByRole("button", { name: "Взять в проверку" }));
    await waitFor(() =>
      expect(api.updatePayoutRequestStatus).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        {
          status: "under_review",
          expectedVersion: 1,
          adminNote: null
        }
      )
    );

    fireEvent.click(await screen.findByRole("button", { name: "Одобрить" }));
    await waitFor(() =>
      expect(api.approveOnlinePayout).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        {
          authorizationId: "22222222-2222-4222-8222-222222222222"
        }
      )
    );

    fireEvent.click(await screen.findByRole("button", { name: "Передать в банк" }));
    await waitFor(() =>
      expect(api.startOnlinePayoutManualExecution).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        {
          authorizationId: "33333333-3333-4333-8333-333333333333"
        }
      )
    );

    fireEvent.change(screen.getByLabelText("Банковский reference"), {
      target: { value: "bank-transfer-1001" }
    });
    await uploadPaidPayoutEvidence(api);
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    await waitFor(() =>
      expect(api.confirmOnlinePayoutPaid).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        {
          authorizationId: "44444444-4444-4444-8444-444444444444",
          bankReference: "bank-transfer-1001",
          transferredAt: expect.any(String),
          evidenceArtifactId: "bank-transfer-proof:11111111-1111-4111-8111-111111111111"
        }
      )
    );
    expect(api.beginOnlinePayoutApprovalAuthorization).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(api.beginOnlinePayoutManualExecutionAuthorization).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(api.beginOnlinePayoutPaidAuthorization).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        bankReference: "bank-transfer-1001",
        evidenceArtifactId: "bank-transfer-proof:11111111-1111-4111-8111-111111111111"
      })
    );
    expect(authorizationClient.complete).toHaveBeenCalledTimes(3);
    expect(authorizationClient.authorize).not.toHaveBeenCalled();
  });

  it("does not offer a bank handoff before a second administrator has approved the payout", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(
      payoutQueue([payoutRequest({ status: "requested", version: 1 })])
    );

    render(<FinancePoliciesPage api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));

    expect(screen.getByRole("button", { name: "Взять в проверку" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Передать в банк" })).toBeNull();
  });

  it("shows an actionable CSRF/session error for protected finance mutations", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.confirmOnlinePayoutPaid).mockRejectedValue(
      new AdminFinancePoliciesApiError(403, {
        message: "CSRF token is missing or invalid"
      })
    );

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationStub()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("Банковский reference"), {
      target: { value: "bank-transfer-1001" }
    });
    await uploadPaidPayoutEvidence(api);
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("CSRF");
    expect(alert.textContent).toContain("Обновите страницу");
  });

  it("shows payout evidence guidance when a finance mutation is rejected as invalid", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.confirmOnlinePayoutPaid).mockRejectedValue(
      new AdminFinancePoliciesApiError(400, {
        message: "payout_status_evidence_invalid"
      })
    );

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationStub()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("Банковский reference"), {
      target: { value: "bank-transfer-1001" }
    });
    await uploadPaidPayoutEvidence(api);
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("проверьте подтверждение выплаты");
    expect(alert.textContent).toContain("банковский reference");
  });

  it("shows stale-state guidance when a payout mutation conflicts with backend state", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.confirmOnlinePayoutPaid).mockRejectedValue(
      new AdminFinancePoliciesApiError(409, {
        message: "payout_status_transition_invalid"
      })
    );

    render(<FinancePoliciesPage api={api} authorizationClient={authorizationStub()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("Банковский reference"), {
      target: { value: "bank-transfer-1001" }
    });
    await uploadPaidPayoutEvidence(api);
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Состояние уже изменилось");
    expect(alert.textContent).toContain("Обновите очередь");
  });

  it("lets operators refresh the finance queue directly from a mutation error", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.confirmOnlinePayoutPaid).mockRejectedValue(
      new AdminFinancePoliciesApiError(409, {
        message: "payout_status_transition_invalid"
      })
    );

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    fireEvent.change(screen.getByLabelText("Банковский reference"), {
      target: { value: "bank-transfer-1001" }
    });
    await uploadPaidPayoutEvidence(api);
    fireEvent.click(screen.getByRole("button", { name: "Отметить оплаченной" }));

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Обновить очередь" }));

    await waitFor(() => expect(api.listPayoutRequests).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows payout and reconciliation operation context for audit and idempotency checks", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(payoutQueue([payoutRequest()]));
    vi.mocked(api.listReconciliationExceptions).mockResolvedValue({
      summary: {
        openCount: 1,
        oldestOpenAt: "2026-07-24T10:01:00.000Z"
      },
      exceptions: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          provider: "arc_pay",
          environment: "sandbox",
          providerPaymentId: "provider-payment-1",
          providerPayoutId: null,
          providerSettlementId: "settlement-1",
          providerEventId: "33333333-3333-4333-8333-333333333333",
          status: "exception",
          exceptionCode: "amount_mismatch",
          exceptionMessage: "Provider settlement amount differs from ledger",
          providerOccurredAt: "2026-07-24T10:00:00.000Z",
          checkedAt: "2026-07-24T10:01:00.000Z",
          resolvedAt: null,
          payload: { source: "settlement.report" }
        }
      ]
    });

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));
    expect(await screen.findByText("Операционный контекст")).toBeTruthy();
    expect(screen.getByText("Terminal payout command")).toBeTruthy();
    expect(screen.getByText("Admin audit event")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Сверка/ }));
    expect(await screen.findByText("Evidence context")).toBeTruthy();
    expect(screen.getByText("Hold release gate")).toBeTruthy();
    expect(screen.getByText("Admin resolution audit")).toBeTruthy();
  });

  it("shows payout detail evidence for bank reference, audit actor and terminal timestamps", async () => {
    const api = apiStub();
    vi.mocked(api.listPayoutRequests).mockResolvedValue(
      payoutQueue([
        payoutRequest({
          status: "paid",
          reviewedAt: "2026-07-24T10:01:00.000Z",
          completedAt: "2026-07-24T10:04:00.000Z",
          adminUserId: "77777777-7777-4777-8777-777777777777",
          adminNote: "Paid from bank cabinet after ledger check",
          externalReference: "bank-transfer-777",
          transferredAt: "2026-07-24T10:03:00.000Z"
        })
      ])
    );

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Выплаты" }));

    expect(await screen.findByText("Payout detail")).toBeTruthy();
    expect(screen.getAllByText("Банковский reference").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("bank-transfer-777")).toBeTruthy();
    expect(screen.getByText("Admin actor")).toBeTruthy();
    expect(screen.getByText("77777777...7777")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Paid from bank cabinet after ledger check")).toBeTruthy();
  });

  it("shows dispute detail evidence for payment, parties, wallet impact and existing review", async () => {
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
          review: {
            resolution: "provider_follow_up_required",
            adminNote: "Evidence sent to bank dispute portal",
            reviewedByUserId: "77777777-7777-4777-8777-777777777777",
            reviewedAt: "2026-07-24T10:03:00.000Z"
          },
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

    expect(await screen.findByText("Dispute detail")).toBeTruthy();
    expect(screen.getByText("Payment attempt")).toBeTruthy();
    expect(screen.getByText("22222222...2222")).toBeTruthy();
    expect(screen.getByText("Client")).toBeTruthy();
    expect(screen.getAllByText("44444444...4444").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Wallet shortfall")).toBeTruthy();
    expect(screen.getAllByText(/450/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Existing review")).toBeTruthy();
    expect(screen.getByText("Evidence sent to bank dispute portal")).toBeTruthy();
  });

  it("shows reconciliation detail evidence for provider ids, timeline and payload", async () => {
    const api = apiStub();
    vi.mocked(api.listReconciliationExceptions).mockResolvedValue({
      summary: {
        openCount: 1,
        oldestOpenAt: "2026-07-24T10:01:00.000Z"
      },
      exceptions: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          provider: "arc_pay",
          environment: "sandbox",
          providerPaymentId: "provider-payment-1",
          providerPayoutId: "provider-payout-1",
          providerSettlementId: "settlement-1",
          providerEventId: "33333333-3333-4333-8333-333333333333",
          status: "exception",
          exceptionCode: "amount_mismatch",
          exceptionMessage: "Provider settlement amount differs from ledger",
          providerOccurredAt: "2026-07-24T10:00:00.000Z",
          checkedAt: "2026-07-24T10:01:00.000Z",
          resolvedAt: null,
          payload: { source: "settlement.report", settlementAmountMinor: 490_000 }
        }
      ]
    });

    render(<FinancePoliciesPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: /^Сверка/ }));

    expect(await screen.findByText("Reconciliation detail")).toBeTruthy();
    expect(screen.getByText("Provider payment")).toBeTruthy();
    expect(screen.getAllByText("provider-payment-1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Provider payout")).toBeTruthy();
    expect(screen.getByText("provider-payout-1")).toBeTruthy();
    expect(screen.getByText("Provider occurred")).toBeTruthy();
    expect(screen.getByText("Checked")).toBeTruthy();
    expect(screen.getByText("settlementAmountMinor")).toBeTruthy();
  });
});

async function uploadPaidPayoutEvidence(api: AdminFinancePoliciesApi): Promise<void> {
  const file = new File(["%PDF-"], "bank-receipt.pdf", { type: "application/pdf" });
  const input = await waitFor(() => {
    const element = document.querySelector<HTMLInputElement>('input[name="payoutEvidenceFile"]');
    if (!element) throw new Error("Payout evidence file input is not available");
    return element;
  });
  fireEvent.change(input, {
    target: { files: [file] }
  });
  await waitFor(() => expect(api.uploadPayoutBankEvidence).toHaveBeenCalledWith(file));
}

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
    version: 1,
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
    updatePayoutRequestStatus: vi.fn(),
    beginOnlinePayoutApprovalAuthorization: vi.fn(async () => financeAuthorizationChallenge()),
    approveOnlinePayout: vi.fn(async () => payoutRequest({ status: "approved", version: 2 })),
    beginOnlinePayoutManualExecutionAuthorization: vi.fn(async () => financeAuthorizationChallenge()),
    startOnlinePayoutManualExecution: vi.fn(async () =>
      payoutRequest({ status: "processing_manual", version: 3 })
    ),
    beginOnlinePayoutPaidAuthorization: vi.fn(async () => financeAuthorizationChallenge()),
    confirmOnlinePayoutPaid: vi.fn(async () =>
      payoutRequest({
        status: "paid",
        version: 4,
        externalReference: "bank-transfer-1001",
        transferredAt: "2026-08-05T10:00:00.000Z"
      })
    ),
    uploadPayoutBankEvidence: vi.fn(async () => ({
      artifactId: "bank-transfer-proof:11111111-1111-4111-8111-111111111111",
      sha256Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      byteLength: 1024,
      contentType: "application/pdf" as const
    }))
  };
}

function authorizationStub(): AdminFinanceAuthorizationClient {
  return {
    authorize: vi.fn(),
    complete: vi
      .fn()
      .mockResolvedValueOnce({
        authorizationId: "22222222-2222-4222-8222-222222222222",
        expiresAt: "2026-08-05T10:05:00.000Z"
      })
      .mockResolvedValueOnce({
        authorizationId: "33333333-3333-4333-8333-333333333333",
        expiresAt: "2026-08-05T10:05:00.000Z"
      })
      .mockResolvedValue({
        authorizationId: "44444444-4444-4444-8444-444444444444",
        expiresAt: "2026-08-05T10:05:00.000Z"
      })
  };
}

function financeAuthorizationChallenge() {
  return {
    challengeId: "11111111-1111-4111-8111-111111111111",
    expiresAt: "2026-08-05T10:05:00.000Z",
    publicKey: {
      challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      rpId: "admin.elevenhouse.test",
      timeout: 300_000 as const,
      userVerification: "required" as const
    }
  };
}
