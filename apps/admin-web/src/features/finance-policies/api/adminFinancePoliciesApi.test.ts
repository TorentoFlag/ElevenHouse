import { describe, expect, it, vi } from "vitest";
import { createAdminFinancePoliciesApi } from "./adminFinancePoliciesApi";

describe("createAdminFinancePoliciesApi", () => {
  it("lists policies with credentialed admin-api requests", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ policies: [] }));
    const api = createAdminFinancePoliciesApi({ baseUrl: "https://admin-api.test", fetcher });

    await expect(api.listPolicies()).resolves.toEqual({ policies: [] });
    expect(fetcher).toHaveBeenCalledWith(
      "https://admin-api.test/admin/finance/policies",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("sends CSRF and validates policy mutation payloads", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        id: "11111111-1111-4111-8111-111111111111",
        policyVersion: 2,
        riskTier: "standard",
        holdDurationHours: 72,
        reserveBps: 500,
        reserveReleaseDelayDays: 14,
        platformFeeBps: 1200,
        providerSettlementRequired: true,
        isActive: true,
        createdByUserId: "22222222-2222-4222-8222-222222222222",
        snapshottedAt: "2026-07-25T10:00:00.000Z",
        createdAt: "2026-07-25T10:00:00.000Z"
      })
    );
    const api = createAdminFinancePoliciesApi({
      fetcher,
      csrfTokenReader: () => "csrf-token"
    });

    await api.updateDefaultPolicy({
      riskTier: "standard",
      holdDurationHours: 72,
      reserveBps: 500,
      reserveReleaseDelayDays: 14,
      platformFeeBps: 1200,
      providerSettlementRequired: true
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/admin/finance/policies/default",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-csrf-token": "csrf-token"
        })
      })
    );
  });

  it("loads payout queue and sends CSRF protected status updates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          summary: {
            requestedCount: 1,
            underReviewCount: 0,
            processingCount: 1,
            readyToPayAmount: { amountMinor: 10_000_00, currency: "RUB" },
            processingAmount: { amountMinor: 15_000_00, currency: "RUB" }
          },
          requests: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "11111111-1111-4111-8111-111111111111",
          astrologerUserId: "22222222-2222-4222-8222-222222222222",
          status: "paid",
          amount: { amountMinor: 10_000_00, currency: "RUB" },
          method: "manual_bank_transfer",
          requestedAt: "2026-07-24T10:00:00.000Z",
          reviewedAt: "2026-07-24T10:05:00.000Z",
          completedAt: "2026-07-24T10:20:00.000Z",
          adminUserId: "33333333-3333-4333-8333-333333333333",
          adminNote: "Paid manually",
          failureReason: null,
          externalReference: "bank-transfer-1001",
          transferredAt: "2026-07-24T10:20:00.000Z",
          providerPayoutId: null
        })
      );
    const api = createAdminFinancePoliciesApi({
      fetcher,
      csrfTokenReader: () => "csrf-token"
    });

    await expect(api.listPayoutRequests()).resolves.toMatchObject({
      summary: { requestedCount: 1 }
    });
    await api.updatePayoutRequestStatus("11111111-1111-4111-8111-111111111111", {
      status: "paid",
      externalReference: "bank-transfer-1001",
      transferredAt: "2026-07-24T10:20:00.000Z",
      adminNote: "Paid manually"
    });

    expect(fetcher).toHaveBeenLastCalledWith(
      "/admin/finance/payout-requests/11111111-1111-4111-8111-111111111111/status",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-csrf-token": "csrf-token"
        })
      })
    );
  });

  it("loads payment reversal cases without CSRF because the route is read-only", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        summary: {
          refundCount: 0,
          chargebackCount: 1,
          criticalCount: 1,
          totalAmount: { amountMinor: 50_000, currency: "RUB" },
          negativeBalanceAmount: { amountMinor: 45_000, currency: "RUB" }
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
            amount: { amountMinor: 50_000, currency: "RUB" },
            refundStatus: null,
            ledgerOperationType: "chargeback_recorded",
            ledgerTransactionId: "66666666-6666-4666-8666-666666666666",
            walletBalance: {
              astrologerUserId: "55555555-5555-4555-8555-555555555555",
              pending: { amountMinor: 0, currency: "RUB" },
              available: { amountMinor: 0, currency: "RUB" },
              reserved: { amountMinor: 0, currency: "RUB" },
              payoutPending: { amountMinor: 0, currency: "RUB" },
              negativeBalance: { amountMinor: 45_000, currency: "RUB" },
              updatedAt: "2026-07-24T10:02:00.000Z"
            },
            occurredAt: "2026-07-24T10:00:00.000Z",
            receivedAt: "2026-07-24T10:01:00.000Z"
          }
        ]
      })
    );
    const api = createAdminFinancePoliciesApi({
      fetcher,
      csrfTokenReader: () => "csrf-token"
    });

    await expect(api.listPaymentReversalCases("chargeback")).resolves.toMatchObject({
      summary: { chargebackCount: 1 }
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/admin/finance/reversal-cases?type=chargeback",
      expect.objectContaining({
        credentials: "include",
        headers: expect.not.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}
