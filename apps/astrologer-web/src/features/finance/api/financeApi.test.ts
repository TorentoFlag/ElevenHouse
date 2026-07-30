import type {
  AstrologerFinanceOverviewResponse,
  LedgerOperationListResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { createManualBankTransferPayoutMethod } from "./createManualBankTransferPayoutMethod";
import { createPayoutRequest } from "./createPayoutRequest";
import { getCurrentFinanceOverview } from "./getCurrentFinanceOverview";
import { listFinanceOperations } from "./listFinanceOperations";

const overview = {
  balance: {
    astrologerUserId: "22222222-2222-4222-8222-222222222222",
    pending: { amountMinor: 0, currency: "RUB" },
    available: { amountMinor: 15_000_00, currency: "RUB" },
    reserved: { amountMinor: 0, currency: "RUB" },
    payoutPending: { amountMinor: 5_000_00, currency: "RUB" },
    negativeBalance: { amountMinor: 0, currency: "RUB" },
    updatedAt: "2026-07-26T10:00:00.000Z"
  },
  defaultPayoutMethod: null,
  recentPayoutRequests: [],
  canRequestPayout: false,
  minimumPayoutAmount: { amountMinor: 1_000_00, currency: "RUB" },
  payoutRequestUnavailableReason: "payout_method_required"
} satisfies AstrologerFinanceOverviewResponse;

const operations = {
  operations: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      operationType: "sale_captured",
      kind: "sale",
      direction: "inflow",
      amount: { amountMinor: 5_000_00, currency: "RUB" },
      signedAmountMinor: 5_000_00,
      amountBreakdown: {
        grossAmountMinor: 5_700_00,
        platformFeeAmountMinor: 700_00,
        netAmountMinor: 5_000_00,
        currency: "RUB"
      },
      balanceBucket: "pending",
      orderId: "66666666-6666-4666-8666-666666666666",
      payoutRequestId: null,
      occurredAt: "2026-07-26T10:00:00.000Z",
      postedAt: "2026-07-26T10:00:01.000Z",
      metadata: {}
    }
  ],
  nextCursor: null
} satisfies LedgerOperationListResponse;

describe("finance API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads current finance overview through the shared response contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(overview);

    await expect(getCurrentFinanceOverview()).resolves.toEqual(overview);

    expect(get).toHaveBeenCalledWith("/finance/me");
  });

  it("loads ledger operations through the shared response contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(operations);

    await expect(
      listFinanceOperations({ limit: 10, operationType: "sale_captured" })
    ).resolves.toEqual(operations);

    expect(get).toHaveBeenCalledWith("/finance/operations?limit=10&operationType=sale_captured");
  });

  it("creates manual payout method with CSRF and idempotency header", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      method: "manual_bank_transfer",
      currency: "RUB",
      displayName: "Основной счет",
      isDefault: true,
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: "2026-07-26T10:00:00.000Z"
    });

    await createManualBankTransferPayoutMethod({
      displayName: "Основной счет",
      recipientName: "Alisa Vega",
      bankName: "T-Bank",
      accountNumberLast4: "4417",
      idempotencyKey: "finance-method-1"
    });

    expect(post).toHaveBeenCalledWith(
      "/finance/payout-methods/manual-bank-transfer",
      expect.objectContaining({ idempotencyKey: "finance-method-1" }),
      { csrf: true, headers: { "idempotency-key": "finance-method-1" } }
    );
  });

  it("creates payout request with CSRF and idempotency header", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      status: "requested",
      amount: { amountMinor: 5_000_00, currency: "RUB" },
      method: "manual_bank_transfer",
      requestedAt: "2026-07-26T10:00:00.000Z",
      reviewedAt: null,
      completedAt: null,
      adminUserId: null,
      adminNote: null,
      failureReason: null,
      externalReference: null,
      transferredAt: null,
      providerPayoutId: null
    });

    await createPayoutRequest({
      amount: { amountMinor: 5_000_00, currency: "RUB" },
      method: "manual_bank_transfer",
      idempotencyKey: "finance-request-1"
    });

    expect(post).toHaveBeenCalledWith(
      "/finance/payout-requests",
      expect.objectContaining({ idempotencyKey: "finance-request-1" }),
      { csrf: true, headers: { "idempotency-key": "finance-request-1" } }
    );
  });
});
