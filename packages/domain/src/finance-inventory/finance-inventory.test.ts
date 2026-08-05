import { describe, expect, it } from "vitest";
import {
  buildFinancialInventoryReport,
  FinancialInventoryIntegrityError,
  financialInventoryDatasetCodes,
  financialInventoryMonetaryControlCodes,
  serializeFinancialInventoryReport,
  type FinancialInventoryOrderLifecycleEvidence,
  type FinancialInventoryPaymentAttemptLifecycleEvidence,
  type FinancialInventorySnapshot
} from "./finance-inventory";

const completeDatasetFacts: FinancialInventorySnapshot["datasets"] = {
  platform_plans: {
    availability: "present",
    scope: "not_applicable",
    rowCount: "2",
    ids: ["plan-basic", "plan-pro"],
    monetaryTotals: [
      { measure: "monthly_price_minor_sum", currency: "RUB", amountMinor: "100000" },
      { measure: "yearly_price_minor_sum", currency: "RUB", amountMinor: "250000" }
    ]
  },
  platform_subscriptions: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["subscription-1"],
    monetaryTotals: []
  },
  billing_invoices: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["invoice-1"],
    monetaryTotals: [{ measure: "invoice_amount_minor", currency: "RUB", amountMinor: "100000" }]
  },
  orders: {
    availability: "present",
    scope: "scoped",
    rowCount: "2",
    ids: ["order-authorized", "order-captured"],
    monetaryTotals: [
      { measure: "gross_amount_minor", currency: "RUB", amountMinor: "150000" },
      { measure: "platform_fee_amount_minor", currency: "RUB", amountMinor: "15000" },
      { measure: "astrologer_net_amount_minor", currency: "RUB", amountMinor: "135000" }
    ]
  },
  payment_attempts: {
    availability: "present",
    scope: "scoped",
    rowCount: "2",
    ids: ["payment-authorized", "payment-captured"],
    monetaryTotals: [
      { measure: "payment_attempt_amount_minor", currency: "RUB", amountMinor: "150000" }
    ]
  },
  refunds: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["refund-1"],
    monetaryTotals: [{ measure: "refund_amount_minor", currency: "RUB", amountMinor: "10000" }]
  },
  chargeback_events: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["chargeback-event-1"],
    monetaryTotals: []
  },
  chargeback_review_cases: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["chargeback-review-1"],
    monetaryTotals: []
  },
  ledger_accounts: {
    availability: "present",
    scope: "scoped",
    rowCount: "2",
    ids: ["account-cash", "account-payable"],
    monetaryTotals: []
  },
  ledger_transactions: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["transaction-1"],
    monetaryTotals: []
  },
  ledger_entries: {
    availability: "present",
    scope: "scoped",
    rowCount: "2",
    ids: ["entry-credit", "entry-debit"],
    monetaryTotals: [{ measure: "entry_amount_minor", currency: "RUB", amountMinor: "200000" }]
  },
  wallet_projections: {
    availability: "present",
    scope: "not_applicable",
    rowCount: "1",
    ids: ["astrologer-1"],
    monetaryTotals: [
      { measure: "wallet_projection_amount_minor", currency: "RUB", amountMinor: "100000" }
    ]
  },
  wallet_source_lots: {
    availability: "present",
    scope: "not_applicable",
    rowCount: "1",
    ids: ["lot-1"],
    monetaryTotals: [{ measure: "source_lot_amount_minor", currency: "RUB", amountMinor: "100000" }]
  },
  open_payouts: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["payout-1"],
    monetaryTotals: [{ measure: "open_payout_amount_minor", currency: "RUB", amountMinor: "30000" }]
  },
  settlement_entries: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["settlement-entry-1"],
    monetaryTotals: [
      { measure: "settlement_entry_amount_minor", currency: "RUB", amountMinor: "90000" }
    ]
  },
  settlement_cursors: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["settlement-cursor-1"],
    monetaryTotals: []
  },
  bank_cash_snapshots: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["bank-snapshot-1"],
    monetaryTotals: [
      { measure: "unrestricted_available_amount_minor", currency: "RUB", amountMinor: "500000" }
    ]
  },
  bank_statements: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["bank-statement-1"],
    monetaryTotals: [{ measure: "statement_amount_minor", currency: "RUB", amountMinor: "30000" }]
  },
  bank_exposures: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["bank-exposure-1"],
    monetaryTotals: [{ measure: "exposure_amount_minor", currency: "RUB", amountMinor: "30000" }]
  },
  arc_provider_accounts: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["arc-account-1"],
    monetaryTotals: []
  },
  bank_cash_pools: {
    availability: "present",
    scope: "scoped",
    rowCount: "1",
    ids: ["bank-pool-1"],
    monetaryTotals: []
  }
};

const balancedSnapshot: FinancialInventorySnapshot = {
  generatedAt: "2026-08-03T09:00:00.000Z",
  targetIdentityDigest: `sha256:${"a".repeat(64)}`,
  datasets: completeDatasetFacts,
  orderLifecycleEvidence: [
    {
      orderId: "order-authorized",
      orderStatus: "pending_payment",
      lifecycleStage: "authorized",
      currency: "RUB",
      grossAmountMinor: "50000",
      platformFeeAmountMinor: "5000",
      astrologerNetAmountMinor: "45000"
    },
    {
      orderId: "order-captured",
      orderStatus: "paid",
      lifecycleStage: "captured_like",
      currency: "RUB",
      grossAmountMinor: "100000",
      platformFeeAmountMinor: "10000",
      astrologerNetAmountMinor: "90000"
    }
  ],
  paymentAttemptLifecycleEvidence: [
    {
      paymentAttemptId: "payment-authorized",
      orderId: "order-authorized",
      paymentStatus: "authorized",
      lifecycleStage: "authorized",
      currency: "RUB",
      amountMinor: "50000"
    },
    {
      paymentAttemptId: "payment-captured",
      orderId: "order-captured",
      paymentStatus: "captured",
      lifecycleStage: "captured_like",
      currency: "RUB",
      amountMinor: "100000"
    }
  ],
  currentSubscriptions: [
    { subscriptionId: "subscription-1", ownerUserId: "astrologer-1", status: "active" }
  ],
  paidInvoices: [{ invoiceId: "invoice-1", ownerUserId: "astrologer-1" }],
  journalTotals: [{ currency: "RUB", debitAmountMinor: "100000", creditAmountMinor: "100000" }],
  unbalancedJournals: [],
  openingAccountBalances: [
    {
      accountId: "account-payable",
      accountType: "astrologer_available",
      astrologerUserId: "astrologer-1",
      balanceBucket: "available",
      currency: "RUB",
      debitAmountMinor: "0",
      creditAmountMinor: "100000"
    },
    {
      accountId: "account-cash",
      accountType: "platform_clearing",
      astrologerUserId: null,
      balanceBucket: null,
      currency: "RUB",
      debitAmountMinor: "100000",
      creditAmountMinor: "0"
    }
  ],
  walletProjections: [
    {
      astrologerUserId: "astrologer-1",
      balanceBucket: "available",
      currency: "RUB",
      amountMinor: "100000"
    }
  ],
  sourceLotBalances: [
    {
      astrologerUserId: "astrologer-1",
      balanceBucket: "available",
      currency: "RUB",
      amountMinor: "100000"
    }
  ],
  providerControls: [
    {
      arcProviderAccountId: "arc-account-1",
      currency: "RUB",
      internalAmountMinor: "90000",
      providerEvidenceAmountMinor: "90000"
    }
  ],
  bankControls: [
    {
      bankCashPoolId: "bank-pool-1",
      currency: "RUB",
      internalAmountMinor: "470000",
      statementAndExposureAmountMinor: "470000"
    }
  ],
  monetaryControls: [
    {
      code: "capture",
      availability: "available",
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "100000"
    },
    {
      code: "provider_fee",
      availability: "available",
      currency: "RUB",
      expectedAmountMinor: "2000",
      observedAmountMinor: "2000"
    },
    {
      code: "refund",
      availability: "available",
      currency: "RUB",
      expectedAmountMinor: "10000",
      observedAmountMinor: "10000"
    },
    {
      code: "chargeback",
      availability: "available",
      currency: "RUB",
      expectedAmountMinor: "0",
      observedAmountMinor: "0"
    },
    {
      code: "merchant_payout",
      availability: "available",
      currency: "RUB",
      expectedAmountMinor: "0",
      observedAmountMinor: "0"
    }
  ]
};

type LifecycleMatrixCase = {
  readonly orderStatus: FinancialInventoryOrderLifecycleEvidence["orderStatus"];
  readonly paymentStatus: FinancialInventoryPaymentAttemptLifecycleEvidence["paymentStatus"] | null;
};

const capturedLikeOrderStatuses = [
  "paid",
  "fulfilled",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;

const preCaptureClosedOrderStatuses = ["draft", "cancelled", "expired"] as const;

function lifecycleMatrixSnapshot({
  orderStatus,
  paymentStatus
}: LifecycleMatrixCase): FinancialInventorySnapshot {
  const orderHasCapturedStatus = capturedLikeOrderStatuses.includes(
    orderStatus as (typeof capturedLikeOrderStatuses)[number]
  );
  const paymentHasCapturedStatus = paymentStatus !== null && paymentStatus !== "authorized";
  const orderLifecycleStage =
    orderHasCapturedStatus || paymentHasCapturedStatus ? "captured_like" : "authorized";
  const paymentAttemptLifecycleEvidence: FinancialInventoryPaymentAttemptLifecycleEvidence[] =
    paymentStatus === null
      ? []
      : [
          {
            paymentAttemptId: "payment-matrix",
            orderId: "order-matrix",
            paymentStatus,
            lifecycleStage: paymentHasCapturedStatus ? "captured_like" : "authorized",
            currency: "RUB",
            amountMinor: "100000"
          }
        ];

  return {
    ...balancedSnapshot,
    datasets: {
      ...balancedSnapshot.datasets,
      orders: {
        ...balancedSnapshot.datasets.orders,
        rowCount: "1",
        ids: ["order-matrix"],
        monetaryTotals: [
          { measure: "gross_amount_minor", currency: "RUB", amountMinor: "100000" },
          { measure: "platform_fee_amount_minor", currency: "RUB", amountMinor: "10000" },
          { measure: "astrologer_net_amount_minor", currency: "RUB", amountMinor: "90000" }
        ]
      },
      payment_attempts: {
        ...balancedSnapshot.datasets.payment_attempts,
        rowCount: String(paymentAttemptLifecycleEvidence.length),
        ids: paymentAttemptLifecycleEvidence.map((row) => row.paymentAttemptId),
        monetaryTotals:
          paymentAttemptLifecycleEvidence.length === 0
            ? []
            : [
                {
                  measure: "payment_attempt_amount_minor",
                  currency: "RUB",
                  amountMinor: "100000"
                }
              ]
      }
    },
    orderLifecycleEvidence: [
      {
        orderId: "order-matrix",
        orderStatus,
        lifecycleStage: orderLifecycleStage,
        currency: "RUB",
        grossAmountMinor: "100000",
        platformFeeAmountMinor: "10000",
        astrologerNetAmountMinor: "90000"
      }
    ],
    paymentAttemptLifecycleEvidence
  };
}

describe("financial inventory", () => {
  it("requires every approved legacy and target-control dataset in a fixed order", () => {
    expect(financialInventoryDatasetCodes).toEqual([
      "platform_plans",
      "platform_subscriptions",
      "billing_invoices",
      "orders",
      "payment_attempts",
      "refunds",
      "chargeback_events",
      "chargeback_review_cases",
      "ledger_accounts",
      "ledger_transactions",
      "ledger_entries",
      "wallet_projections",
      "wallet_source_lots",
      "open_payouts",
      "settlement_entries",
      "settlement_cursors",
      "bank_cash_snapshots",
      "bank_statements",
      "bank_exposures",
      "arc_provider_accounts",
      "bank_cash_pools"
    ]);
    expect(Object.keys(completeDatasetFacts)).toEqual(financialInventoryDatasetCodes);
    expect(financialInventoryMonetaryControlCodes).toEqual([
      "capture",
      "provider_fee",
      "refund",
      "chargeback",
      "merchant_payout"
    ]);
  });

  it("builds a balanced candidate opening trial balance without a generated balancing row", () => {
    const report = buildFinancialInventoryReport(balancedSnapshot);

    expect(report.status).toBe("passed");
    expect(report.targetIdentityDigest).toBe(`sha256:${"a".repeat(64)}`);
    expect(report.discrepancies).toEqual([]);
    expect(report.orderLifecycleEvidence).toEqual([
      {
        orderId: "order-authorized",
        orderStatus: "pending_payment",
        lifecycleStage: "authorized",
        currency: "RUB",
        grossAmountMinor: "50000",
        platformFeeAmountMinor: "5000",
        astrologerNetAmountMinor: "45000"
      },
      {
        orderId: "order-captured",
        orderStatus: "paid",
        lifecycleStage: "captured_like",
        currency: "RUB",
        grossAmountMinor: "100000",
        platformFeeAmountMinor: "10000",
        astrologerNetAmountMinor: "90000"
      }
    ]);
    expect(report.paymentAttemptLifecycleEvidence).toEqual([
      {
        paymentAttemptId: "payment-authorized",
        orderId: "order-authorized",
        paymentStatus: "authorized",
        lifecycleStage: "authorized",
        currency: "RUB",
        amountMinor: "50000"
      },
      {
        paymentAttemptId: "payment-captured",
        orderId: "order-captured",
        paymentStatus: "captured",
        lifecycleStage: "captured_like",
        currency: "RUB",
        amountMinor: "100000"
      }
    ]);
    expect(report.subscriberEvidence).toEqual({
      currentSubscriptionIds: ["subscription-1"],
      currentSubscriberUserIds: ["astrologer-1"],
      paidInvoiceIds: ["invoice-1"],
      paidInvoiceOwnerUserIds: ["astrologer-1"]
    });
    expect(report.journalTotals).toEqual([
      {
        currency: "RUB",
        debitAmountMinor: "100000",
        creditAmountMinor: "100000",
        deltaAmountMinor: "0",
        balanced: true
      }
    ]);
    expect(report.openingTrialBalanceTotals).toEqual([
      {
        currency: "RUB",
        debitAmountMinor: "100000",
        creditAmountMinor: "100000",
        deltaAmountMinor: "0",
        balanced: true
      }
    ]);
    expect(report.candidateOpeningTrialBalance).toEqual([
      {
        accountId: "account-payable",
        accountType: "astrologer_available",
        astrologerUserId: "astrologer-1",
        balanceBucket: "available",
        currency: "RUB",
        debitAmountMinor: "0",
        creditAmountMinor: "100000",
        netDebitAmountMinor: "-100000"
      },
      {
        accountId: "account-cash",
        accountType: "platform_clearing",
        astrologerUserId: null,
        balanceBucket: null,
        currency: "RUB",
        debitAmountMinor: "100000",
        creditAmountMinor: "0",
        netDebitAmountMinor: "100000"
      }
    ]);
    expect(report).not.toHaveProperty("balancingAdjustment");
    expect(
      report.candidateOpeningTrialBalance.every((line) => line.accountId !== "generated")
    ).toBe(true);
  });

  it("preserves and blocks a pending order whose payment attempt is already captured", () => {
    const staleOrder = {
      orderId: "order-stale-captured",
      orderStatus: "pending_payment" as const,
      lifecycleStage: "captured_like" as const,
      currency: "RUB",
      grossAmountMinor: "40000",
      platformFeeAmountMinor: "4000",
      astrologerNetAmountMinor: "36000"
    };
    const staleAttempt = {
      paymentAttemptId: "payment-stale-captured",
      orderId: staleOrder.orderId,
      paymentStatus: "captured" as const,
      lifecycleStage: "captured_like" as const,
      currency: "RUB",
      amountMinor: "40000"
    };
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        orders: {
          ...balancedSnapshot.datasets.orders,
          rowCount: "3",
          ids: [...balancedSnapshot.datasets.orders.ids, staleOrder.orderId],
          monetaryTotals: [
            { measure: "gross_amount_minor", currency: "RUB", amountMinor: "190000" },
            {
              measure: "platform_fee_amount_minor",
              currency: "RUB",
              amountMinor: "19000"
            },
            {
              measure: "astrologer_net_amount_minor",
              currency: "RUB",
              amountMinor: "171000"
            }
          ]
        },
        payment_attempts: {
          ...balancedSnapshot.datasets.payment_attempts,
          rowCount: "3",
          ids: [...balancedSnapshot.datasets.payment_attempts.ids, staleAttempt.paymentAttemptId],
          monetaryTotals: [
            {
              measure: "payment_attempt_amount_minor",
              currency: "RUB",
              amountMinor: "190000"
            }
          ]
        }
      },
      orderLifecycleEvidence: [...balancedSnapshot.orderLifecycleEvidence, staleOrder],
      paymentAttemptLifecycleEvidence: [
        ...balancedSnapshot.paymentAttemptLifecycleEvidence,
        staleAttempt
      ],
      monetaryControls: balancedSnapshot.monetaryControls.map((control) =>
        control.code === "capture" && control.availability === "available"
          ? { ...control, observedAmountMinor: "140000" }
          : control
      )
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.orderLifecycleEvidence).toContainEqual(staleOrder);
    expect(report.paymentAttemptLifecycleEvidence).toContainEqual(staleAttempt);
    expect(report.discrepancies).toContainEqual({
      code: "order_payment_lifecycle_mismatch",
      path: ["orderLifecycleEvidence", "order-stale-captured", "orderStatus"],
      currency: "RUB",
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "Order status pending_payment and payment-attempt lifecycle evidence disagree"
    });
  });

  it("blocks a captured order while another selected attempt remains authorized", () => {
    const staleAuthorizedAttempt = {
      paymentAttemptId: "payment-captured-stale-authorization",
      orderId: "order-captured",
      paymentStatus: "authorized" as const,
      lifecycleStage: "authorized" as const,
      currency: "RUB",
      amountMinor: "100000"
    };
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        payment_attempts: {
          ...balancedSnapshot.datasets.payment_attempts,
          rowCount: "3",
          ids: [
            ...balancedSnapshot.datasets.payment_attempts.ids,
            staleAuthorizedAttempt.paymentAttemptId
          ],
          monetaryTotals: [
            {
              measure: "payment_attempt_amount_minor",
              currency: "RUB",
              amountMinor: "250000"
            }
          ]
        }
      },
      paymentAttemptLifecycleEvidence: [
        ...balancedSnapshot.paymentAttemptLifecycleEvidence,
        staleAuthorizedAttempt
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.paymentAttemptLifecycleEvidence).toContainEqual(staleAuthorizedAttempt);
    expect(
      report.discrepancies.filter(
        (discrepancy) => discrepancy.code === "order_payment_lifecycle_mismatch"
      )
    ).toEqual([
      {
        code: "order_payment_lifecycle_mismatch",
        path: ["orderLifecycleEvidence", "order-captured", "orderStatus"],
        currency: "RUB",
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: "Order status paid and payment-attempt lifecycle evidence disagree"
      }
    ]);
  });

  it("blocks distinct duplicate authorized attempts for one pending order", () => {
    const duplicateAuthorizedAttempt = {
      paymentAttemptId: "payment-authorized-duplicate",
      orderId: "order-authorized",
      paymentStatus: "authorized" as const,
      lifecycleStage: "authorized" as const,
      currency: "RUB",
      amountMinor: "50000"
    };
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        payment_attempts: {
          ...balancedSnapshot.datasets.payment_attempts,
          rowCount: "3",
          ids: [
            ...balancedSnapshot.datasets.payment_attempts.ids,
            duplicateAuthorizedAttempt.paymentAttemptId
          ],
          monetaryTotals: [
            {
              measure: "payment_attempt_amount_minor",
              currency: "RUB",
              amountMinor: "200000"
            }
          ]
        }
      },
      paymentAttemptLifecycleEvidence: [
        ...balancedSnapshot.paymentAttemptLifecycleEvidence,
        duplicateAuthorizedAttempt
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.paymentAttemptLifecycleEvidence).toContainEqual(duplicateAuthorizedAttempt);
    expect(report.discrepancies).toEqual([
      {
        code: "order_payment_lifecycle_mismatch",
        path: ["orderLifecycleEvidence", "order-authorized", "orderStatus"],
        currency: "RUB",
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: "Order status pending_payment and payment-attempt lifecycle evidence disagree"
      }
    ]);
  });

  it("blocks distinct duplicate captured attempts even when capture totals also expose them", () => {
    const duplicateCapturedAttempt = {
      paymentAttemptId: "payment-captured-duplicate",
      orderId: "order-captured",
      paymentStatus: "captured" as const,
      lifecycleStage: "captured_like" as const,
      currency: "RUB",
      amountMinor: "100000"
    };
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        payment_attempts: {
          ...balancedSnapshot.datasets.payment_attempts,
          rowCount: "3",
          ids: [
            ...balancedSnapshot.datasets.payment_attempts.ids,
            duplicateCapturedAttempt.paymentAttemptId
          ],
          monetaryTotals: [
            {
              measure: "payment_attempt_amount_minor",
              currency: "RUB",
              amountMinor: "250000"
            }
          ]
        }
      },
      paymentAttemptLifecycleEvidence: [
        ...balancedSnapshot.paymentAttemptLifecycleEvidence,
        duplicateCapturedAttempt
      ],
      monetaryControls: balancedSnapshot.monetaryControls.map((control) =>
        control.code === "capture" && control.availability === "available"
          ? { ...control, observedAmountMinor: "200000" }
          : control
      )
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.paymentAttemptLifecycleEvidence).toContainEqual(duplicateCapturedAttempt);
    expect(report.discrepancies.map((discrepancy) => discrepancy.code)).toEqual([
      "order_payment_lifecycle_mismatch",
      "monetary_control_mismatch"
    ]);
    expect(report.discrepancies[0]).toEqual({
      code: "order_payment_lifecycle_mismatch",
      path: ["orderLifecycleEvidence", "order-captured", "orderStatus"],
      currency: "RUB",
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "Order status paid and payment-attempt lifecycle evidence disagree"
    });
  });

  it("blocks linked attempt amount swaps even when aggregate capture totals net to zero", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        orders: {
          ...balancedSnapshot.datasets.orders,
          rowCount: "2",
          ids: ["order-economics-a", "order-economics-b"],
          monetaryTotals: [
            { measure: "gross_amount_minor", currency: "RUB", amountMinor: "200000" },
            { measure: "platform_fee_amount_minor", currency: "RUB", amountMinor: "20000" },
            { measure: "astrologer_net_amount_minor", currency: "RUB", amountMinor: "180000" }
          ]
        },
        payment_attempts: {
          ...balancedSnapshot.datasets.payment_attempts,
          rowCount: "2",
          ids: ["payment-economics-a", "payment-economics-b"],
          monetaryTotals: [
            {
              measure: "payment_attempt_amount_minor",
              currency: "RUB",
              amountMinor: "200000"
            }
          ]
        }
      },
      orderLifecycleEvidence: [
        {
          orderId: "order-economics-a",
          orderStatus: "paid",
          lifecycleStage: "captured_like",
          currency: "RUB",
          grossAmountMinor: "80000",
          platformFeeAmountMinor: "8000",
          astrologerNetAmountMinor: "72000"
        },
        {
          orderId: "order-economics-b",
          orderStatus: "paid",
          lifecycleStage: "captured_like",
          currency: "RUB",
          grossAmountMinor: "120000",
          platformFeeAmountMinor: "12000",
          astrologerNetAmountMinor: "108000"
        }
      ],
      paymentAttemptLifecycleEvidence: [
        {
          paymentAttemptId: "payment-economics-a",
          orderId: "order-economics-a",
          paymentStatus: "captured",
          lifecycleStage: "captured_like",
          currency: "RUB",
          amountMinor: "120000"
        },
        {
          paymentAttemptId: "payment-economics-b",
          orderId: "order-economics-b",
          paymentStatus: "captured",
          lifecycleStage: "captured_like",
          currency: "RUB",
          amountMinor: "80000"
        }
      ],
      monetaryControls: balancedSnapshot.monetaryControls.map((control) =>
        control.code === "capture" && control.availability === "available"
          ? { ...control, expectedAmountMinor: "200000", observedAmountMinor: "200000" }
          : control
      )
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(
      report.discrepancies.filter(
        (discrepancy) => discrepancy.code === "order_payment_economics_mismatch"
      )
    ).toEqual([
      {
        code: "order_payment_economics_mismatch",
        path: ["paymentAttemptLifecycleEvidence", "payment-economics-a", "amountMinor"],
        currency: "RUB",
        expectedAmountMinor: "80000",
        observedAmountMinor: "120000",
        detail: "Payment attempt payment-economics-a amount does not equal linked order gross"
      },
      {
        code: "order_payment_economics_mismatch",
        path: ["paymentAttemptLifecycleEvidence", "payment-economics-b", "amountMinor"],
        currency: "RUB",
        expectedAmountMinor: "120000",
        observedAmountMinor: "80000",
        detail: "Payment attempt payment-economics-b amount does not equal linked order gross"
      }
    ]);
    expect(report.discrepancies.map((discrepancy) => discrepancy.code)).not.toContain(
      "monetary_control_mismatch"
    );
  });

  it("blocks linked attempt currency swaps without comparing unlike amounts", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        orders: {
          ...balancedSnapshot.datasets.orders,
          rowCount: "2",
          ids: ["order-currency-rub", "order-currency-usd"],
          monetaryTotals: [
            { measure: "gross_amount_minor", currency: "RUB", amountMinor: "100000" },
            { measure: "gross_amount_minor", currency: "USD", amountMinor: "100000" },
            { measure: "platform_fee_amount_minor", currency: "RUB", amountMinor: "10000" },
            { measure: "platform_fee_amount_minor", currency: "USD", amountMinor: "10000" },
            { measure: "astrologer_net_amount_minor", currency: "RUB", amountMinor: "90000" },
            { measure: "astrologer_net_amount_minor", currency: "USD", amountMinor: "90000" }
          ]
        },
        payment_attempts: {
          ...balancedSnapshot.datasets.payment_attempts,
          rowCount: "2",
          ids: ["payment-currency-a", "payment-currency-b"],
          monetaryTotals: [
            {
              measure: "payment_attempt_amount_minor",
              currency: "RUB",
              amountMinor: "100000"
            },
            {
              measure: "payment_attempt_amount_minor",
              currency: "USD",
              amountMinor: "100000"
            }
          ]
        }
      },
      orderLifecycleEvidence: [
        {
          orderId: "order-currency-rub",
          orderStatus: "paid",
          lifecycleStage: "captured_like",
          currency: "RUB",
          grossAmountMinor: "100000",
          platformFeeAmountMinor: "10000",
          astrologerNetAmountMinor: "90000"
        },
        {
          orderId: "order-currency-usd",
          orderStatus: "paid",
          lifecycleStage: "captured_like",
          currency: "USD",
          grossAmountMinor: "100000",
          platformFeeAmountMinor: "10000",
          astrologerNetAmountMinor: "90000"
        }
      ],
      paymentAttemptLifecycleEvidence: [
        {
          paymentAttemptId: "payment-currency-a",
          orderId: "order-currency-rub",
          paymentStatus: "captured",
          lifecycleStage: "captured_like",
          currency: "USD",
          amountMinor: "100000"
        },
        {
          paymentAttemptId: "payment-currency-b",
          orderId: "order-currency-usd",
          paymentStatus: "captured",
          lifecycleStage: "captured_like",
          currency: "RUB",
          amountMinor: "100000"
        }
      ],
      monetaryControls: [
        {
          code: "capture",
          availability: "available",
          currency: "RUB",
          expectedAmountMinor: "100000",
          observedAmountMinor: "100000"
        },
        {
          code: "capture",
          availability: "available",
          currency: "USD",
          expectedAmountMinor: "100000",
          observedAmountMinor: "100000"
        },
        ...balancedSnapshot.monetaryControls.filter((control) => control.code !== "capture")
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(
      report.discrepancies.filter(
        (discrepancy) => discrepancy.code === "order_payment_economics_mismatch"
      )
    ).toEqual([
      {
        code: "order_payment_economics_mismatch",
        path: ["paymentAttemptLifecycleEvidence", "payment-currency-a", "currency"],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail:
          "Payment attempt payment-currency-a currency USD does not equal linked order currency RUB"
      },
      {
        code: "order_payment_economics_mismatch",
        path: ["paymentAttemptLifecycleEvidence", "payment-currency-b", "currency"],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail:
          "Payment attempt payment-currency-b currency RUB does not equal linked order currency USD"
      }
    ]);
    expect(report.discrepancies.map((discrepancy) => discrepancy.code)).not.toContain(
      "monetary_control_mismatch"
    );
  });

  it.each<LifecycleMatrixCase>([
    { orderStatus: "pending_payment", paymentStatus: "authorized" },
    ...capturedLikeOrderStatuses.map((orderStatus) => ({
      orderStatus,
      paymentStatus: "captured" as const
    }))
  ])(
    "accepts aligned order=$orderStatus payment=$paymentStatus lifecycle evidence",
    ({ orderStatus, paymentStatus }) => {
      const report = buildFinancialInventoryReport(
        lifecycleMatrixSnapshot({ orderStatus, paymentStatus })
      );

      expect(
        report.discrepancies.filter(
          (discrepancy) => discrepancy.code === "order_payment_lifecycle_mismatch"
        )
      ).toEqual([]);
      expect(report.status).toBe("passed");
    }
  );

  it.each<LifecycleMatrixCase>([
    ...preCaptureClosedOrderStatuses.map((orderStatus) => ({
      orderStatus,
      paymentStatus: "authorized" as const
    })),
    ...(["pending_payment", ...preCaptureClosedOrderStatuses] as const).map((orderStatus) => ({
      orderStatus,
      paymentStatus: "captured" as const
    })),
    ...capturedLikeOrderStatuses.map((orderStatus) => ({
      orderStatus,
      paymentStatus: "authorized" as const
    })),
    ...capturedLikeOrderStatuses.map((orderStatus) => ({
      orderStatus,
      paymentStatus: null
    }))
  ])(
    "blocks mismatched order=$orderStatus payment=$paymentStatus lifecycle evidence",
    ({ orderStatus, paymentStatus }) => {
      const report = buildFinancialInventoryReport(
        lifecycleMatrixSnapshot({ orderStatus, paymentStatus })
      );

      expect(report.status).toBe("blocked");
      expect(
        report.discrepancies.filter(
          (discrepancy) => discrepancy.code === "order_payment_lifecycle_mismatch"
        )
      ).toEqual([
        {
          code: "order_payment_lifecycle_mismatch",
          path: ["orderLifecycleEvidence", "order-matrix", "orderStatus"],
          currency: "RUB",
          expectedAmountMinor: null,
          observedAmountMinor: null,
          detail: `Order status ${orderStatus} and payment-attempt lifecycle evidence disagree`
        }
      ]);
    }
  );

  it("blocks an omitted opening account even when the independent journal totals are balanced", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      openingAccountBalances: [balancedSnapshot.openingAccountBalances[1]!]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.discrepancies).toContainEqual({
      code: "ledger_account_inventory_mismatch",
      path: ["candidateOpeningTrialBalance", "accountIds"],
      currency: null,
      expectedAmountMinor: "2",
      observedAmountMinor: "1",
      detail: "Opening trial balance account IDs do not match the ledger account inventory"
    });
    expect(report.discrepancies).toContainEqual({
      code: "opening_trial_balance_imbalance",
      path: ["openingTrialBalanceTotals", "RUB"],
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "0",
      detail: "Opening trial balance debits and credits differ by 100000 minor units"
    });
    expect(report.discrepancies).toContainEqual({
      code: "opening_trial_balance_journal_mismatch",
      path: ["openingTrialBalanceTotals", "RUB", "credit"],
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "0",
      detail: "Opening trial balance credit total does not equal the journal credit total"
    });
  });

  it("emits absent_in_legacy_schema and legacy_unscoped facts instead of hiding gaps", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        wallet_source_lots: {
          availability: "absent_in_legacy_schema",
          scope: "not_applicable",
          rowCount: "0",
          ids: [],
          monetaryTotals: []
        },
        settlement_cursors: {
          availability: "absent_in_legacy_schema",
          scope: "legacy_unscoped",
          rowCount: "0",
          ids: [],
          monetaryTotals: []
        }
      },
      sourceLotBalances: []
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.datasetFacts.find((fact) => fact.code === "wallet_source_lots")).toEqual({
      code: "wallet_source_lots",
      availability: "absent_in_legacy_schema",
      scope: "not_applicable",
      rowCount: "0",
      ids: [],
      monetaryTotals: []
    });
    expect(report.discrepancies).toContainEqual({
      code: "missing_required_dataset",
      path: ["datasets", "wallet_source_lots"],
      currency: null,
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "wallet_source_lots is absent from the legacy schema"
    });
    expect(report.discrepancies).toContainEqual({
      code: "legacy_scope_unknown",
      path: ["datasets", "settlement_cursors"],
      currency: null,
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "settlement_cursors has no immutable target provider-account or bank-pool scope"
    });
  });

  it("blocks a non-zero journal imbalance by currency and identifies the journal", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      journalTotals: [
        { currency: "RUB", debitAmountMinor: "100000", creditAmountMinor: "99000" },
        { currency: "USD", debitAmountMinor: "500", creditAmountMinor: "500" }
      ],
      unbalancedJournals: [
        {
          transactionId: "transaction-broken",
          currency: "RUB",
          debitAmountMinor: "100000",
          creditAmountMinor: "99000"
        }
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.discrepancies).toContainEqual({
      code: "journal_currency_imbalance",
      path: ["journalTotals", "RUB"],
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "99000",
      detail: "Journal debits and credits differ by 1000 minor units"
    });
    expect(report.discrepancies).toContainEqual({
      code: "journal_transaction_imbalance",
      path: ["unbalancedJournals", "transaction-broken", "RUB"],
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "99000",
      detail: "Ledger transaction transaction-broken is not balanced"
    });
  });

  it("blocks wallet-to-liability and wallet-to-source-lot mismatches", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      walletProjections: [
        {
          astrologerUserId: "astrologer-1",
          balanceBucket: "available",
          currency: "RUB",
          amountMinor: "99000"
        }
      ],
      sourceLotBalances: [
        {
          astrologerUserId: "astrologer-1",
          balanceBucket: "available",
          currency: "RUB",
          amountMinor: "98000"
        }
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.discrepancies).toContainEqual({
      code: "wallet_liability_mismatch",
      path: ["walletControls", "astrologer-1", "available", "RUB"],
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "99000",
      detail: "Wallet projection does not equal the matching liability account"
    });
    expect(report.discrepancies).toContainEqual({
      code: "wallet_source_lot_mismatch",
      path: ["walletControls", "astrologer-1", "available", "RUB"],
      currency: "RUB",
      expectedAmountMinor: "99000",
      observedAmountMinor: "98000",
      detail: "Wallet projection does not equal remaining source lots"
    });
  });

  it("reconciles the legacy negative-balance wallet bucket to its debit-normal account", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        ledger_accounts: {
          ...balancedSnapshot.datasets.ledger_accounts,
          rowCount: "3",
          ids: ["account-cash", "account-negative", "account-payable"]
        }
      },
      journalTotals: [{ currency: "RUB", debitAmountMinor: "105000", creditAmountMinor: "105000" }],
      openingAccountBalances: [
        {
          ...balancedSnapshot.openingAccountBalances[0]!,
          creditAmountMinor: "100000"
        },
        {
          ...balancedSnapshot.openingAccountBalances[1]!,
          creditAmountMinor: "5000"
        },
        {
          accountId: "account-negative",
          accountType: "astrologer_negative_balance",
          astrologerUserId: "astrologer-1",
          balanceBucket: "negative_balance",
          currency: "RUB",
          debitAmountMinor: "5000",
          creditAmountMinor: "0"
        }
      ],
      walletProjections: [
        ...balancedSnapshot.walletProjections,
        {
          astrologerUserId: "astrologer-1",
          balanceBucket: "negative_balance",
          currency: "RUB",
          amountMinor: "5000"
        }
      ],
      sourceLotBalances: [
        ...balancedSnapshot.sourceLotBalances,
        {
          astrologerUserId: "astrologer-1",
          balanceBucket: "negative_balance",
          currency: "RUB",
          amountMinor: "5000"
        }
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("passed");
    expect(report.walletControls).toContainEqual({
      astrologerUserId: "astrologer-1",
      balanceBucket: "negative_balance",
      currency: "RUB",
      liabilityAmountMinor: "5000",
      walletAmountMinor: "5000",
      sourceLotAmountMinor: "5000"
    });
  });

  it("fails closed for every missing required provider monetary control", () => {
    for (const code of financialInventoryMonetaryControlCodes) {
      const snapshot: FinancialInventorySnapshot = {
        ...balancedSnapshot,
        monetaryControls: balancedSnapshot.monetaryControls.filter(
          (control) => control.code !== code
        )
      };

      const report = buildFinancialInventoryReport(snapshot);

      expect(report.discrepancies).toContainEqual({
        code: "monetary_control_missing",
        path: ["monetaryControls", code],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `${code} control is missing`
      });
    }
  });

  it("keeps unavailable legacy provider evidence as an explicit blocking control fact", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      monetaryControls: balancedSnapshot.monetaryControls.map((control) =>
        control.code === "provider_fee"
          ? {
              code: "provider_fee",
              availability: "unavailable_in_legacy_schema",
              currency: null,
              expectedAmountMinor: null,
              observedAmountMinor: null
            }
          : control
      )
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.monetaryControls).toContainEqual({
      code: "provider_fee",
      availability: "unavailable_in_legacy_schema",
      currency: null,
      expectedAmountMinor: null,
      observedAmountMinor: null
    });
    expect(report.discrepancies).toContainEqual({
      code: "monetary_control_unavailable",
      path: ["monetaryControls", "provider_fee"],
      currency: null,
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "provider_fee control evidence is unavailable in the legacy schema"
    });
  });

  it("fails closed when an inventoried provider account or bank pool lacks a control total", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        arc_provider_accounts: {
          ...balancedSnapshot.datasets.arc_provider_accounts,
          rowCount: "2",
          ids: ["arc-account-1", "arc-account-2"]
        },
        bank_cash_pools: {
          ...balancedSnapshot.datasets.bank_cash_pools,
          rowCount: "2",
          ids: ["bank-pool-1", "bank-pool-2"]
        }
      }
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.discrepancies).toContainEqual({
      code: "provider_control_missing",
      path: ["providerControls", "arc-account-2"],
      currency: null,
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "ArcPay provider account arc-account-2 has no control total"
    });
    expect(report.discrepancies).toContainEqual({
      code: "bank_control_missing",
      path: ["bankControls", "bank-pool-2"],
      currency: null,
      expectedAmountMinor: null,
      observedAmountMinor: null,
      detail: "Bank cash pool bank-pool-2 has no control total"
    });
  });

  it("blocks provider, bank and generic monetary control mismatches", () => {
    const snapshot: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      providerControls: [
        {
          arcProviderAccountId: "arc-account-1",
          currency: "RUB",
          internalAmountMinor: "90000",
          providerEvidenceAmountMinor: "89900"
        }
      ],
      bankControls: [
        {
          bankCashPoolId: "bank-pool-1",
          currency: "RUB",
          internalAmountMinor: "470000",
          statementAndExposureAmountMinor: "460000"
        }
      ],
      monetaryControls: [
        {
          code: "capture",
          availability: "available",
          currency: "RUB",
          expectedAmountMinor: "100000",
          observedAmountMinor: "95000"
        },
        ...balancedSnapshot.monetaryControls.slice(1)
      ]
    };

    const report = buildFinancialInventoryReport(snapshot);

    expect(report.status).toBe("blocked");
    expect(report.discrepancies.map((item) => item.code)).toContain("provider_control_mismatch");
    expect(report.discrepancies.map((item) => item.code)).toContain("bank_control_mismatch");
    expect(report.discrepancies).toContainEqual({
      code: "monetary_control_mismatch",
      path: ["monetaryControls", "capture", "RUB"],
      currency: "RUB",
      expectedAmountMinor: "100000",
      observedAmountMinor: "95000",
      detail: "capture differs by 5000 minor units"
    });
  });

  it("serializes stable JSON independent of input ordering", () => {
    const reordered: FinancialInventorySnapshot = {
      ...balancedSnapshot,
      datasets: {
        ...balancedSnapshot.datasets,
        platform_plans: {
          ...balancedSnapshot.datasets.platform_plans,
          ids: [...balancedSnapshot.datasets.platform_plans.ids].reverse()
        }
      },
      openingAccountBalances: [...balancedSnapshot.openingAccountBalances].reverse(),
      orderLifecycleEvidence: [...balancedSnapshot.orderLifecycleEvidence].reverse(),
      paymentAttemptLifecycleEvidence: [
        ...balancedSnapshot.paymentAttemptLifecycleEvidence
      ].reverse()
    };

    const first = serializeFinancialInventoryReport(
      buildFinancialInventoryReport(balancedSnapshot)
    );
    const second = serializeFinancialInventoryReport(buildFinancialInventoryReport(reordered));

    expect(second).toBe(first);
    expect(first).toContain('"status":"passed"');
  });

  it("orders journal discrepancy evidence independently of query row order", () => {
    const journalTotals = [
      { currency: "USD", debitAmountMinor: "2", creditAmountMinor: "1" },
      { currency: "EUR", debitAmountMinor: "3", creditAmountMinor: "1" }
    ] as const;
    const first = serializeFinancialInventoryReport(
      buildFinancialInventoryReport({ ...balancedSnapshot, journalTotals })
    );
    const second = serializeFinancialInventoryReport(
      buildFinancialInventoryReport({
        ...balancedSnapshot,
        journalTotals: [...journalTotals].reverse()
      })
    );

    expect(second).toBe(first);
  });

  it.each([
    {
      name: "an impossible calendar instant",
      snapshot: { ...balancedSnapshot, generatedAt: "2026-02-30T09:00:00Z" },
      expected: "generatedAt must be a valid ISO instant"
    },
    {
      name: "a malformed target identity digest",
      snapshot: { ...balancedSnapshot, targetIdentityDigest: "finance-db.internal" },
      expected: "targetIdentityDigest must be a lowercase sha256 digest"
    },
    {
      name: "a non-canonical row count",
      snapshot: {
        ...balancedSnapshot,
        datasets: {
          ...balancedSnapshot.datasets,
          orders: { ...balancedSnapshot.datasets.orders, rowCount: "01" }
        }
      },
      expected: "orders.rowCount must be a canonical unsigned integer string"
    },
    {
      name: "a negative dataset monetary total",
      snapshot: {
        ...balancedSnapshot,
        datasets: {
          ...balancedSnapshot.datasets,
          refunds: {
            ...balancedSnapshot.datasets.refunds,
            monetaryTotals: [{ measure: "refund_amount_minor", currency: "RUB", amountMinor: "-1" }]
          }
        }
      },
      expected: "refunds.monetaryTotals.amountMinor must be a canonical unsigned integer string"
    },
    {
      name: "duplicate journal currency controls",
      snapshot: {
        ...balancedSnapshot,
        journalTotals: [...balancedSnapshot.journalTotals, ...balancedSnapshot.journalTotals]
      },
      expected: "journalTotals contains duplicate key RUB"
    },
    {
      name: "duplicate opening account currency keys",
      snapshot: {
        ...balancedSnapshot,
        openingAccountBalances: [
          ...balancedSnapshot.openingAccountBalances,
          balancedSnapshot.openingAccountBalances[0]!
        ]
      },
      expected: "openingAccountBalances contains duplicate key account-payable"
    },
    {
      name: "duplicate provider control keys",
      snapshot: {
        ...balancedSnapshot,
        providerControls: [
          ...balancedSnapshot.providerControls,
          ...balancedSnapshot.providerControls
        ]
      },
      expected: "providerControls contains duplicate key arc-account-1/RUB"
    },
    {
      name: "duplicate bank control keys",
      snapshot: {
        ...balancedSnapshot,
        bankControls: [...balancedSnapshot.bankControls, ...balancedSnapshot.bankControls]
      },
      expected: "bankControls contains duplicate key bank-pool-1/RUB"
    },
    {
      name: "duplicate generic monetary control keys",
      snapshot: {
        ...balancedSnapshot,
        monetaryControls: [
          ...balancedSnapshot.monetaryControls,
          ...balancedSnapshot.monetaryControls
        ]
      },
      expected: "monetaryControls contains duplicate key capture/RUB"
    }
  ])("rejects $name instead of silently selecting or coalescing it", ({ snapshot, expected }) => {
    expect(() => buildFinancialInventoryReport(snapshot)).toThrow(
      new FinancialInventoryIntegrityError(expected)
    );
  });
});
