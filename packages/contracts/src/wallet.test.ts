import { describe, expect, it } from "vitest";
import {
  ledgerOperationListResponseSchema,
  ledgerEntrySideSchema,
  ledgerTransactionSchema,
  ledgerOperationTypeSchema,
  walletBalanceResponseSchema
} from "./wallet";

describe("wallet contracts", () => {
  it("models append-only balanced ledger transactions and balance visibility buckets", () => {
    const transaction = {
      id: "11111111-1111-4111-8111-111111111111",
      operationType: "hold_created",
      orderId: "33333333-3333-4333-8333-333333333333",
      payoutRequestId: null,
      occurredAt: "2026-07-24T10:00:00.000Z",
      postedAt: "2026-07-24T10:00:01.000Z",
      metadata: { paymentAttemptId: "44444444-4444-4444-8444-444444444444" },
      entries: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          ledgerAccountId: "66666666-6666-4666-8666-666666666666",
          accountType: "platform_clearing",
          astrologerUserId: null,
          balanceBucket: null,
          side: "debit",
          amount: { amountMinor: 450_00, currency: "RUB" },
          metadata: {}
        },
        {
          id: "77777777-7777-4777-8777-777777777777",
          ledgerAccountId: "88888888-8888-4888-8888-888888888888",
          accountType: "astrologer_pending",
          astrologerUserId: "22222222-2222-4222-8222-222222222222",
          balanceBucket: "pending",
          side: "credit",
          amount: { amountMinor: 450_00, currency: "RUB" },
          metadata: {}
        }
      ]
    } as const;

    expect(ledgerTransactionSchema.parse(transaction)).toEqual(transaction);
    expect(
      walletBalanceResponseSchema.parse({
        astrologerUserId: transaction.entries[1].astrologerUserId,
        pending: { amountMinor: 450_00, currency: "RUB" },
        available: { amountMinor: 0, currency: "RUB" },
        reserved: { amountMinor: 0, currency: "RUB" },
        payoutPending: { amountMinor: 0, currency: "RUB" },
        negativeBalance: { amountMinor: 0, currency: "RUB" },
        updatedAt: "2026-07-24T10:00:00.000Z"
      })
    ).toMatchObject({ pending: { amountMinor: 450_00 } });
  });

  it("rejects unknown ledger operation states", () => {
    expect(ledgerOperationTypeSchema.parse("payout_reserved")).toBe("payout_reserved");
    expect(ledgerEntrySideSchema.parse("debit")).toBe("debit");
    expect(() => ledgerOperationTypeSchema.parse("balance_set")).toThrow();
  });

  it("models astrologer-facing ledger operation history with signed amounts", () => {
    const response = {
      operations: [
        {
          id: "11111111-1111-4111-8111-111111111111",
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
          orderId: "33333333-3333-4333-8333-333333333333",
          payoutRequestId: null,
          occurredAt: "2026-07-24T10:00:00.000Z",
          postedAt: "2026-07-24T10:00:01.000Z",
          metadata: { providerPaymentId: "arc-pay-1" }
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          operationType: "payout_reserved",
          kind: "payout",
          direction: "outflow",
          amount: { amountMinor: 3_000_00, currency: "RUB" },
          signedAmountMinor: -3_000_00,
          amountBreakdown: {
            grossAmountMinor: null,
            platformFeeAmountMinor: null,
            netAmountMinor: -3_000_00,
            currency: "RUB"
          },
          balanceBucket: null,
          orderId: null,
          payoutRequestId: "44444444-4444-4444-8444-444444444444",
          occurredAt: "2026-07-25T10:00:00.000Z",
          postedAt: "2026-07-25T10:00:01.000Z",
          metadata: {}
        }
      ],
      nextCursor: "cursor-2"
    } as const;

    expect(ledgerOperationListResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects unbalanced ledger transactions", () => {
    expect(() =>
      ledgerTransactionSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        operationType: "sale_captured",
        orderId: "33333333-3333-4333-8333-333333333333",
        payoutRequestId: null,
        occurredAt: "2026-07-24T10:00:00.000Z",
        postedAt: "2026-07-24T10:00:01.000Z",
        metadata: {},
        entries: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            ledgerAccountId: "66666666-6666-4666-8666-666666666666",
            accountType: "platform_clearing",
            astrologerUserId: null,
            balanceBucket: null,
            side: "debit",
            amount: { amountMinor: 500_00, currency: "RUB" },
            metadata: {}
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            ledgerAccountId: "88888888-8888-4888-8888-888888888888",
            accountType: "astrologer_pending",
            astrologerUserId: "22222222-2222-4222-8222-222222222222",
            balanceBucket: "pending",
            side: "credit",
            amount: { amountMinor: 499_00, currency: "RUB" },
            metadata: {}
          }
        ]
      })
    ).toThrow();
  });
});
