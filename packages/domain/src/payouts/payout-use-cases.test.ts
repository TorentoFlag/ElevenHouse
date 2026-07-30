import { describe, expect, it, vi } from "vitest";
import {
  approvePayoutStatusUpdate,
  createManualPayoutMethod,
  getAstrologerFinanceOverview,
  PayoutInsufficientAvailableBalanceError,
  PayoutMethodAlreadyConfiguredError,
  PayoutMethodMismatchError,
  PayoutMethodMissingError,
  requestAstrologerPayout,
  releaseAstrologerFundsFromHold,
  type PayoutCommandStore,
  type AstrologerPayoutReadStore,
  type PayoutMethodRecord,
  type PayoutRequestRecord
} from "./payout-use-cases";
import type { PayoutStore } from "./payout-store";
import type { CreateLedgerTransactionInput, FinancePeriodSummary, WalletBalance } from "../wallet";

const now = "2026-07-25T10:00:00.000Z";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const adminUserId = "11111111-1111-4111-8111-111111111111";
const payoutMethodId = "33333333-3333-4333-8333-333333333333";
const payoutRequestId = "44444444-4444-4444-8444-444444444444";

describe("payout use cases", () => {
  it("returns astrologer finance overview from wallet and payout read models", async () => {
    const store = createStore({
      availableAmountMinor: 25_000_00,
      method: defaultMethod(),
      request: payoutRequest({ status: "requested" })
    });

    const overview = await getAstrologerFinanceOverview({
      store,
      astrologerUserId,
      minimumPayoutAmount: { amountMinor: 1_000_00, currency: "RUB" },
      now
    });

    expect(overview).toMatchObject({
      balance: {
        astrologerUserId,
        available: { amountMinor: 25_000_00, currency: "RUB" }
      },
      defaultPayoutMethod: { id: payoutMethodId, method: "manual_bank_transfer" },
      recentPayoutRequests: [expect.objectContaining({ id: payoutRequestId })],
      canRequestPayout: true,
      payoutRequestUnavailableReason: null,
      periodSummary: {
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEndExclusive: "2026-08-01T00:00:00.000Z",
        grossSalesAmount: { amountMinor: 28_450_00, currency: "RUB" },
        platformFeeAmount: { amountMinor: 2_560_50, currency: "RUB" },
        netSalesAmount: { amountMinor: 25_889_50, currency: "RUB" },
        refundsAmount: { amountMinor: 1_600_00, currency: "RUB" },
        payoutsAmount: { amountMinor: 45_000_00, currency: "RUB" },
        saleCount: 9,
        refundCount: 1,
        payoutCount: 1,
        recurringRevenueAmount: null,
        recurringRevenueUnavailableReason: "client_subscriptions_not_implemented"
      }
    });
    expect(store.summarizePeriod).toHaveBeenCalledWith({
      astrologerUserId,
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEndExclusive: "2026-08-01T00:00:00.000Z"
    });
  });

  it("blocks payout requests until default payout method exists and available balance reaches minimum", async () => {
    await expect(
      getAstrologerFinanceOverview({
        store: createStore({ availableAmountMinor: 25_000_00, method: null }),
        astrologerUserId,
        minimumPayoutAmount: { amountMinor: 1_000_00, currency: "RUB" },
        now
      })
    ).resolves.toMatchObject({
      canRequestPayout: false,
      payoutRequestUnavailableReason: "payout_method_required"
    });

    await expect(
      getAstrologerFinanceOverview({
        store: createStore({ availableAmountMinor: 999_99, method: defaultMethod() }),
        astrologerUserId,
        minimumPayoutAmount: { amountMinor: 1_000_00, currency: "RUB" },
        now
      })
    ).resolves.toMatchObject({
      canRequestPayout: false,
      payoutRequestUnavailableReason: "insufficient_available_balance"
    });
  });

  it("creates a default manual bank transfer payout method once", async () => {
    const store = createStore({ availableAmountMinor: 0, method: null });

    const method = await createManualPayoutMethod({
      store,
      astrologerUserId,
      displayName: "Основной счет",
      recipientName: "Alisa Vega",
      bankName: "T-Bank",
      accountNumberLast4: "4417",
      details: { bik: "044525974" },
      now
    });

    expect(method).toMatchObject({
      astrologerUserId,
      method: "manual_bank_transfer",
      displayName: "Основной счет",
      manualBankTransferDetails: {
        recipientName: "Alisa Vega",
        bankName: "T-Bank",
        accountNumberLast4: "4417",
        bik: "044525974"
      },
      isDefault: true
    });

    await expect(
      createManualPayoutMethod({
        store,
        astrologerUserId,
        displayName: "Другой счет",
        recipientName: "Alisa Vega",
        bankName: "T-Bank",
        accountNumberLast4: "1111",
        details: {},
        now
      })
    ).rejects.toBeInstanceOf(PayoutMethodAlreadyConfiguredError);
  });

  it("creates a manual payout request only from available balance and reserves it", async () => {
    const store = createStore({
      availableAmountMinor: 25_000_00,
      method: defaultMethod()
    });

    const request = await requestAstrologerPayout({
      store,
      astrologerUserId,
      amount: { amountMinor: 10_000_00, currency: "RUB" },
      method: "manual_bank_transfer",
      metadata: { source: "astrologer_finance" },
      now
    });

    expect(request).toMatchObject({
      astrologerUserId,
      amount: { amountMinor: 10_000_00, currency: "RUB" },
      method: "manual_bank_transfer",
      status: "requested"
    });
    expect(store.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "payout_reserved",
        payoutRequestId,
        entries: [
          expect.objectContaining({
            side: "debit",
            account: {
              accountType: "astrologer_available",
              astrologerUserId,
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            account: {
              accountType: "astrologer_payout_pending",
              astrologerUserId,
              currency: "RUB"
            }
          })
        ]
      })
    ]);
  });

  it("rejects payout creation without method or enough available balance", async () => {
    await expect(
      requestAstrologerPayout({
        store: createStore({ availableAmountMinor: 25_000_00, method: null }),
        astrologerUserId,
        amount: { amountMinor: 10_000_00, currency: "RUB" },
        method: "manual_bank_transfer",
        metadata: {},
        now
      })
    ).rejects.toBeInstanceOf(PayoutMethodMissingError);

    await expect(
      requestAstrologerPayout({
        store: createStore({ availableAmountMinor: 9_999_99, method: defaultMethod() }),
        astrologerUserId,
        amount: { amountMinor: 10_000_00, currency: "RUB" },
        method: "manual_bank_transfer",
        metadata: {},
        now
      })
    ).rejects.toBeInstanceOf(PayoutInsufficientAvailableBalanceError);
  });

  it("rejects payout request when requested method does not match configured default method", async () => {
    await expect(
      requestAstrologerPayout({
        store: createStore({ availableAmountMinor: 25_000_00, method: defaultMethod() }),
        astrologerUserId,
        amount: { amountMinor: 10_000_00, currency: "RUB" },
        method: "arc_pay_provider",
        metadata: {},
        now
      })
    ).rejects.toBeInstanceOf(PayoutMethodMismatchError);
  });

  it("posts paid and failed status updates to ledger once terminal state changes", async () => {
    const store = createStore({
      availableAmountMinor: 25_000_00,
      method: defaultMethod(),
      request: payoutRequest({ status: "processing_manual" })
    });

    const paid = await approvePayoutStatusUpdate({
      store,
      payoutRequestId,
      adminUserId,
      update: {
        status: "paid",
        externalReference: "bank-transfer-1001",
        transferredAt: now,
        adminNote: "Paid from bank cabinet"
      },
      now
    });

    expect(paid.status).toBe("paid");
    expect(store.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "payout_paid",
        entries: [
          expect.objectContaining({
            side: "debit",
            account: {
              accountType: "astrologer_payout_pending",
              astrologerUserId,
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            account: { accountType: "payout_clearing", astrologerUserId: null, currency: "RUB" }
          })
        ]
      })
    ]);

    const replay = await approvePayoutStatusUpdate({
      store,
      payoutRequestId,
      adminUserId,
      update: {
        status: "paid",
        externalReference: "bank-transfer-1001",
        transferredAt: now,
        adminNote: "Paid from bank cabinet"
      },
      now
    });
    expect(replay.status).toBe("paid");
    expect(store.ledgerTransactions).toHaveLength(1);
  });

  it("returns payout pending money to available when manual transfer fails", async () => {
    const store = createStore({
      availableAmountMinor: 25_000_00,
      method: defaultMethod(),
      request: payoutRequest({ status: "processing_manual" })
    });

    const failed = await approvePayoutStatusUpdate({
      store,
      payoutRequestId,
      adminUserId,
      update: {
        status: "failed",
        failureReason: "Bank rejected recipient account",
        adminNote: "Needs payout details update"
      },
      now
    });

    expect(failed.status).toBe("failed");
    expect(store.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "payout_failed",
        entries: [
          expect.objectContaining({
            side: "debit",
            account: {
              accountType: "astrologer_payout_pending",
              astrologerUserId,
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            account: {
              accountType: "astrologer_available",
              astrologerUserId,
              currency: "RUB"
            }
          })
        ]
      })
    ]);
  });

  it("closes rejected payout requests and returns payout pending money to available", async () => {
    const store = createStore({
      availableAmountMinor: 25_000_00,
      method: defaultMethod(),
      request: payoutRequest({ status: "requested" })
    });

    const rejected = await approvePayoutStatusUpdate({
      store,
      payoutRequestId,
      adminUserId,
      update: {
        status: "rejected",
        failureReason: "Bank details do not match recipient",
        adminNote: "Astrologer must update payout method"
      },
      now
    });

    expect(rejected).toMatchObject({
      status: "rejected",
      completedAt: now,
      failureReason: "Bank details do not match recipient"
    });
    expect(store.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "payout_failed",
        entries: [
          expect.objectContaining({
            side: "debit",
            account: {
              accountType: "astrologer_payout_pending",
              astrologerUserId,
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            account: {
              accountType: "astrologer_available",
              astrologerUserId,
              currency: "RUB"
            }
          })
        ]
      })
    ]);
  });

  it("closes cancelled payout requests without failure evidence and releases reserved money", async () => {
    const store = createStore({
      availableAmountMinor: 25_000_00,
      method: defaultMethod(),
      request: payoutRequest({ status: "approved" })
    });

    const cancelled = await approvePayoutStatusUpdate({
      store,
      payoutRequestId,
      adminUserId,
      update: {
        status: "cancelled",
        adminNote: "Duplicate request"
      },
      now
    });

    expect(cancelled).toMatchObject({
      status: "cancelled",
      completedAt: now,
      failureReason: null,
      adminNote: "Duplicate request"
    });
    expect(store.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "payout_failed",
        metadata: expect.objectContaining({
          fromStatus: "approved",
          toStatus: "cancelled"
        })
      })
    ]);
  });

  it("releases eligible hold money from pending to available", async () => {
    const store = createStore({ availableAmountMinor: 0, method: defaultMethod() });

    await releaseAstrologerFundsFromHold({
      store,
      astrologerUserId,
      orderId: "55555555-5555-4555-8555-555555555555",
      amount: { amountMinor: 7_500_00, currency: "RUB" },
      reason: "hold_expired_and_settlement_cleared",
      now
    });

    expect(store.ledgerTransactions).toEqual([
      expect.objectContaining({
        operationType: "funds_released",
        orderId: "55555555-5555-4555-8555-555555555555",
        entries: [
          expect.objectContaining({
            side: "debit",
            account: {
              accountType: "astrologer_pending",
              astrologerUserId,
              currency: "RUB"
            }
          }),
          expect.objectContaining({
            side: "credit",
            account: {
              accountType: "astrologer_available",
              astrologerUserId,
              currency: "RUB"
            }
          })
        ]
      })
    ]);
  });
});

type TestPayoutStore = PayoutCommandStore &
  AstrologerPayoutReadStore & {
    readonly createMethod: PayoutStore["createMethod"];
    readonly ledgerTransactions: CreateLedgerTransactionInput[];
  };

function createStore(input: {
  readonly availableAmountMinor: number;
  readonly method: PayoutMethodRecord | null;
  readonly request?: PayoutRequestRecord;
}): TestPayoutStore {
  let request = input.request ?? null;
  let method = input.method;
  const ledgerTransactions: CreateLedgerTransactionInput[] = [];
  return {
    ledgerTransactions,
    findDefaultMethod: async () => method,
    createMethod: async (createInput) => {
      method = {
        id: payoutMethodId,
        astrologerUserId: createInput.astrologerUserId,
        method: createInput.method,
        currency: createInput.currency,
        displayName: createInput.displayName,
        manualBankTransferDetails: createInput.manualBankTransferDetails,
        provider: createInput.provider,
        environment: createInput.environment,
        providerPayoutAccountId: createInput.providerPayoutAccountId,
        isDefault: createInput.isDefault,
        createdAt: createInput.now,
        updatedAt: createInput.now
      };
      return method;
    },
    findWalletBalance: async () => balance(input.availableAmountMinor),
    summarizePeriod: vi.fn(async (): Promise<FinancePeriodSummary> => financePeriodSummary()),
    listRequests: async () => (request ? [request] : []),
    createRequest: async (createInput) => {
      request = payoutRequest({
        amountMinor: createInput.amount.amountMinor,
        metadata: createInput.metadata
      });
      return request;
    },
    findRequestById: async (id) => (id === request?.id ? request : null),
    updateRequestStatus: async (updateInput) => {
      if (!request || updateInput.payoutRequestId !== request.id) return null;
      request = {
        ...request,
        status: updateInput.status,
        adminUserId: updateInput.adminUserId,
        adminNote: updateInput.adminNote ?? null,
        failureReason: updateInput.failureReason ?? null,
        externalReference: updateInput.externalReference ?? null,
        transferredAt: updateInput.transferredAt ?? null,
        providerPayoutId: updateInput.providerPayoutId ?? null,
        reviewedAt: updateInput.adminUserId ? updateInput.now : request.reviewedAt,
        completedAt: isTerminalPayoutStatus(updateInput.status)
          ? updateInput.now
          : request.completedAt,
        updatedAt: updateInput.now
      };
      return request;
    },
    createTransaction: async (transaction) => {
      ledgerTransactions.push(transaction);
      return {
        ...transaction,
        id: `ledger-${ledgerTransactions.length}`,
        entries: transaction.entries.map((entry, index) => ({
          ...entry,
          id: `entry-${index}`,
          ledgerAccountId: `account-${index}`
        }))
      };
    }
  };
}

function financePeriodSummary(): FinancePeriodSummary {
  return {
    periodStart: "2026-07-01T00:00:00.000Z",
    periodEndExclusive: "2026-08-01T00:00:00.000Z",
    grossSalesAmount: { amountMinor: 28_450_00, currency: "RUB" },
    platformFeeAmount: { amountMinor: 2_560_50, currency: "RUB" },
    netSalesAmount: { amountMinor: 25_889_50, currency: "RUB" },
    refundsAmount: { amountMinor: 1_600_00, currency: "RUB" },
    payoutsAmount: { amountMinor: 45_000_00, currency: "RUB" },
    saleCount: 9,
    refundCount: 1,
    payoutCount: 1,
    recurringRevenueAmount: null,
    recurringRevenueUnavailableReason: "client_subscriptions_not_implemented"
  };
}

function isTerminalPayoutStatus(status: PayoutRequestRecord["status"]): boolean {
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
}

function defaultMethod(): PayoutMethodRecord {
  return {
    id: payoutMethodId,
    astrologerUserId,
    method: "manual_bank_transfer",
    currency: "RUB",
    displayName: "Счет •• 4417",
    manualBankTransferDetails: { recipient: "Astrologer" },
    provider: null,
    environment: null,
    providerPayoutAccountId: null,
    isDefault: true,
    createdAt: now,
    updatedAt: now
  };
}

function payoutRequest(
  overrides: Partial<PayoutRequestRecord> & { readonly amountMinor?: number } = {}
): PayoutRequestRecord {
  return {
    id: payoutRequestId,
    astrologerUserId,
    payoutMethodId,
    status: overrides.status ?? "requested",
    amount: { amountMinor: overrides.amountMinor ?? 10_000_00, currency: "RUB" },
    method: "manual_bank_transfer",
    provider: null,
    environment: null,
    requestedAt: now,
    reviewedAt: null,
    completedAt: null,
    adminUserId: null,
    adminNote: null,
    failureReason: null,
    externalReference: null,
    transferredAt: null,
    providerPayoutId: null,
    metadata: overrides.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function balance(availableAmountMinor: number): WalletBalance {
  return {
    astrologerUserId,
    pending: { amountMinor: 0, currency: "RUB" },
    available: { amountMinor: availableAmountMinor, currency: "RUB" },
    reserved: { amountMinor: 0, currency: "RUB" },
    payoutPending: { amountMinor: 0, currency: "RUB" },
    negativeBalance: { amountMinor: 0, currency: "RUB" },
    updatedAt: now
  };
}
