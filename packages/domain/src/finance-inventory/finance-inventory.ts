import { Temporal } from "@js-temporal/polyfill";
import { stableJson, type CanonicalJson } from "../calculations/canonical-json";
export * from "./finance-inventory-types";
import {
  FinancialInventoryIntegrityError,
  financialInventoryDatasetCodes,
  financialInventoryMonetaryControlCodes,
  type FinancialInventoryDatasetCode,
  type FinancialInventoryDatasetFact,
  type FinancialInventoryDiscrepancy,
  type FinancialInventoryMonetaryControl,
  type FinancialInventoryMonetaryControlCode,
  type FinancialInventoryOpeningAccountBalance,
  type FinancialInventoryOrderLifecycleEvidence,
  type FinancialInventoryPaymentAttemptLifecycleEvidence,
  type FinancialInventoryReport,
  type FinancialInventorySnapshot,
  type FinancialInventoryWalletBalance
} from "./finance-inventory-types";

export function buildFinancialInventoryReport(
  snapshot: FinancialInventorySnapshot
): FinancialInventoryReport {
  assertIsoInstant(snapshot.generatedAt, "generatedAt");
  assertTargetIdentityDigest(snapshot.targetIdentityDigest);
  assertUniqueKeys(snapshot.journalTotals, (row) => row.currency, "journalTotals");
  assertUniqueKeys(
    snapshot.unbalancedJournals,
    (row) => `${row.transactionId}/${row.currency}`,
    "unbalancedJournals"
  );
  assertUniqueKeys(
    snapshot.openingAccountBalances,
    (row) => row.accountId,
    "openingAccountBalances"
  );
  assertUniqueKeys(
    snapshot.currentSubscriptions,
    (row) => row.subscriptionId,
    "currentSubscriptions"
  );
  assertUniqueKeys(snapshot.paidInvoices, (row) => row.invoiceId, "paidInvoices");
  assertUniqueKeys(
    snapshot.providerControls,
    (row) => `${row.arcProviderAccountId}/${row.currency}`,
    "providerControls"
  );
  assertUniqueKeys(
    snapshot.bankControls,
    (row) => `${row.bankCashPoolId}/${row.currency}`,
    "bankControls"
  );
  assertUniqueKeys(
    snapshot.monetaryControls,
    (row) => `${row.code}/${row.currency ?? "all"}`,
    "monetaryControls"
  );

  const discrepancies: FinancialInventoryDiscrepancy[] = [];
  const datasetFacts = financialInventoryDatasetCodes.map((code) => {
    const fact = snapshot.datasets[code];
    validateDatasetFact(code, fact);
    const normalized = {
      code,
      availability: fact.availability,
      scope: fact.scope,
      rowCount: fact.rowCount,
      ids: [...fact.ids].sort(compareText),
      monetaryTotals: [...fact.monetaryTotals]
        .map((total) => ({ ...total }))
        .sort(
          (left, right) =>
            compareText(left.measure, right.measure) || compareText(left.currency, right.currency)
        )
    } as const;

    if (fact.availability === "absent_in_legacy_schema") {
      discrepancies.push({
        code: "missing_required_dataset",
        path: ["datasets", code],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `${code} is absent from the legacy schema`
      });
    }
    if (fact.scope === "legacy_unscoped") {
      discrepancies.push({
        code: "legacy_scope_unknown",
        path: ["datasets", code],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `${code} has no immutable target provider-account or bank-pool scope`
      });
    }
    if (BigInt(fact.rowCount) !== BigInt(fact.ids.length)) {
      discrepancies.push({
        code: "dataset_count_mismatch",
        path: ["datasets", code, "rowCount"],
        currency: null,
        expectedAmountMinor: fact.rowCount,
        observedAmountMinor: String(fact.ids.length),
        detail: `${code} row count does not equal its inventoried ID count`
      });
    }
    return normalized;
  });
  const orderLifecycleEvidence = normalizeOrderLifecycleEvidence(snapshot.orderLifecycleEvidence);
  const paymentAttemptLifecycleEvidence = normalizePaymentAttemptLifecycleEvidence(
    snapshot.paymentAttemptLifecycleEvidence
  );
  assertLifecycleEvidenceConsistency(
    snapshot,
    orderLifecycleEvidence,
    paymentAttemptLifecycleEvidence,
    discrepancies
  );

  const journalTotals = [...snapshot.journalTotals]
    .sort((left, right) => compareText(left.currency, right.currency))
    .map((total) => {
      const debit = parseUnsignedMinor(total.debitAmountMinor, "journalTotals.debitAmountMinor");
      const credit = parseUnsignedMinor(total.creditAmountMinor, "journalTotals.creditAmountMinor");
      const delta = debit - credit;
      if (delta !== 0n) {
        discrepancies.push({
          code: "journal_currency_imbalance",
          path: ["journalTotals", total.currency],
          currency: total.currency,
          expectedAmountMinor: total.debitAmountMinor,
          observedAmountMinor: total.creditAmountMinor,
          detail: `Journal debits and credits differ by ${absolute(delta)} minor units`
        });
      }
      return {
        currency: total.currency,
        debitAmountMinor: total.debitAmountMinor,
        creditAmountMinor: total.creditAmountMinor,
        deltaAmountMinor: String(delta),
        balanced: delta === 0n
      };
    });

  for (const journal of [...snapshot.unbalancedJournals].sort(compareUnbalancedJournal)) {
    parseUnsignedMinor(journal.debitAmountMinor, "unbalancedJournals.debitAmountMinor");
    parseUnsignedMinor(journal.creditAmountMinor, "unbalancedJournals.creditAmountMinor");
    discrepancies.push({
      code: "journal_transaction_imbalance",
      path: ["unbalancedJournals", journal.transactionId, journal.currency],
      currency: journal.currency,
      expectedAmountMinor: journal.debitAmountMinor,
      observedAmountMinor: journal.creditAmountMinor,
      detail: `Ledger transaction ${journal.transactionId} is not balanced`
    });
  }

  const candidateOpeningTrialBalance = [...snapshot.openingAccountBalances]
    .map((balance) => {
      const debit = parseUnsignedMinor(
        balance.debitAmountMinor,
        "openingAccountBalances.debitAmountMinor"
      );
      const credit = parseUnsignedMinor(
        balance.creditAmountMinor,
        "openingAccountBalances.creditAmountMinor"
      );
      return { ...balance, netDebitAmountMinor: String(debit - credit) };
    })
    .sort(compareOpeningBalance);
  const openingTrialBalanceTotals = reconcileOpeningTrialBalance(
    snapshot,
    candidateOpeningTrialBalance,
    journalTotals,
    discrepancies
  );

  const walletControls = buildWalletControls(snapshot, candidateOpeningTrialBalance, discrepancies);
  collectProviderDiscrepancies(snapshot, discrepancies);
  collectBankDiscrepancies(snapshot, discrepancies);
  collectMonetaryDiscrepancies(snapshot, discrepancies);

  return {
    schemaVersion: "finance-inventory-report.v1",
    generatedAt: snapshot.generatedAt,
    targetIdentityDigest: snapshot.targetIdentityDigest,
    status: discrepancies.length === 0 ? "passed" : "blocked",
    datasetFacts,
    orderLifecycleEvidence,
    paymentAttemptLifecycleEvidence,
    subscriberEvidence: {
      currentSubscriptionIds: sortedUnique(
        snapshot.currentSubscriptions.map((subscription) => subscription.subscriptionId)
      ),
      currentSubscriberUserIds: sortedUnique(
        snapshot.currentSubscriptions.map((subscription) => subscription.ownerUserId)
      ),
      paidInvoiceIds: sortedUnique(snapshot.paidInvoices.map((invoice) => invoice.invoiceId)),
      paidInvoiceOwnerUserIds: sortedUnique(
        snapshot.paidInvoices.map((invoice) => invoice.ownerUserId)
      )
    },
    journalTotals,
    candidateOpeningTrialBalance,
    openingTrialBalanceTotals,
    walletControls,
    providerControls: [...snapshot.providerControls].sort(compareProviderControl),
    bankControls: [...snapshot.bankControls].sort(compareBankControl),
    monetaryControls: [...snapshot.monetaryControls].sort(compareMonetaryControl),
    discrepancies
  };
}

export function serializeFinancialInventoryReport(report: FinancialInventoryReport): string {
  return stableJson(report as unknown as CanonicalJson);
}

const selectedOrderStatuses = new Set<string>([
  "draft",
  "pending_payment",
  "paid",
  "fulfilled",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
  "chargeback"
]);

const capturedOrderLifecycleStatuses = new Set<string>([
  "paid",
  "fulfilled",
  "partially_refunded",
  "refunded",
  "chargeback"
]);

const selectedPaymentAttemptStatuses = new Set<string>([
  "authorized",
  "captured",
  "settled",
  "partially_refunded",
  "refunded",
  "chargeback"
]);

function normalizeOrderLifecycleEvidence(
  rows: readonly FinancialInventoryOrderLifecycleEvidence[]
): readonly FinancialInventoryOrderLifecycleEvidence[] {
  assertUniqueKeys(rows, (row) => row.orderId, "orderLifecycleEvidence");
  return rows
    .map((row) => {
      if (!row.orderId) {
        throw new FinancialInventoryIntegrityError("orderLifecycleEvidence.orderId is required");
      }
      if (!selectedOrderStatuses.has(row.orderStatus)) {
        throw new FinancialInventoryIntegrityError(
          `orderLifecycleEvidence contains unsupported order status ${row.orderStatus}`
        );
      }
      assertLifecycleStage(row.lifecycleStage, "orderLifecycleEvidence.lifecycleStage");
      assertCurrency(row.currency, "orderLifecycleEvidence.currency");
      const gross = parseUnsignedMinor(
        row.grossAmountMinor,
        "orderLifecycleEvidence.grossAmountMinor"
      );
      const platformFee = parseUnsignedMinor(
        row.platformFeeAmountMinor,
        "orderLifecycleEvidence.platformFeeAmountMinor"
      );
      const astrologerNet = parseUnsignedMinor(
        row.astrologerNetAmountMinor,
        "orderLifecycleEvidence.astrologerNetAmountMinor"
      );
      if (gross !== platformFee + astrologerNet) {
        throw new FinancialInventoryIntegrityError(
          `orderLifecycleEvidence order ${row.orderId} has inconsistent economics`
        );
      }
      return { ...row };
    })
    .sort((left, right) => compareText(left.orderId, right.orderId));
}

function normalizePaymentAttemptLifecycleEvidence(
  rows: readonly FinancialInventoryPaymentAttemptLifecycleEvidence[]
): readonly FinancialInventoryPaymentAttemptLifecycleEvidence[] {
  assertUniqueKeys(rows, (row) => row.paymentAttemptId, "paymentAttemptLifecycleEvidence");
  return rows
    .map((row) => {
      if (!row.paymentAttemptId || !row.orderId) {
        throw new FinancialInventoryIntegrityError(
          "paymentAttemptLifecycleEvidence paymentAttemptId and orderId are required"
        );
      }
      if (!selectedPaymentAttemptStatuses.has(row.paymentStatus)) {
        throw new FinancialInventoryIntegrityError(
          `paymentAttemptLifecycleEvidence contains unsupported payment status ${row.paymentStatus}`
        );
      }
      assertLifecycleStage(row.lifecycleStage, "paymentAttemptLifecycleEvidence.lifecycleStage");
      const expectedStage = row.paymentStatus === "authorized" ? "authorized" : "captured_like";
      if (row.lifecycleStage !== expectedStage) {
        throw new FinancialInventoryIntegrityError(
          `paymentAttemptLifecycleEvidence attempt ${row.paymentAttemptId} has inconsistent lifecycle stage`
        );
      }
      assertCurrency(row.currency, "paymentAttemptLifecycleEvidence.currency");
      parseUnsignedMinor(row.amountMinor, "paymentAttemptLifecycleEvidence.amountMinor");
      return { ...row };
    })
    .sort((left, right) => compareText(left.paymentAttemptId, right.paymentAttemptId));
}

function assertLifecycleEvidenceConsistency(
  snapshot: FinancialInventorySnapshot,
  orders: readonly FinancialInventoryOrderLifecycleEvidence[],
  paymentAttempts: readonly FinancialInventoryPaymentAttemptLifecycleEvidence[],
  discrepancies: FinancialInventoryDiscrepancy[]
): void {
  assertEvidenceIds(
    "orderLifecycleEvidence",
    snapshot.datasets.orders.ids,
    orders.map((row) => row.orderId)
  );
  assertEvidenceIds(
    "paymentAttemptLifecycleEvidence",
    snapshot.datasets.payment_attempts.ids,
    paymentAttempts.map((row) => row.paymentAttemptId)
  );

  const ordersById = new Map(orders.map((order) => [order.orderId, order]));
  const attemptCountsByOrder = new Map<
    string,
    { authorizedCount: number; capturedCount: number }
  >();
  for (const attempt of paymentAttempts) {
    const order = ordersById.get(attempt.orderId);
    if (!order) {
      throw new FinancialInventoryIntegrityError(
        `paymentAttemptLifecycleEvidence references unknown order ${attempt.orderId}`
      );
    }
    if (attempt.currency !== order.currency) {
      discrepancies.push({
        code: "order_payment_economics_mismatch",
        path: ["paymentAttemptLifecycleEvidence", attempt.paymentAttemptId, "currency"],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `Payment attempt ${attempt.paymentAttemptId} currency ${attempt.currency} does not equal linked order currency ${order.currency}`
      });
    } else if (attempt.amountMinor !== order.grossAmountMinor) {
      discrepancies.push({
        code: "order_payment_economics_mismatch",
        path: ["paymentAttemptLifecycleEvidence", attempt.paymentAttemptId, "amountMinor"],
        currency: order.currency,
        expectedAmountMinor: order.grossAmountMinor,
        observedAmountMinor: attempt.amountMinor,
        detail: `Payment attempt ${attempt.paymentAttemptId} amount does not equal linked order gross`
      });
    }
    const counts = attemptCountsByOrder.get(attempt.orderId) ?? {
      authorizedCount: 0,
      capturedCount: 0
    };
    if (attempt.lifecycleStage === "authorized") counts.authorizedCount += 1;
    else counts.capturedCount += 1;
    attemptCountsByOrder.set(attempt.orderId, counts);
  }
  for (const order of orders) {
    const attemptCounts = attemptCountsByOrder.get(order.orderId) ?? {
      authorizedCount: 0,
      capturedCount: 0
    };
    const capturedOrderStatus = capturedOrderLifecycleStatuses.has(order.orderStatus);
    const capturedAttempt = attemptCounts.capturedCount > 0;
    const authorizedAttempt = attemptCounts.authorizedCount > 0;
    const capturedEvidence = capturedOrderStatus || capturedAttempt;
    if (!capturedEvidence && !authorizedAttempt) {
      throw new FinancialInventoryIntegrityError(
        `orderLifecycleEvidence order ${order.orderId} has no authorized or captured evidence`
      );
    }
    const expectedStage = capturedEvidence ? "captured_like" : "authorized";
    if (order.lifecycleStage !== expectedStage) {
      throw new FinancialInventoryIntegrityError(
        `orderLifecycleEvidence order ${order.orderId} has inconsistent lifecycle stage`
      );
    }
    const lifecycleAligned =
      (order.orderStatus === "pending_payment" &&
        attemptCounts.authorizedCount === 1 &&
        attemptCounts.capturedCount === 0) ||
      (capturedOrderStatus &&
        attemptCounts.authorizedCount === 0 &&
        attemptCounts.capturedCount === 1);
    if (!lifecycleAligned) {
      discrepancies.push({
        code: "order_payment_lifecycle_mismatch",
        path: ["orderLifecycleEvidence", order.orderId, "orderStatus"],
        currency: order.currency,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `Order status ${order.orderStatus} and payment-attempt lifecycle evidence disagree`
      });
    }
  }

  assertEvidenceTotals("orders", snapshot.datasets.orders, buildOrderLifecycleTotals(orders));
  assertEvidenceTotals(
    "payment_attempts",
    snapshot.datasets.payment_attempts,
    buildPaymentAttemptLifecycleTotals(paymentAttempts)
  );
}

function assertEvidenceIds(
  path: string,
  datasetIds: readonly string[],
  evidenceIds: readonly string[]
): void {
  const expected = [...datasetIds].sort(compareText);
  const observed = [...evidenceIds].sort(compareText);
  if (!sameStrings(expected, observed)) {
    throw new FinancialInventoryIntegrityError(
      `${path} IDs do not match the aggregate dataset inventory`
    );
  }
}

function buildOrderLifecycleTotals(
  rows: readonly FinancialInventoryOrderLifecycleEvidence[]
): ReadonlyMap<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    addEvidenceTotal(totals, "gross_amount_minor", row.currency, row.grossAmountMinor);
    addEvidenceTotal(totals, "platform_fee_amount_minor", row.currency, row.platformFeeAmountMinor);
    addEvidenceTotal(
      totals,
      "astrologer_net_amount_minor",
      row.currency,
      row.astrologerNetAmountMinor
    );
  }
  return totals;
}

function buildPaymentAttemptLifecycleTotals(
  rows: readonly FinancialInventoryPaymentAttemptLifecycleEvidence[]
): ReadonlyMap<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    addEvidenceTotal(totals, "payment_attempt_amount_minor", row.currency, row.amountMinor);
  }
  return totals;
}

function addEvidenceTotal(
  totals: Map<string, bigint>,
  measure: string,
  currency: string,
  value: string
): void {
  const key = `${measure}/${currency}`;
  totals.set(key, (totals.get(key) ?? 0n) + BigInt(value));
}

function assertEvidenceTotals(
  path: string,
  dataset: FinancialInventoryDatasetFact,
  expectedTotals: ReadonlyMap<string, bigint>
): void {
  const expected = [...expectedTotals].map(([key, amount]) => `${key}=${amount}`).sort(compareText);
  const observed = dataset.monetaryTotals
    .map((total) => `${total.measure}/${total.currency}=${total.amountMinor}`)
    .sort(compareText);
  if (!sameStrings(expected, observed)) {
    throw new FinancialInventoryIntegrityError(
      `${path} lifecycle evidence totals do not match the aggregate dataset inventory`
    );
  }
}

function assertLifecycleStage(value: string, path: string): void {
  if (value !== "authorized" && value !== "captured_like") {
    throw new FinancialInventoryIntegrityError(`${path} is unsupported`);
  }
}

function assertCurrency(value: string, path: string): void {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new FinancialInventoryIntegrityError(
      `${path} must be an explicit ISO-style currency code`
    );
  }
}

function reconcileOpeningTrialBalance(
  snapshot: FinancialInventorySnapshot,
  openingBalances: FinancialInventoryReport["candidateOpeningTrialBalance"],
  journalTotals: FinancialInventoryReport["journalTotals"],
  discrepancies: FinancialInventoryDiscrepancy[]
): FinancialInventoryReport["openingTrialBalanceTotals"] {
  const inventoriedAccountIds = [...snapshot.datasets.ledger_accounts.ids].sort(compareText);
  const openingAccountIds = openingBalances.map((balance) => balance.accountId).sort(compareText);
  if (!sameStrings(inventoriedAccountIds, openingAccountIds)) {
    discrepancies.push({
      code: "ledger_account_inventory_mismatch",
      path: ["candidateOpeningTrialBalance", "accountIds"],
      currency: null,
      expectedAmountMinor: String(inventoriedAccountIds.length),
      observedAmountMinor: String(openingAccountIds.length),
      detail: "Opening trial balance account IDs do not match the ledger account inventory"
    });
  }

  const totals = new Map<string, { debit: bigint; credit: bigint }>();
  for (const balance of openingBalances) {
    const current = totals.get(balance.currency) ?? { debit: 0n, credit: 0n };
    current.debit += parseUnsignedMinor(
      balance.debitAmountMinor,
      "candidateOpeningTrialBalance.debitAmountMinor"
    );
    current.credit += parseUnsignedMinor(
      balance.creditAmountMinor,
      "candidateOpeningTrialBalance.creditAmountMinor"
    );
    totals.set(balance.currency, current);
  }

  const openingTotals = [...totals]
    .sort(([left], [right]) => compareText(left, right))
    .map(([currency, total]) => {
      const delta = total.debit - total.credit;
      if (delta !== 0n) {
        discrepancies.push({
          code: "opening_trial_balance_imbalance",
          path: ["openingTrialBalanceTotals", currency],
          currency,
          expectedAmountMinor: String(total.debit),
          observedAmountMinor: String(total.credit),
          detail: `Opening trial balance debits and credits differ by ${absolute(delta)} minor units`
        });
      }
      return {
        currency,
        debitAmountMinor: String(total.debit),
        creditAmountMinor: String(total.credit),
        deltaAmountMinor: String(delta),
        balanced: delta === 0n
      };
    });

  const openingByCurrency = new Map(openingTotals.map((total) => [total.currency, total]));
  const journalByCurrency = new Map(journalTotals.map((total) => [total.currency, total]));
  for (const currency of sortedUnique([...openingByCurrency.keys(), ...journalByCurrency.keys()])) {
    const opening = openingByCurrency.get(currency);
    const journal = journalByCurrency.get(currency);
    const openingDebit = opening?.debitAmountMinor ?? "0";
    const openingCredit = opening?.creditAmountMinor ?? "0";
    const journalDebit = journal?.debitAmountMinor ?? "0";
    const journalCredit = journal?.creditAmountMinor ?? "0";
    if (openingDebit !== journalDebit) {
      discrepancies.push({
        code: "opening_trial_balance_journal_mismatch",
        path: ["openingTrialBalanceTotals", currency, "debit"],
        currency,
        expectedAmountMinor: journalDebit,
        observedAmountMinor: openingDebit,
        detail: "Opening trial balance debit total does not equal the journal debit total"
      });
    }
    if (openingCredit !== journalCredit) {
      discrepancies.push({
        code: "opening_trial_balance_journal_mismatch",
        path: ["openingTrialBalanceTotals", currency, "credit"],
        currency,
        expectedAmountMinor: journalCredit,
        observedAmountMinor: openingCredit,
        detail: "Opening trial balance credit total does not equal the journal credit total"
      });
    }
  }
  return openingTotals;
}

function buildWalletControls(
  snapshot: FinancialInventorySnapshot,
  openingBalances: FinancialInventoryReport["candidateOpeningTrialBalance"],
  discrepancies: FinancialInventoryDiscrepancy[]
): FinancialInventoryReport["walletControls"] {
  const liability = new Map<string, bigint>();
  for (const balance of openingBalances) {
    if (!balance.astrologerUserId || !balance.balanceBucket) continue;
    const key = walletKey(balance.astrologerUserId, balance.balanceBucket, balance.currency);
    const debit = parseUnsignedMinor(balance.debitAmountMinor, "opening debit");
    const credit = parseUnsignedMinor(balance.creditAmountMinor, "opening credit");
    const amount = isDebitNormalWalletAccount(balance.accountType)
      ? debit - credit
      : credit - debit;
    if (liability.has(key)) {
      throw new FinancialInventoryIntegrityError(
        `opening liability controls contains duplicate key ${key.replaceAll("\u0000", "/")}`
      );
    }
    liability.set(key, amount);
  }
  const wallet = sumWalletRows(snapshot.walletProjections, "walletProjections");
  const sourceLots = sumWalletRows(snapshot.sourceLotBalances, "sourceLotBalances");
  const keys = sortedUnique([...liability.keys(), ...wallet.keys(), ...sourceLots.keys()]);
  const hasSourceLots = snapshot.datasets.wallet_source_lots.availability === "present";

  return keys.map((key) => {
    const [astrologerUserId, balanceBucket, currency] = key.split("\u0000");
    if (!astrologerUserId || !balanceBucket || !currency) {
      throw new FinancialInventoryIntegrityError("Invalid wallet control key");
    }
    const liabilityAmount = liability.get(key) ?? 0n;
    const walletAmount = wallet.get(key) ?? 0n;
    const sourceLotAmount = hasSourceLots ? (sourceLots.get(key) ?? 0n) : null;

    if (liabilityAmount !== walletAmount) {
      discrepancies.push({
        code: "wallet_liability_mismatch",
        path: ["walletControls", astrologerUserId, balanceBucket, currency],
        currency,
        expectedAmountMinor: String(liabilityAmount),
        observedAmountMinor: String(walletAmount),
        detail: "Wallet projection does not equal the matching liability account"
      });
    }
    if (sourceLotAmount !== null && walletAmount !== sourceLotAmount) {
      discrepancies.push({
        code: "wallet_source_lot_mismatch",
        path: ["walletControls", astrologerUserId, balanceBucket, currency],
        currency,
        expectedAmountMinor: String(walletAmount),
        observedAmountMinor: String(sourceLotAmount),
        detail: "Wallet projection does not equal remaining source lots"
      });
    }
    return {
      astrologerUserId,
      balanceBucket,
      currency,
      liabilityAmountMinor: String(liabilityAmount),
      walletAmountMinor: String(walletAmount),
      sourceLotAmountMinor: sourceLotAmount === null ? null : String(sourceLotAmount)
    };
  });
}

function collectProviderDiscrepancies(
  snapshot: FinancialInventorySnapshot,
  discrepancies: FinancialInventoryDiscrepancy[]
): void {
  const providerAccountIds = new Set(snapshot.datasets.arc_provider_accounts.ids);
  const controlledAccountIds = new Set(
    snapshot.providerControls.map((control) => control.arcProviderAccountId)
  );
  if (snapshot.datasets.arc_provider_accounts.availability === "present") {
    for (const accountId of [...providerAccountIds].sort(compareText)) {
      if (controlledAccountIds.has(accountId)) continue;
      discrepancies.push({
        code: "provider_control_missing",
        path: ["providerControls", accountId],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `ArcPay provider account ${accountId} has no control total`
      });
    }
  }
  for (const control of [...snapshot.providerControls].sort(compareProviderControl)) {
    if (!providerAccountIds.has(control.arcProviderAccountId)) {
      throw new FinancialInventoryIntegrityError(
        `providerControls references unknown ArcPay provider account ${control.arcProviderAccountId}`
      );
    }
    const internal = parseSignedMinor(
      control.internalAmountMinor,
      "providerControls.internalAmountMinor"
    );
    const evidence = parseSignedMinor(
      control.providerEvidenceAmountMinor,
      "providerControls.providerEvidenceAmountMinor"
    );
    if (internal === evidence) continue;
    discrepancies.push({
      code: "provider_control_mismatch",
      path: ["providerControls", control.arcProviderAccountId, control.currency],
      currency: control.currency,
      expectedAmountMinor: control.internalAmountMinor,
      observedAmountMinor: control.providerEvidenceAmountMinor,
      detail: `Provider control differs by ${absolute(internal - evidence)} minor units`
    });
  }
}

function collectBankDiscrepancies(
  snapshot: FinancialInventorySnapshot,
  discrepancies: FinancialInventoryDiscrepancy[]
): void {
  const bankCashPoolIds = new Set(snapshot.datasets.bank_cash_pools.ids);
  const controlledPoolIds = new Set(snapshot.bankControls.map((control) => control.bankCashPoolId));
  if (snapshot.datasets.bank_cash_pools.availability === "present") {
    for (const cashPoolId of [...bankCashPoolIds].sort(compareText)) {
      if (controlledPoolIds.has(cashPoolId)) continue;
      discrepancies.push({
        code: "bank_control_missing",
        path: ["bankControls", cashPoolId],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `Bank cash pool ${cashPoolId} has no control total`
      });
    }
  }
  for (const control of [...snapshot.bankControls].sort(compareBankControl)) {
    if (!bankCashPoolIds.has(control.bankCashPoolId)) {
      throw new FinancialInventoryIntegrityError(
        `bankControls references unknown bank cash pool ${control.bankCashPoolId}`
      );
    }
    const internal = parseSignedMinor(
      control.internalAmountMinor,
      "bankControls.internalAmountMinor"
    );
    const evidence = parseSignedMinor(
      control.statementAndExposureAmountMinor,
      "bankControls.statementAndExposureAmountMinor"
    );
    if (internal === evidence) continue;
    discrepancies.push({
      code: "bank_control_mismatch",
      path: ["bankControls", control.bankCashPoolId, control.currency],
      currency: control.currency,
      expectedAmountMinor: control.internalAmountMinor,
      observedAmountMinor: control.statementAndExposureAmountMinor,
      detail: `Bank control differs by ${absolute(internal - evidence)} minor units`
    });
  }
}

function collectMonetaryDiscrepancies(
  snapshot: FinancialInventorySnapshot,
  discrepancies: FinancialInventoryDiscrepancy[]
): void {
  const knownCodes = new Set<FinancialInventoryMonetaryControlCode>(
    financialInventoryMonetaryControlCodes
  );
  const controlsByCode = new Map<
    FinancialInventoryMonetaryControlCode,
    FinancialInventoryMonetaryControl[]
  >();
  for (const control of snapshot.monetaryControls) {
    if (!knownCodes.has(control.code)) {
      throw new FinancialInventoryIntegrityError(
        `monetaryControls contains unknown code ${control.code}`
      );
    }
    const controls = controlsByCode.get(control.code) ?? [];
    controls.push(control);
    controlsByCode.set(control.code, controls);
  }
  for (const code of financialInventoryMonetaryControlCodes) {
    if (!controlsByCode.has(code)) {
      discrepancies.push({
        code: "monetary_control_missing",
        path: ["monetaryControls", code],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `${code} control is missing`
      });
    }
  }

  for (const control of [...snapshot.monetaryControls].sort(compareMonetaryControl)) {
    const rawAvailability = (control as { readonly availability: string }).availability;
    if (rawAvailability !== "available" && rawAvailability !== "unavailable_in_legacy_schema") {
      throw new FinancialInventoryIntegrityError(
        `${control.code} has an unknown monetary control availability`
      );
    }
    if (control.availability === "unavailable_in_legacy_schema") {
      const unavailable = control as {
        readonly currency: unknown;
        readonly expectedAmountMinor: unknown;
        readonly observedAmountMinor: unknown;
      };
      if (
        unavailable.currency !== null ||
        unavailable.expectedAmountMinor !== null ||
        unavailable.observedAmountMinor !== null
      ) {
        throw new FinancialInventoryIntegrityError(
          `${control.code} unavailable control must not contain guessed monetary values`
        );
      }
      if ((controlsByCode.get(control.code)?.length ?? 0) !== 1) {
        throw new FinancialInventoryIntegrityError(
          `${control.code} cannot mix unavailable and currency-scoped control facts`
        );
      }
      discrepancies.push({
        code: "monetary_control_unavailable",
        path: ["monetaryControls", control.code],
        currency: null,
        expectedAmountMinor: null,
        observedAmountMinor: null,
        detail: `${control.code} control evidence is unavailable in the legacy schema`
      });
      continue;
    }
    if (!/^[A-Z]{3}$/.test(control.currency)) {
      throw new FinancialInventoryIntegrityError(
        `${control.code} control currency must be an explicit ISO-style currency code`
      );
    }
    const expected = parseUnsignedMinor(
      control.expectedAmountMinor,
      "monetaryControls.expectedAmountMinor"
    );
    const observed = parseUnsignedMinor(
      control.observedAmountMinor,
      "monetaryControls.observedAmountMinor"
    );
    if (expected === observed) continue;
    discrepancies.push({
      code: "monetary_control_mismatch",
      path: ["monetaryControls", control.code, control.currency],
      currency: control.currency,
      expectedAmountMinor: control.expectedAmountMinor,
      observedAmountMinor: control.observedAmountMinor,
      detail: `${control.code} differs by ${absolute(expected - observed)} minor units`
    });
  }
}

function sumWalletRows(
  rows: readonly FinancialInventoryWalletBalance[],
  path: string
): ReadonlyMap<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const key = walletKey(row.astrologerUserId, row.balanceBucket, row.currency);
    if (totals.has(key)) {
      throw new FinancialInventoryIntegrityError(
        `${path} contains duplicate key ${key.replaceAll("\u0000", "/")}`
      );
    }
    const amount = parseUnsignedMinor(row.amountMinor, `${path}.amountMinor`);
    totals.set(key, amount);
  }
  return totals;
}

function validateDatasetFact(
  code: FinancialInventoryDatasetCode,
  fact: FinancialInventoryDatasetFact
): void {
  if (!fact) throw new FinancialInventoryIntegrityError(`Missing dataset fact: ${code}`);
  if (!isCanonicalUnsignedInteger(fact.rowCount)) {
    throw new FinancialInventoryIntegrityError(
      `${code}.rowCount must be a canonical unsigned integer string`
    );
  }
  if (new Set(fact.ids).size !== fact.ids.length) {
    throw new FinancialInventoryIntegrityError(`${code}.ids contains a duplicate`);
  }
  const totalKeys = new Set<string>();
  for (const total of fact.monetaryTotals) {
    parseUnsignedMinor(total.amountMinor, `${code}.monetaryTotals.amountMinor`);
    if (!/^[a-z][a-z0-9_]*$/.test(total.measure)) {
      throw new FinancialInventoryIntegrityError(
        `${code}.monetaryTotals.measure must be a stable machine code`
      );
    }
    const key = `${total.measure}/${total.currency}`;
    if (totalKeys.has(key)) {
      throw new FinancialInventoryIntegrityError(
        `${code}.monetaryTotals contains duplicate measure/currency ${key}`
      );
    }
    totalKeys.add(key);
  }
}

function parseUnsignedMinor(value: string, path: string): bigint {
  if (!isCanonicalUnsignedInteger(value)) {
    throw new FinancialInventoryIntegrityError(
      `${path} must be a canonical unsigned integer string`
    );
  }
  return BigInt(value);
}

function parseSignedMinor(value: string, path: string): bigint {
  if (!/^(?:0|-?[1-9]\d*)$/.test(value)) {
    throw new FinancialInventoryIntegrityError(`${path} must be a canonical integer string`);
  }
  return BigInt(value);
}

function isCanonicalUnsignedInteger(value: string): boolean {
  return /^(?:0|[1-9]\d*)$/.test(value);
}

function assertIsoInstant(value: string, path: string): void {
  try {
    Temporal.Instant.from(value);
  } catch {
    throw new FinancialInventoryIntegrityError(`${path} must be a valid ISO instant`);
  }
}

function assertTargetIdentityDigest(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new FinancialInventoryIntegrityError(
      "targetIdentityDigest must be a lowercase sha256 digest"
    );
  }
}

function assertUniqueKeys<T>(rows: readonly T[], keyOf: (row: T) => string, path: string): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = keyOf(row);
    if (keys.has(key)) {
      throw new FinancialInventoryIntegrityError(`${path} contains duplicate key ${key}`);
    }
    keys.add(key);
  }
}

function absolute(value: bigint): string {
  return String(value < 0n ? -value : value);
}

function walletKey(astrologerUserId: string, balanceBucket: string, currency: string): string {
  return `${astrologerUserId}\u0000${balanceBucket}\u0000${currency}`;
}

function isDebitNormalWalletAccount(accountType: string): boolean {
  return (
    accountType === "astrologer_negative_balance" ||
    accountType === "astrologer_recovery_receivable"
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOpeningBalance(
  left: FinancialInventoryOpeningAccountBalance,
  right: FinancialInventoryOpeningAccountBalance
): number {
  return (
    compareText(left.currency, right.currency) ||
    compareText(left.accountType, right.accountType) ||
    compareText(left.astrologerUserId ?? "", right.astrologerUserId ?? "") ||
    compareText(left.accountId, right.accountId)
  );
}

function compareUnbalancedJournal(
  left: FinancialInventorySnapshot["unbalancedJournals"][number],
  right: FinancialInventorySnapshot["unbalancedJournals"][number]
): number {
  return (
    compareText(left.currency, right.currency) ||
    compareText(left.transactionId, right.transactionId)
  );
}

function compareProviderControl(
  left: FinancialInventorySnapshot["providerControls"][number],
  right: FinancialInventorySnapshot["providerControls"][number]
): number {
  return (
    compareText(left.currency, right.currency) ||
    compareText(left.arcProviderAccountId, right.arcProviderAccountId)
  );
}

function compareBankControl(
  left: FinancialInventorySnapshot["bankControls"][number],
  right: FinancialInventorySnapshot["bankControls"][number]
): number {
  return (
    compareText(left.currency, right.currency) ||
    compareText(left.bankCashPoolId, right.bankCashPoolId)
  );
}

function compareMonetaryControl(
  left: FinancialInventorySnapshot["monetaryControls"][number],
  right: FinancialInventorySnapshot["monetaryControls"][number]
): number {
  return (
    compareText(left.code, right.code) || compareText(left.currency ?? "", right.currency ?? "")
  );
}
