import { buildFinancialInventoryReport } from "@elevenhouse/domain";
import { describe, expect, it } from "vitest";
import {
  readCanonicalFinancialInventorySnapshot,
  readLegacyFinancialInventorySnapshot
} from "./drizzle-financial-inventory-reader";

const targetIdentityDigest = `sha256:${"a".repeat(64)}`;

type RecordedStatement = {
  readonly text: string;
  readonly values: readonly unknown[];
};

class RecordingQueryable {
  readonly statements: RecordedStatement[] = [];

  constructor(
    private readonly rowsByQuery: Readonly<Record<string, readonly Record<string, unknown>[]>>,
    private readonly failQuery: string | null = null
  ) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<{ readonly rows: readonly Row[] }> {
    this.statements.push({ text, values });
    const queryName = /finance_inventory:([a-z_]+)/.exec(text)?.[1] ?? null;
    if (this.failQuery !== null && queryName === this.failQuery) {
      throw new Error(`forced ${queryName} failure`);
    }
    return { rows: (queryName ? (this.rowsByQuery[queryName] ?? []) : []) as readonly Row[] };
  }
}

const rowsByQuery: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  plans: [
    {
      currency: "RUB",
      row_count: "2",
      ids: ["plan-basic", "plan-pro"],
      monthly_amount_minor: "100000",
      yearly_amount_minor: "250000"
    }
  ],
  subscriptions: [
    {
      row_count: "2",
      ids: ["subscription-current", "subscription-old"]
    }
  ],
  current_subscriptions: [
    {
      subscription_id: "subscription-current",
      owner_user_id: "astrologer-1",
      status: "active"
    }
  ],
  invoices: [
    {
      currency: "RUB",
      row_count: "2",
      ids: ["invoice-open", "invoice-paid"],
      amount_minor: "150000"
    }
  ],
  paid_invoices: [{ invoice_id: "invoice-paid", owner_user_id: "astrologer-1" }],
  orders: [
    {
      order_id: "order-authorized",
      order_status: "pending_payment",
      lifecycle_stage: "authorized",
      currency: "RUB",
      gross_amount_minor: "50000",
      platform_fee_amount_minor: "5000",
      astrologer_net_amount_minor: "45000"
    },
    {
      order_id: "order-captured",
      order_status: "paid",
      lifecycle_stage: "captured_like",
      currency: "RUB",
      gross_amount_minor: "100000",
      platform_fee_amount_minor: "10000",
      astrologer_net_amount_minor: "90000"
    },
    {
      order_id: "order-stale-captured",
      order_status: "pending_payment",
      lifecycle_stage: "captured_like",
      currency: "RUB",
      gross_amount_minor: "40000",
      platform_fee_amount_minor: "4000",
      astrologer_net_amount_minor: "36000"
    }
  ],
  payment_attempts: [
    {
      payment_attempt_id: "payment-authorized",
      order_id: "order-authorized",
      payment_status: "authorized",
      lifecycle_stage: "authorized",
      currency: "RUB",
      amount_minor: "50000"
    },
    {
      payment_attempt_id: "payment-captured",
      order_id: "order-captured",
      payment_status: "captured",
      lifecycle_stage: "captured_like",
      currency: "RUB",
      amount_minor: "100000"
    },
    {
      payment_attempt_id: "payment-stale-captured",
      order_id: "order-stale-captured",
      payment_status: "captured",
      lifecycle_stage: "captured_like",
      currency: "RUB",
      amount_minor: "40000"
    }
  ],
  refunds: [
    {
      currency: "RUB",
      row_count: "1",
      ids: ["refund-1"],
      amount_minor: "10000"
    }
  ],
  chargebacks: [{ row_count: "1", ids: ["chargeback-event-1"] }],
  chargeback_reviews: [{ row_count: "1", ids: ["chargeback-review-1"] }],
  ledger_accounts: [
    {
      account_id: "account-cash",
      account_type: "platform_clearing",
      astrologer_user_id: null,
      balance_bucket: null,
      currency: "RUB",
      debit_amount_minor: "100000",
      credit_amount_minor: "0"
    },
    {
      account_id: "account-payable",
      account_type: "astrologer_available",
      astrologer_user_id: "astrologer-1",
      balance_bucket: "available",
      currency: "RUB",
      debit_amount_minor: "0",
      credit_amount_minor: "100000"
    }
  ],
  ledger_transactions: [{ row_count: "1", ids: ["transaction-1"] }],
  ledger_entries: [
    {
      currency: "RUB",
      row_count: "2",
      ids: ["entry-credit", "entry-debit"],
      amount_minor: "200000",
      debit_amount_minor: "100000",
      credit_amount_minor: "100000"
    }
  ],
  unbalanced_journals: [],
  wallet_projections: [
    {
      astrologer_user_id: "astrologer-1",
      balance_bucket: "available",
      currency: "RUB",
      amount_minor: "100000"
    },
    {
      astrologer_user_id: "astrologer-1",
      balance_bucket: "negative_balance",
      currency: "RUB",
      amount_minor: "0"
    },
    {
      astrologer_user_id: "astrologer-1",
      balance_bucket: "payout_pending",
      currency: "RUB",
      amount_minor: "0"
    },
    {
      astrologer_user_id: "astrologer-1",
      balance_bucket: "pending",
      currency: "RUB",
      amount_minor: "0"
    },
    {
      astrologer_user_id: "astrologer-1",
      balance_bucket: "reserved",
      currency: "RUB",
      amount_minor: "0"
    }
  ],
  open_payouts: [
    {
      currency: "RUB",
      row_count: "1",
      ids: ["payout-1"],
      amount_minor: "30000"
    }
  ],
  settlement_entries: [{ row_count: "1", ids: ["settlement-record-1"] }],
  monetary_controls: [
    {
      currency: "RUB",
      expected_amount_minor: "100000",
      observed_amount_minor: "140000"
    }
  ]
};

describe("readLegacyFinancialInventorySnapshot", () => {
  it("reads every current financial table inside one repeatable-read read-only transaction", async () => {
    const queryable = new RecordingQueryable(rowsByQuery);

    const snapshot = await readLegacyFinancialInventorySnapshot(queryable, {
      generatedAt: "2026-08-03T09:00:00.000Z",
      targetIdentityDigest
    });

    expect(queryable.statements[0]).toEqual({
      text: "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      values: []
    });
    expect(queryable.statements.at(-1)).toEqual({ text: "COMMIT", values: [] });
    expect(queryable.statements.map((statement) => statement.text).join("\n")).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i
    );

    expect(snapshot.datasets.platform_plans).toEqual({
      availability: "present",
      scope: "not_applicable",
      rowCount: "2",
      ids: ["plan-basic", "plan-pro"],
      monetaryTotals: [
        { measure: "monthly_price_minor_sum", currency: "RUB", amountMinor: "100000" },
        { measure: "yearly_price_minor_sum", currency: "RUB", amountMinor: "250000" }
      ]
    });
    expect(snapshot.targetIdentityDigest).toBe(targetIdentityDigest);
    expect(snapshot.datasets.platform_subscriptions).toEqual({
      availability: "present",
      scope: "legacy_unscoped",
      rowCount: "2",
      ids: ["subscription-current", "subscription-old"],
      monetaryTotals: []
    });
    expect(snapshot.datasets.wallet_source_lots.availability).toBe("absent_in_legacy_schema");
    expect(snapshot.datasets.settlement_cursors.availability).toBe("absent_in_legacy_schema");
    expect(snapshot.datasets.bank_cash_snapshots.availability).toBe("absent_in_legacy_schema");
    expect(snapshot.datasets.bank_statements.availability).toBe("absent_in_legacy_schema");
    expect(snapshot.datasets.bank_exposures.availability).toBe("absent_in_legacy_schema");
    expect(snapshot.datasets.arc_provider_accounts).toEqual({
      availability: "absent_in_legacy_schema",
      scope: "legacy_unscoped",
      rowCount: "0",
      ids: [],
      monetaryTotals: []
    });
    expect(snapshot.datasets.bank_cash_pools.availability).toBe("absent_in_legacy_schema");

    expect(snapshot.currentSubscriptions).toEqual([
      {
        subscriptionId: "subscription-current",
        ownerUserId: "astrologer-1",
        status: "active"
      }
    ]);
    expect(snapshot.paidInvoices).toEqual([
      { invoiceId: "invoice-paid", ownerUserId: "astrologer-1" }
    ]);
    expect(snapshot.journalTotals).toEqual([
      { currency: "RUB", debitAmountMinor: "100000", creditAmountMinor: "100000" }
    ]);
    expect(snapshot.openingAccountBalances).toEqual([
      {
        accountId: "account-cash",
        accountType: "platform_clearing",
        astrologerUserId: null,
        balanceBucket: null,
        currency: "RUB",
        debitAmountMinor: "100000",
        creditAmountMinor: "0"
      },
      {
        accountId: "account-payable",
        accountType: "astrologer_available",
        astrologerUserId: "astrologer-1",
        balanceBucket: "available",
        currency: "RUB",
        debitAmountMinor: "0",
        creditAmountMinor: "100000"
      }
    ]);
    expect(snapshot.walletProjections).toHaveLength(5);
    expect(snapshot.sourceLotBalances).toEqual([]);
    expect(snapshot.providerControls).toEqual([]);
    expect(snapshot.bankControls).toEqual([]);
    expect(snapshot.datasets.orders.monetaryTotals).toEqual([
      {
        measure: "gross_amount_minor",
        currency: "RUB",
        amountMinor: "190000"
      },
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
    ]);
    expect(snapshot.datasets.orders.ids).toEqual([
      "order-authorized",
      "order-captured",
      "order-stale-captured"
    ]);
    expect(snapshot.datasets.payment_attempts).toEqual({
      availability: "present",
      scope: "legacy_unscoped",
      rowCount: "3",
      ids: ["payment-authorized", "payment-captured", "payment-stale-captured"],
      monetaryTotals: [
        {
          measure: "payment_attempt_amount_minor",
          currency: "RUB",
          amountMinor: "190000"
        }
      ]
    });
    expect(snapshot.orderLifecycleEvidence).toEqual([
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
      },
      {
        orderId: "order-stale-captured",
        orderStatus: "pending_payment",
        lifecycleStage: "captured_like",
        currency: "RUB",
        grossAmountMinor: "40000",
        platformFeeAmountMinor: "4000",
        astrologerNetAmountMinor: "36000"
      }
    ]);
    expect(snapshot.paymentAttemptLifecycleEvidence).toEqual([
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
      },
      {
        paymentAttemptId: "payment-stale-captured",
        orderId: "order-stale-captured",
        paymentStatus: "captured",
        lifecycleStage: "captured_like",
        currency: "RUB",
        amountMinor: "40000"
      }
    ]);
    expect(snapshot.monetaryControls).toEqual([
      {
        code: "capture",
        availability: "available",
        currency: "RUB",
        expectedAmountMinor: "100000",
        observedAmountMinor: "140000"
      },
      {
        code: "provider_fee",
        availability: "unavailable_in_legacy_schema",
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null
      },
      {
        code: "refund",
        availability: "unavailable_in_legacy_schema",
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null
      },
      {
        code: "chargeback",
        availability: "unavailable_in_legacy_schema",
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null
      },
      {
        code: "merchant_payout",
        availability: "unavailable_in_legacy_schema",
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null
      }
    ]);

    const orderQuery = queryable.statements.find((statement) =>
      statement.text.includes("finance_inventory:orders")
    );
    const paymentQuery = queryable.statements.find((statement) =>
      statement.text.includes("finance_inventory:payment_attempts")
    );
    const payoutQuery = queryable.statements.find((statement) =>
      statement.text.includes("finance_inventory:open_payouts")
    );
    const paidInvoiceQuery = queryable.statements.find((statement) =>
      statement.text.includes("finance_inventory:paid_invoices")
    );
    expect(orderQuery?.text).toContain("$1::text[]");
    expect(orderQuery?.text).toContain("EXISTS");
    expect(orderQuery?.values).toEqual([
      ["paid", "fulfilled", "partially_refunded", "refunded", "chargeback"],
      ["authorized", "captured", "settled", "partially_refunded", "refunded", "chargeback"],
      ["captured", "settled", "partially_refunded", "refunded", "chargeback"]
    ]);
    expect(paymentQuery?.text).toContain("$1::text[]");
    expect(paymentQuery?.values).toEqual([
      ["authorized", "captured", "settled", "partially_refunded", "refunded", "chargeback"]
    ]);
    expect(payoutQuery?.text).toContain("$1::text[]");
    expect(payoutQuery?.values).toEqual([
      ["requested", "under_review", "approved", "processing_manual"]
    ]);
    expect(paidInvoiceQuery?.text).toContain("$1");
    expect(paidInvoiceQuery?.values).toEqual(["paid"]);
  });

  it("rolls back and does not commit when any inventory query fails", async () => {
    const queryable = new RecordingQueryable(rowsByQuery, "refunds");

    await expect(
      readLegacyFinancialInventorySnapshot(queryable, {
        generatedAt: "2026-08-03T09:00:00.000Z",
        targetIdentityDigest
      })
    ).rejects.toThrow("forced refunds failure");

    expect(queryable.statements.at(-1)).toEqual({ text: "ROLLBACK", values: [] });
    expect(queryable.statements.some((statement) => statement.text === "COMMIT")).toBe(false);
  });

  it("inventories authorized attempts without treating them as captured money", async () => {
    const queryable = new RecordingQueryable(rowsByQuery);

    await readLegacyFinancialInventorySnapshot(queryable, {
      generatedAt: "2026-08-03T09:00:00.000Z",
      targetIdentityDigest
    });

    const attemptInventory = queryable.statements.find((statement) =>
      statement.text.includes("finance_inventory:payment_attempts")
    );
    const captureControl = queryable.statements.find((statement) =>
      statement.text.includes("finance_inventory:monetary_controls")
    );

    expect(attemptInventory?.values).toEqual([
      ["authorized", "captured", "settled", "partially_refunded", "refunded", "chargeback"]
    ]);
    expect(captureControl?.values).toEqual([
      ["paid", "fulfilled", "partially_refunded", "refunded", "chargeback"],
      ["captured", "settled", "partially_refunded", "refunded", "chargeback"]
    ]);
  });
});

describe("readCanonicalFinancialInventorySnapshot", () => {
  it("treats a fresh current baseline as a complete zero-balance inventory, not as absent legacy data", async () => {
    const queryable = new RecordingQueryable({});

    const snapshot = await readCanonicalFinancialInventorySnapshot(queryable, {
      generatedAt: "2026-08-05T09:00:00.000Z",
      targetIdentityDigest
    });

    expect(queryable.statements[0]).toEqual({
      text: "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      values: []
    });
    expect(queryable.statements.at(-1)).toEqual({ text: "COMMIT", values: [] });
    expect(queryable.statements.map((statement) => statement.text).join("\n")).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i
    );
    for (const dataset of Object.values(snapshot.datasets)) {
      expect(dataset).toMatchObject({
        availability: "present",
        scope: expect.not.stringMatching(/^legacy_unscoped$/),
        rowCount: "0",
        ids: []
      });
    }
    expect(snapshot.monetaryControls).toEqual([
      {
        code: "capture",
        availability: "available",
        currency: "RUB",
        expectedAmountMinor: "0",
        observedAmountMinor: "0"
      },
      {
        code: "provider_fee",
        availability: "available",
        currency: "RUB",
        expectedAmountMinor: "0",
        observedAmountMinor: "0"
      },
      {
        code: "refund",
        availability: "available",
        currency: "RUB",
        expectedAmountMinor: "0",
        observedAmountMinor: "0"
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
    ]);
    expect(buildFinancialInventoryReport(snapshot).status).toBe("passed");
  });
});
