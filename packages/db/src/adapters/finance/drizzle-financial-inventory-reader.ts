import type {
  FinancialInventoryDatasetFact,
  FinancialInventoryMonetaryControl,
  FinancialInventoryOrderLifecycleEvidence,
  FinancialInventoryPaymentAttemptLifecycleEvidence,
  FinancialInventorySnapshot,
  FinancialInventoryWalletBalance
} from "@elevenhouse/domain";
import {
  chargebackReviewsSql,
  chargebacksSql,
  canonicalCountSql,
  canonicalCurrentSubscriptionsSql,
  canonicalInvoicesSql,
  canonicalJournalAccountsSql,
  canonicalJournalEntriesSql,
  canonicalOpenPayoutsSql,
  canonicalPaidInvoicesSql,
  canonicalPlansSql,
  canonicalRefundsSql,
  canonicalSourceLotsSql,
  canonicalSubscriptionsSql,
  canonicalUnbalancedJournalsSql,
  canonicalWalletProjectionsSql,
  currentSubscriptionsSql,
  invoicesSql,
  ledgerAccountsSql,
  ledgerEntriesSql,
  ledgerTransactionsSql,
  monetaryControlsSql,
  openPayoutsSql,
  ordersSql,
  paidInvoicesSql,
  paymentAttemptsSql,
  plansSql,
  refundsSql,
  settlementEntriesSql,
  subscriptionsSql,
  unbalancedJournalsSql,
  walletProjectionsSql
} from "./drizzle-financial-inventory-reader.sql";

export type FinancialInventoryQueryable = {
  readonly query: <Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly Row[] }>;
};

const capturedOrderStatuses = [
  "paid",
  "fulfilled",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;

const authorizedOrCapturedPaymentStatuses = [
  "authorized",
  "captured",
  "settled",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;

const capturedPaymentStatuses = [
  "captured",
  "settled",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;

const openPayoutStatuses = [
  "requested",
  "under_review",
  "approved",
  "processing_manual"
] as const;

type MonetaryAggregateRow = {
  readonly currency: string;
  readonly row_count: string;
  readonly ids: readonly string[];
  readonly amount_minor: string;
};

type PlanAggregateRow = Omit<MonetaryAggregateRow, "amount_minor"> & {
  readonly monthly_amount_minor: string;
  readonly yearly_amount_minor: string;
};

type OrderLifecycleRow = {
  readonly order_id: string;
  readonly order_status: string;
  readonly lifecycle_stage: string;
  readonly currency: string;
  readonly gross_amount_minor: string;
  readonly platform_fee_amount_minor: string;
  readonly astrologer_net_amount_minor: string;
};

type PaymentAttemptLifecycleRow = {
  readonly payment_attempt_id: string;
  readonly order_id: string;
  readonly payment_status: string;
  readonly lifecycle_stage: string;
  readonly currency: string;
  readonly amount_minor: string;
};

type CountAggregateRow = {
  readonly row_count: string;
  readonly ids: readonly string[];
};

type CurrentSubscriptionRow = {
  readonly subscription_id: string;
  readonly owner_user_id: string;
  readonly status: string;
};

type PaidInvoiceRow = {
  readonly invoice_id: string;
  readonly owner_user_id: string;
};

type OpeningAccountRow = {
  readonly account_id: string;
  readonly account_type: string;
  readonly astrologer_user_id: string | null;
  readonly balance_bucket: string | null;
  readonly currency: string;
  readonly debit_amount_minor: string;
  readonly credit_amount_minor: string;
};

type LedgerEntryAggregateRow = MonetaryAggregateRow & {
  readonly debit_amount_minor: string;
  readonly credit_amount_minor: string;
};

type UnbalancedJournalRow = {
  readonly transaction_id: string;
  readonly currency: string;
  readonly debit_amount_minor: string;
  readonly credit_amount_minor: string;
};

type WalletProjectionRow = {
  readonly astrologer_user_id: string;
  readonly balance_bucket: string;
  readonly currency: string;
  readonly amount_minor: string;
};

type MonetaryControlRow = {
  readonly currency: string;
  readonly expected_amount_minor: string;
  readonly observed_amount_minor: string;
};

export async function readLegacyFinancialInventorySnapshot(
  queryable: FinancialInventoryQueryable,
  input: { readonly generatedAt: string; readonly targetIdentityDigest: string }
): Promise<FinancialInventorySnapshot> {
  await queryable.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const plans = await queryable.query<PlanAggregateRow>(plansSql);
    const subscriptions = await queryable.query<CountAggregateRow>(subscriptionsSql);
    const currentSubscriptions =
      await queryable.query<CurrentSubscriptionRow>(currentSubscriptionsSql);
    const invoices = await queryable.query<MonetaryAggregateRow>(invoicesSql);
    const paidInvoices = await queryable.query<PaidInvoiceRow>(paidInvoicesSql, ["paid"]);
    const orders = await queryable.query<OrderLifecycleRow>(ordersSql, [
      [...capturedOrderStatuses],
      [...authorizedOrCapturedPaymentStatuses],
      [...capturedPaymentStatuses]
    ]);
    const paymentAttempts = await queryable.query<PaymentAttemptLifecycleRow>(paymentAttemptsSql, [
      [...authorizedOrCapturedPaymentStatuses]
    ]);
    const refunds = await queryable.query<MonetaryAggregateRow>(refundsSql);
    const chargebacks = await queryable.query<CountAggregateRow>(chargebacksSql, [
      "payment.chargeback"
    ]);
    const chargebackReviews = await queryable.query<CountAggregateRow>(chargebackReviewsSql, [
      "payment.chargeback"
    ]);
    const ledgerAccounts = await queryable.query<OpeningAccountRow>(ledgerAccountsSql);
    const ledgerTransactions = await queryable.query<CountAggregateRow>(ledgerTransactionsSql);
    const ledgerEntries = await queryable.query<LedgerEntryAggregateRow>(ledgerEntriesSql);
    const unbalancedJournals = await queryable.query<UnbalancedJournalRow>(unbalancedJournalsSql);
    const walletProjections = await queryable.query<WalletProjectionRow>(walletProjectionsSql);
    const openPayouts = await queryable.query<MonetaryAggregateRow>(openPayoutsSql, [
      [...openPayoutStatuses]
    ]);
    const settlementEntries = await queryable.query<CountAggregateRow>(settlementEntriesSql);
    const monetaryControls = await queryable.query<MonetaryControlRow>(monetaryControlsSql, [
      [...capturedOrderStatuses],
      [...capturedPaymentStatuses]
    ]);

    const accountIds = ledgerAccounts.rows.map((row) => row.account_id).sort(compareText);
    const walletRows = walletProjections.rows.map(toWalletBalance);
    const walletOwnerIds = sortedUnique(walletRows.map((row) => row.astrologerUserId));
    const orderLifecycleEvidence = orders.rows.map(toOrderLifecycleEvidence);
    const paymentAttemptLifecycleEvidence = paymentAttempts.rows.map(
      toPaymentAttemptLifecycleEvidence
    );
    const datasets: FinancialInventorySnapshot["datasets"] = {
      platform_plans: planDataset(plans.rows),
      platform_subscriptions: countDataset(subscriptions.rows, "legacy_unscoped"),
      billing_invoices: monetaryDataset(invoices.rows, "legacy_unscoped", "invoice_amount_minor"),
      orders: orderDataset(orderLifecycleEvidence),
      payment_attempts: paymentAttemptDataset(paymentAttemptLifecycleEvidence),
      refunds: monetaryDataset(refunds.rows, "legacy_unscoped", "refund_amount_minor"),
      chargeback_events: countDataset(chargebacks.rows, "legacy_unscoped"),
      chargeback_review_cases: countDataset(chargebackReviews.rows, "legacy_unscoped"),
      ledger_accounts: {
        availability: "present",
        scope: "legacy_unscoped",
        rowCount: String(accountIds.length),
        ids: accountIds,
        monetaryTotals: []
      },
      ledger_transactions: countDataset(ledgerTransactions.rows, "legacy_unscoped"),
      ledger_entries: monetaryDataset(ledgerEntries.rows, "legacy_unscoped", "entry_amount_minor"),
      wallet_projections: {
        availability: "present",
        scope: "not_applicable",
        rowCount: String(walletOwnerIds.length),
        ids: walletOwnerIds,
        monetaryTotals: sumWalletTotals(walletRows)
      },
      wallet_source_lots: absentDataset("not_applicable"),
      open_payouts: monetaryDataset(
        openPayouts.rows,
        "legacy_unscoped",
        "open_payout_amount_minor"
      ),
      settlement_entries: countDataset(settlementEntries.rows, "legacy_unscoped"),
      settlement_cursors: absentDataset("legacy_unscoped"),
      bank_cash_snapshots: absentDataset("legacy_unscoped"),
      bank_statements: absentDataset("legacy_unscoped"),
      bank_exposures: absentDataset("legacy_unscoped"),
      arc_provider_accounts: absentDataset("legacy_unscoped"),
      bank_cash_pools: absentDataset("legacy_unscoped")
    };

    const snapshot: FinancialInventorySnapshot = {
      generatedAt: input.generatedAt,
      targetIdentityDigest: input.targetIdentityDigest,
      datasets,
      orderLifecycleEvidence,
      paymentAttemptLifecycleEvidence,
      currentSubscriptions: currentSubscriptions.rows.map((row) => ({
        subscriptionId: row.subscription_id,
        ownerUserId: row.owner_user_id,
        status: row.status
      })),
      paidInvoices: paidInvoices.rows.map((row) => ({
        invoiceId: row.invoice_id,
        ownerUserId: row.owner_user_id
      })),
      journalTotals: ledgerEntries.rows.map((row) => ({
        currency: row.currency,
        debitAmountMinor: row.debit_amount_minor,
        creditAmountMinor: row.credit_amount_minor
      })),
      unbalancedJournals: unbalancedJournals.rows.map((row) => ({
        transactionId: row.transaction_id,
        currency: row.currency,
        debitAmountMinor: row.debit_amount_minor,
        creditAmountMinor: row.credit_amount_minor
      })),
      openingAccountBalances: ledgerAccounts.rows.map((row) => ({
        accountId: row.account_id,
        accountType: row.account_type,
        astrologerUserId: row.astrologer_user_id,
        balanceBucket: row.balance_bucket,
        currency: row.currency,
        debitAmountMinor: row.debit_amount_minor,
        creditAmountMinor: row.credit_amount_minor
      })),
      walletProjections: walletRows,
      sourceLotBalances: [],
      providerControls: [],
      bankControls: [],
      monetaryControls: toLegacyMonetaryControls(monetaryControls.rows)
    };

    await queryable.query("COMMIT");
    return snapshot;
  } catch (error) {
    await queryable.query("ROLLBACK");
    throw error;
  }
}

/**
 * Reads the post-reset source of truth. It intentionally does not reuse the
 * legacy reader: absent legacy projections are not evidence that the sealed
 * finance tables are missing.
 */
export async function readCanonicalFinancialInventorySnapshot(
  queryable: FinancialInventoryQueryable,
  input: { readonly generatedAt: string; readonly targetIdentityDigest: string }
): Promise<FinancialInventorySnapshot> {
  await queryable.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const plans = await queryable.query<PlanAggregateRow>(canonicalPlansSql);
    const subscriptions = await queryable.query<CountAggregateRow>(canonicalSubscriptionsSql);
    const currentSubscriptions = await queryable.query<CurrentSubscriptionRow>(
      canonicalCurrentSubscriptionsSql
    );
    const invoices = await queryable.query<MonetaryAggregateRow>(canonicalInvoicesSql);
    const paidInvoices = await queryable.query<PaidInvoiceRow>(canonicalPaidInvoicesSql);
    const refunds = await queryable.query<MonetaryAggregateRow>(canonicalRefundsSql);
    const chargebacks = await queryable.query<CountAggregateRow>(canonicalCountSql.chargebacks);
    const chargebackReviews = await queryable.query<CountAggregateRow>(
      canonicalCountSql.chargebackReviews
    );
    const ledgerAccounts = await queryable.query<OpeningAccountRow>(canonicalJournalAccountsSql);
    const ledgerTransactions = await queryable.query<CountAggregateRow>(
      canonicalCountSql.journalTransactions
    );
    const ledgerEntries = await queryable.query<LedgerEntryAggregateRow>(canonicalJournalEntriesSql);
    const unbalancedJournals = await queryable.query<UnbalancedJournalRow>(
      canonicalUnbalancedJournalsSql
    );
    const walletProjections = await queryable.query<WalletProjectionRow>(
      canonicalWalletProjectionsSql
    );
    const sourceLots = await queryable.query<WalletProjectionRow>(canonicalSourceLotsSql);
    const openPayouts = await queryable.query<MonetaryAggregateRow>(canonicalOpenPayoutsSql);
    const settlementEntries = await queryable.query<CountAggregateRow>(
      canonicalCountSql.settlementEntries
    );
    const settlementCursors = await queryable.query<CountAggregateRow>(
      canonicalCountSql.settlementCursors
    );
    const bankCashSnapshots = await queryable.query<CountAggregateRow>(
      canonicalCountSql.bankCashSnapshots
    );
    const bankStatements = await queryable.query<CountAggregateRow>(canonicalCountSql.bankStatements);
    const bankExposures = await queryable.query<CountAggregateRow>(canonicalCountSql.bankExposures);
    const providerAccounts = await queryable.query<CountAggregateRow>(
      canonicalCountSql.providerAccounts
    );
    const bankCashPools = await queryable.query<CountAggregateRow>(
      canonicalCountSql.bankCashPools
    );

    const walletRows = walletProjections.rows.map(toWalletBalance);
    const sourceLotRows = sourceLots.rows.map(toWalletBalance);
    const datasets: FinancialInventorySnapshot["datasets"] = {
      platform_plans: planDataset(plans.rows),
      platform_subscriptions: countDataset(subscriptions.rows, "scoped"),
      billing_invoices: monetaryDataset(invoices.rows, "scoped", "invoice_amount_minor"),
      orders: emptyCanonicalDataset(),
      payment_attempts: emptyCanonicalDataset(),
      refunds: monetaryDataset(refunds.rows, "scoped", "refund_amount_minor"),
      chargeback_events: countDataset(chargebacks.rows, "scoped"),
      chargeback_review_cases: countDataset(chargebackReviews.rows, "scoped"),
      ledger_accounts: {
        availability: "present",
        scope: "scoped",
        rowCount: String(ledgerAccounts.rows.length),
        ids: ledgerAccounts.rows.map((row) => row.account_id).sort(compareText),
        monetaryTotals: []
      },
      ledger_transactions: countDataset(ledgerTransactions.rows, "scoped"),
      ledger_entries: monetaryDataset(ledgerEntries.rows, "scoped", "entry_amount_minor"),
      wallet_projections: walletDataset(walletRows),
      wallet_source_lots: walletDataset(sourceLotRows),
      open_payouts: monetaryDataset(openPayouts.rows, "scoped", "open_payout_amount_minor"),
      settlement_entries: countDataset(settlementEntries.rows, "scoped"),
      settlement_cursors: countDataset(settlementCursors.rows, "scoped"),
      bank_cash_snapshots: countDataset(bankCashSnapshots.rows, "scoped"),
      bank_statements: countDataset(bankStatements.rows, "scoped"),
      bank_exposures: countDataset(bankExposures.rows, "scoped"),
      arc_provider_accounts: countDataset(providerAccounts.rows, "scoped"),
      bank_cash_pools: countDataset(bankCashPools.rows, "scoped")
    };

    assertCanonicalInventoryHasNoUncontrolledMoney({
      invoices: invoices.rows,
      refunds: refunds.rows,
      ledgerAccounts: ledgerAccounts.rows,
      ledgerTransactions: ledgerTransactions.rows,
      ledgerEntries: ledgerEntries.rows,
      walletRows,
      sourceLotRows,
      openPayouts: openPayouts.rows,
      settlementEntries: settlementEntries.rows,
      bankCashSnapshots: bankCashSnapshots.rows,
      bankStatements: bankStatements.rows,
      bankExposures: bankExposures.rows
    });

    const snapshot: FinancialInventorySnapshot = {
      generatedAt: input.generatedAt,
      targetIdentityDigest: input.targetIdentityDigest,
      datasets,
      orderLifecycleEvidence: [],
      paymentAttemptLifecycleEvidence: [],
      currentSubscriptions: currentSubscriptions.rows.map((row) => ({
        subscriptionId: row.subscription_id,
        ownerUserId: row.owner_user_id,
        status: row.status
      })),
      paidInvoices: paidInvoices.rows.map((row) => ({
        invoiceId: row.invoice_id,
        ownerUserId: row.owner_user_id
      })),
      journalTotals: ledgerEntries.rows.map((row) => ({
        currency: row.currency,
        debitAmountMinor: row.debit_amount_minor,
        creditAmountMinor: row.credit_amount_minor
      })),
      unbalancedJournals: unbalancedJournals.rows.map((row) => ({
        transactionId: row.transaction_id,
        currency: row.currency,
        debitAmountMinor: row.debit_amount_minor,
        creditAmountMinor: row.credit_amount_minor
      })),
      openingAccountBalances: ledgerAccounts.rows.map((row) => ({
        accountId: row.account_id,
        accountType: row.account_type,
        astrologerUserId: row.astrologer_user_id,
        balanceBucket: row.balance_bucket,
        currency: row.currency,
        debitAmountMinor: row.debit_amount_minor,
        creditAmountMinor: row.credit_amount_minor
      })),
      walletProjections: walletRows,
      sourceLotBalances: sourceLotRows,
      providerControls: [],
      bankControls: [],
      monetaryControls: canonicalZeroMonetaryControls()
    };

    await queryable.query("COMMIT");
    return snapshot;
  } catch (error) {
    await queryable.query("ROLLBACK");
    throw error;
  }
}

function monetaryDataset(
  rows: readonly MonetaryAggregateRow[],
  scope: FinancialInventoryDatasetFact["scope"],
  measure: string
): FinancialInventoryDatasetFact {
  return {
    availability: "present",
    scope,
    rowCount: sumIntegerStrings(rows.map((row) => row.row_count)),
    ids: rows.flatMap((row) => row.ids).sort(compareText),
    monetaryTotals: rows.map((row) => ({
      measure,
      currency: row.currency,
      amountMinor: row.amount_minor
    }))
  };
}

function planDataset(rows: readonly PlanAggregateRow[]): FinancialInventoryDatasetFact {
  return {
    availability: "present",
    scope: "not_applicable",
    rowCount: sumIntegerStrings(rows.map((row) => row.row_count)),
    ids: rows.flatMap((row) => row.ids).sort(compareText),
    monetaryTotals: rows.flatMap((row) => [
      {
        measure: "monthly_price_minor_sum",
        currency: row.currency,
        amountMinor: row.monthly_amount_minor
      },
      {
        measure: "yearly_price_minor_sum",
        currency: row.currency,
        amountMinor: row.yearly_amount_minor
      }
    ])
  };
}

function orderDataset(
  rows: readonly FinancialInventoryOrderLifecycleEvidence[]
): FinancialInventoryDatasetFact {
  return {
    availability: "present",
    scope: "legacy_unscoped",
    rowCount: String(rows.length),
    ids: rows.map((row) => row.orderId).sort(compareText),
    monetaryTotals: sumOrderLifecycleTotals(rows)
  };
}

function paymentAttemptDataset(
  rows: readonly FinancialInventoryPaymentAttemptLifecycleEvidence[]
): FinancialInventoryDatasetFact {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0n) + BigInt(row.amountMinor));
  }
  return {
    availability: "present",
    scope: "legacy_unscoped",
    rowCount: String(rows.length),
    ids: rows.map((row) => row.paymentAttemptId).sort(compareText),
    monetaryTotals: [...totals]
      .sort(([left], [right]) => compareText(left, right))
      .map(([currency, amount]) => ({
        measure: "payment_attempt_amount_minor",
        currency,
        amountMinor: String(amount)
      }))
  };
}

function sumOrderLifecycleTotals(
  rows: readonly FinancialInventoryOrderLifecycleEvidence[]
): FinancialInventoryDatasetFact["monetaryTotals"] {
  const totals = new Map<string, { gross: bigint; platformFee: bigint; astrologerNet: bigint }>();
  for (const row of rows) {
    const total = totals.get(row.currency) ?? {
      gross: 0n,
      platformFee: 0n,
      astrologerNet: 0n
    };
    total.gross += BigInt(row.grossAmountMinor);
    total.platformFee += BigInt(row.platformFeeAmountMinor);
    total.astrologerNet += BigInt(row.astrologerNetAmountMinor);
    totals.set(row.currency, total);
  }
  return [...totals]
    .sort(([left], [right]) => compareText(left, right))
    .flatMap(([currency, total]) => [
      { measure: "gross_amount_minor", currency, amountMinor: String(total.gross) },
      {
        measure: "platform_fee_amount_minor",
        currency,
        amountMinor: String(total.platformFee)
      },
      {
        measure: "astrologer_net_amount_minor",
        currency,
        amountMinor: String(total.astrologerNet)
      }
    ]);
}

function toOrderLifecycleEvidence(
  row: OrderLifecycleRow
): FinancialInventoryOrderLifecycleEvidence {
  return {
    orderId: row.order_id,
    orderStatus: row.order_status as FinancialInventoryOrderLifecycleEvidence["orderStatus"],
    lifecycleStage:
      row.lifecycle_stage as FinancialInventoryOrderLifecycleEvidence["lifecycleStage"],
    currency: row.currency,
    grossAmountMinor: row.gross_amount_minor,
    platformFeeAmountMinor: row.platform_fee_amount_minor,
    astrologerNetAmountMinor: row.astrologer_net_amount_minor
  };
}

function toPaymentAttemptLifecycleEvidence(
  row: PaymentAttemptLifecycleRow
): FinancialInventoryPaymentAttemptLifecycleEvidence {
  return {
    paymentAttemptId: row.payment_attempt_id,
    orderId: row.order_id,
    paymentStatus:
      row.payment_status as FinancialInventoryPaymentAttemptLifecycleEvidence["paymentStatus"],
    lifecycleStage:
      row.lifecycle_stage as FinancialInventoryPaymentAttemptLifecycleEvidence["lifecycleStage"],
    currency: row.currency,
    amountMinor: row.amount_minor
  };
}

function countDataset(
  rows: readonly CountAggregateRow[],
  scope: FinancialInventoryDatasetFact["scope"]
): FinancialInventoryDatasetFact {
  return {
    availability: "present",
    scope,
    rowCount: sumIntegerStrings(rows.map((row) => row.row_count)),
    ids: rows.flatMap((row) => row.ids).sort(compareText),
    monetaryTotals: []
  };
}

function absentDataset(
  scope: FinancialInventoryDatasetFact["scope"]
): FinancialInventoryDatasetFact {
  return {
    availability: "absent_in_legacy_schema",
    scope,
    rowCount: "0",
    ids: [],
    monetaryTotals: []
  };
}

function emptyCanonicalDataset(): FinancialInventoryDatasetFact {
  return {
    availability: "present",
    scope: "scoped",
    rowCount: "0",
    ids: [],
    monetaryTotals: []
  };
}

function walletDataset(
  rows: readonly FinancialInventoryWalletBalance[]
): FinancialInventoryDatasetFact {
  return {
    availability: "present",
    scope: "scoped",
    rowCount: String(rows.length),
    ids: rows
      .map((row) => `${row.astrologerUserId}:${row.balanceBucket}:${row.currency}`)
      .sort(compareText),
    monetaryTotals: sumWalletTotals(rows)
  };
}

function canonicalZeroMonetaryControls(): readonly FinancialInventoryMonetaryControl[] {
  return ["capture", "provider_fee", "refund", "chargeback", "merchant_payout"].map((code) => ({
    code: code as FinancialInventoryMonetaryControl["code"],
    availability: "available" as const,
    currency: "RUB",
    expectedAmountMinor: "0",
    observedAmountMinor: "0"
  }));
}

function assertCanonicalInventoryHasNoUncontrolledMoney(input: {
  readonly invoices: readonly MonetaryAggregateRow[];
  readonly refunds: readonly MonetaryAggregateRow[];
  readonly ledgerAccounts: readonly OpeningAccountRow[];
  readonly ledgerTransactions: readonly CountAggregateRow[];
  readonly ledgerEntries: readonly LedgerEntryAggregateRow[];
  readonly walletRows: readonly FinancialInventoryWalletBalance[];
  readonly sourceLotRows: readonly FinancialInventoryWalletBalance[];
  readonly openPayouts: readonly MonetaryAggregateRow[];
  readonly settlementEntries: readonly CountAggregateRow[];
  readonly bankCashSnapshots: readonly CountAggregateRow[];
  readonly bankStatements: readonly CountAggregateRow[];
  readonly bankExposures: readonly CountAggregateRow[];
}): void {
  const nonEmpty = [
    ["invoices", hasRows(input.invoices)],
    ["refunds", hasRows(input.refunds)],
    ["ledgerAccounts", hasNonZeroAccountBalance(input.ledgerAccounts)],
    ["ledgerTransactions", hasRows(input.ledgerTransactions)],
    ["ledgerEntries", hasRows(input.ledgerEntries)],
    ["walletRows", hasNonZeroWalletBalance(input.walletRows)],
    ["sourceLotRows", hasNonZeroWalletBalance(input.sourceLotRows)],
    ["openPayouts", hasRows(input.openPayouts)],
    ["settlementEntries", hasRows(input.settlementEntries)],
    ["bankCashSnapshots", hasRows(input.bankCashSnapshots)],
    ["bankStatements", hasRows(input.bankStatements)],
    ["bankExposures", hasRows(input.bankExposures)]
  ]
    .filter(([, nonEmpty]) => nonEmpty)
    .map(([name]) => name);
  if (nonEmpty.length > 0) {
    throw new Error(
      `Current canonical finance inventory requires operational reconciliation controls before it can certify non-zero state: ${nonEmpty.join(", ")}`
    );
  }
}

function hasRows(rows: readonly { readonly row_count: string }[]): boolean {
  return rows.some((row) => row.row_count !== "0");
}

function hasNonZeroAccountBalance(rows: readonly OpeningAccountRow[]): boolean {
  return rows.some(
    (row) => row.debit_amount_minor !== "0" || row.credit_amount_minor !== "0"
  );
}

function hasNonZeroWalletBalance(rows: readonly FinancialInventoryWalletBalance[]): boolean {
  return rows.some((row) => row.amountMinor !== "0");
}

function toWalletBalance(row: WalletProjectionRow): FinancialInventoryWalletBalance {
  return {
    astrologerUserId: row.astrologer_user_id,
    balanceBucket: row.balance_bucket,
    currency: row.currency,
    amountMinor: row.amount_minor
  };
}

function sumWalletTotals(
  rows: readonly FinancialInventoryWalletBalance[]
): FinancialInventoryDatasetFact["monetaryTotals"] {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0n) + BigInt(row.amountMinor));
  }
  return [...totals]
    .sort(([left], [right]) => compareText(left, right))
    .map(([currency, amount]) => ({
      measure: "wallet_projection_amount_minor",
      currency,
      amountMinor: String(amount)
    }));
}

function toLegacyMonetaryControls(
  rows: readonly MonetaryControlRow[]
): readonly FinancialInventoryMonetaryControl[] {
  const captureControls: readonly FinancialInventoryMonetaryControl[] =
    rows.length === 0
      ? [
          {
            code: "capture",
            availability: "available",
            currency: "RUB",
            expectedAmountMinor: "0",
            observedAmountMinor: "0"
          }
        ]
      : rows.map((row) => ({
          code: "capture" as const,
          availability: "available" as const,
          currency: row.currency,
          expectedAmountMinor: row.expected_amount_minor,
          observedAmountMinor: row.observed_amount_minor
        }));
  return [
    ...captureControls,
    unavailableMonetaryControl("provider_fee"),
    unavailableMonetaryControl("refund"),
    unavailableMonetaryControl("chargeback"),
    unavailableMonetaryControl("merchant_payout")
  ];
}

function unavailableMonetaryControl(
  code: Exclude<FinancialInventoryMonetaryControl["code"], "capture">
): FinancialInventoryMonetaryControl {
  return {
    code,
    availability: "unavailable_in_legacy_schema",
    currency: null,
    expectedAmountMinor: null,
    observedAmountMinor: null
  };
}

function sumIntegerStrings(values: readonly string[]): string {
  return String(values.reduce((total, value) => total + BigInt(value), 0n));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
