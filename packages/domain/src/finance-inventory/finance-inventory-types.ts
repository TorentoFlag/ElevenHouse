export const financialInventoryDatasetCodes = [
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
] as const;

export type FinancialInventoryDatasetCode = (typeof financialInventoryDatasetCodes)[number];

export const financialInventoryMonetaryControlCodes = [
  "capture",
  "provider_fee",
  "refund",
  "chargeback",
  "merchant_payout"
] as const;

export type FinancialInventoryMonetaryControlCode =
  (typeof financialInventoryMonetaryControlCodes)[number];
export type FinancialInventoryDatasetAvailability = "present" | "absent_in_legacy_schema";
export type FinancialInventoryDatasetScope = "not_applicable" | "scoped" | "legacy_unscoped";

export type FinancialInventoryMonetaryTotal = {
  readonly measure: string;
  readonly currency: string;
  readonly amountMinor: string;
};

export type FinancialInventoryMonetaryControl =
  | {
      readonly code: FinancialInventoryMonetaryControlCode;
      readonly availability: "available";
      readonly currency: string;
      readonly expectedAmountMinor: string;
      readonly observedAmountMinor: string;
    }
  | {
      readonly code: FinancialInventoryMonetaryControlCode;
      readonly availability: "unavailable_in_legacy_schema";
      readonly currency: null;
      readonly expectedAmountMinor: null;
      readonly observedAmountMinor: null;
    };

export type FinancialInventoryDatasetFact = {
  readonly availability: FinancialInventoryDatasetAvailability;
  readonly scope: FinancialInventoryDatasetScope;
  readonly rowCount: string;
  readonly ids: readonly string[];
  readonly monetaryTotals: readonly FinancialInventoryMonetaryTotal[];
};

export type FinancialInventoryDatasetFacts = Readonly<
  Record<FinancialInventoryDatasetCode, FinancialInventoryDatasetFact>
>;

export type FinancialInventoryOpeningAccountBalance = {
  readonly accountId: string;
  readonly accountType: string;
  readonly astrologerUserId: string | null;
  readonly balanceBucket: string | null;
  readonly currency: string;
  readonly debitAmountMinor: string;
  readonly creditAmountMinor: string;
};

export type FinancialInventoryWalletBalance = {
  readonly astrologerUserId: string;
  readonly balanceBucket: string;
  readonly currency: string;
  readonly amountMinor: string;
};

export type FinancialInventoryLifecycleStage = "authorized" | "captured_like";

export type FinancialInventoryOrderLifecycleEvidence = {
  readonly orderId: string;
  readonly orderStatus:
    | "draft"
    | "pending_payment"
    | "paid"
    | "fulfilled"
    | "cancelled"
    | "expired"
    | "partially_refunded"
    | "refunded"
    | "chargeback";
  readonly lifecycleStage: FinancialInventoryLifecycleStage;
  readonly currency: string;
  readonly grossAmountMinor: string;
  readonly platformFeeAmountMinor: string;
  readonly astrologerNetAmountMinor: string;
};

export type FinancialInventoryPaymentAttemptLifecycleEvidence = {
  readonly paymentAttemptId: string;
  readonly orderId: string;
  readonly paymentStatus:
    | "authorized"
    | "captured"
    | "settled"
    | "partially_refunded"
    | "refunded"
    | "chargeback";
  readonly lifecycleStage: FinancialInventoryLifecycleStage;
  readonly currency: string;
  readonly amountMinor: string;
};

export type FinancialInventorySnapshot = {
  readonly generatedAt: string;
  readonly targetIdentityDigest: string;
  readonly datasets: FinancialInventoryDatasetFacts;
  readonly orderLifecycleEvidence: readonly FinancialInventoryOrderLifecycleEvidence[];
  readonly paymentAttemptLifecycleEvidence: readonly FinancialInventoryPaymentAttemptLifecycleEvidence[];
  readonly currentSubscriptions: readonly {
    readonly subscriptionId: string;
    readonly ownerUserId: string;
    readonly status: string;
  }[];
  readonly paidInvoices: readonly {
    readonly invoiceId: string;
    readonly ownerUserId: string;
  }[];
  readonly journalTotals: readonly {
    readonly currency: string;
    readonly debitAmountMinor: string;
    readonly creditAmountMinor: string;
  }[];
  readonly unbalancedJournals: readonly {
    readonly transactionId: string;
    readonly currency: string;
    readonly debitAmountMinor: string;
    readonly creditAmountMinor: string;
  }[];
  readonly openingAccountBalances: readonly FinancialInventoryOpeningAccountBalance[];
  readonly walletProjections: readonly FinancialInventoryWalletBalance[];
  readonly sourceLotBalances: readonly FinancialInventoryWalletBalance[];
  readonly providerControls: readonly {
    readonly arcProviderAccountId: string;
    readonly currency: string;
    readonly internalAmountMinor: string;
    readonly providerEvidenceAmountMinor: string;
  }[];
  readonly bankControls: readonly {
    readonly bankCashPoolId: string;
    readonly currency: string;
    readonly internalAmountMinor: string;
    readonly statementAndExposureAmountMinor: string;
  }[];
  readonly monetaryControls: readonly FinancialInventoryMonetaryControl[];
};

export type FinancialInventoryDiscrepancyCode =
  | "missing_required_dataset"
  | "legacy_scope_unknown"
  | "dataset_count_mismatch"
  | "order_payment_lifecycle_mismatch"
  | "order_payment_economics_mismatch"
  | "journal_currency_imbalance"
  | "journal_transaction_imbalance"
  | "ledger_account_inventory_mismatch"
  | "opening_trial_balance_imbalance"
  | "opening_trial_balance_journal_mismatch"
  | "wallet_liability_mismatch"
  | "wallet_source_lot_mismatch"
  | "provider_control_missing"
  | "provider_control_mismatch"
  | "bank_control_missing"
  | "bank_control_mismatch"
  | "monetary_control_missing"
  | "monetary_control_unavailable"
  | "monetary_control_mismatch";

export type FinancialInventoryDiscrepancy = {
  readonly code: FinancialInventoryDiscrepancyCode;
  readonly path: readonly string[];
  readonly currency: string | null;
  readonly expectedAmountMinor: string | null;
  readonly observedAmountMinor: string | null;
  readonly detail: string;
};

export type FinancialInventoryReport = {
  readonly schemaVersion: "finance-inventory-report.v1";
  readonly generatedAt: string;
  readonly targetIdentityDigest: string;
  readonly status: "passed" | "blocked";
  readonly datasetFacts: readonly (FinancialInventoryDatasetFact & {
    readonly code: FinancialInventoryDatasetCode;
  })[];
  readonly subscriberEvidence: {
    readonly currentSubscriptionIds: readonly string[];
    readonly currentSubscriberUserIds: readonly string[];
    readonly paidInvoiceIds: readonly string[];
    readonly paidInvoiceOwnerUserIds: readonly string[];
  };
  readonly orderLifecycleEvidence: readonly FinancialInventoryOrderLifecycleEvidence[];
  readonly paymentAttemptLifecycleEvidence: readonly FinancialInventoryPaymentAttemptLifecycleEvidence[];
  readonly journalTotals: readonly {
    readonly currency: string;
    readonly debitAmountMinor: string;
    readonly creditAmountMinor: string;
    readonly deltaAmountMinor: string;
    readonly balanced: boolean;
  }[];
  readonly candidateOpeningTrialBalance: readonly (FinancialInventoryOpeningAccountBalance & {
    readonly netDebitAmountMinor: string;
  })[];
  readonly openingTrialBalanceTotals: readonly {
    readonly currency: string;
    readonly debitAmountMinor: string;
    readonly creditAmountMinor: string;
    readonly deltaAmountMinor: string;
    readonly balanced: boolean;
  }[];
  readonly walletControls: readonly {
    readonly astrologerUserId: string;
    readonly balanceBucket: string;
    readonly currency: string;
    readonly liabilityAmountMinor: string;
    readonly walletAmountMinor: string;
    readonly sourceLotAmountMinor: string | null;
  }[];
  readonly providerControls: FinancialInventorySnapshot["providerControls"];
  readonly bankControls: FinancialInventorySnapshot["bankControls"];
  readonly monetaryControls: FinancialInventorySnapshot["monetaryControls"];
  readonly discrepancies: readonly FinancialInventoryDiscrepancy[];
};

export class FinancialInventoryIntegrityError extends Error {
  override readonly name = "FinancialInventoryIntegrityError";
}
