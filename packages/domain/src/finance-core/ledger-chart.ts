export const financeLedgerAccountCodeValues = Object.freeze([
  "arc_provider_clearing",
  "arc_to_bank_clearing",
  "bank_cash",
  "astrologer_recovery_receivable",
  "payout_inflight_refund_bridge",
  "chargeback_principal_suspense",
  "astrologer_pending",
  "astrologer_available",
  "astrologer_reserved",
  "astrologer_payout_pending",
  "astrologer_refund_pending",
  "platform_commission_deferred",
  "platform_subscription_deferred",
  "bank_outbound_clearing",
  "platform_commission_revenue",
  "platform_subscription_revenue",
  "provider_fee_expense",
  "chargeback_fee_expense",
  "platform_refund_loss",
  "platform_chargeback_loss",
  "bank_unmatched_credit_suspense",
  "bank_unmatched_debit_suspense"
] as const);

export type FinanceLedgerAccountCode = (typeof financeLedgerAccountCodeValues)[number];
export type FinanceLedgerAccountClass = "asset" | "liability" | "income" | "expense" | "control";
export type FinanceLedgerSide = "debit" | "credit";
export type FinanceLedgerAccountScopeKind =
  | "arc_provider_account"
  | "arc_provider_account_and_bank_cash_pool"
  | "bank_cash_pool"
  | "astrologer"
  | "refund_and_payout"
  | "platform";

export type FinanceLedgerChartEntry = {
  readonly code: FinanceLedgerAccountCode;
  readonly accountClass: FinanceLedgerAccountClass;
  readonly normalSide: FinanceLedgerSide;
  readonly scopeKind: FinanceLedgerAccountScopeKind;
};

const chartEntry = (
  code: FinanceLedgerAccountCode,
  accountClass: FinanceLedgerAccountClass,
  normalSide: FinanceLedgerSide,
  scopeKind: FinanceLedgerAccountScopeKind
): FinanceLedgerChartEntry => Object.freeze({ code, accountClass, normalSide, scopeKind });

export const financeLedgerChart = Object.freeze({
  arc_provider_clearing: chartEntry(
    "arc_provider_clearing",
    "asset",
    "debit",
    "arc_provider_account"
  ),
  arc_to_bank_clearing: chartEntry(
    "arc_to_bank_clearing",
    "asset",
    "debit",
    "arc_provider_account_and_bank_cash_pool"
  ),
  bank_cash: chartEntry("bank_cash", "asset", "debit", "bank_cash_pool"),
  astrologer_recovery_receivable: chartEntry(
    "astrologer_recovery_receivable",
    "asset",
    "debit",
    "astrologer"
  ),
  payout_inflight_refund_bridge: chartEntry(
    "payout_inflight_refund_bridge",
    "control",
    "debit",
    "refund_and_payout"
  ),
  chargeback_principal_suspense: chartEntry(
    "chargeback_principal_suspense",
    "control",
    "debit",
    "arc_provider_account"
  ),
  astrologer_pending: chartEntry("astrologer_pending", "liability", "credit", "astrologer"),
  astrologer_available: chartEntry("astrologer_available", "liability", "credit", "astrologer"),
  astrologer_reserved: chartEntry("astrologer_reserved", "liability", "credit", "astrologer"),
  astrologer_payout_pending: chartEntry(
    "astrologer_payout_pending",
    "liability",
    "credit",
    "astrologer"
  ),
  astrologer_refund_pending: chartEntry(
    "astrologer_refund_pending",
    "liability",
    "credit",
    "astrologer"
  ),
  platform_commission_deferred: chartEntry(
    "platform_commission_deferred",
    "liability",
    "credit",
    "platform"
  ),
  platform_subscription_deferred: chartEntry(
    "platform_subscription_deferred",
    "liability",
    "credit",
    "platform"
  ),
  bank_outbound_clearing: chartEntry(
    "bank_outbound_clearing",
    "control",
    "credit",
    "bank_cash_pool"
  ),
  platform_commission_revenue: chartEntry(
    "platform_commission_revenue",
    "income",
    "credit",
    "platform"
  ),
  platform_subscription_revenue: chartEntry(
    "platform_subscription_revenue",
    "income",
    "credit",
    "platform"
  ),
  provider_fee_expense: chartEntry("provider_fee_expense", "expense", "debit", "platform"),
  chargeback_fee_expense: chartEntry("chargeback_fee_expense", "expense", "debit", "platform"),
  platform_refund_loss: chartEntry("platform_refund_loss", "expense", "debit", "platform"),
  platform_chargeback_loss: chartEntry("platform_chargeback_loss", "expense", "debit", "platform"),
  bank_unmatched_credit_suspense: chartEntry(
    "bank_unmatched_credit_suspense",
    "control",
    "credit",
    "bank_cash_pool"
  ),
  bank_unmatched_debit_suspense: chartEntry(
    "bank_unmatched_debit_suspense",
    "control",
    "debit",
    "bank_cash_pool"
  )
} satisfies Record<FinanceLedgerAccountCode, FinanceLedgerChartEntry>);

type ArcProviderAccountOnlyCode = "arc_provider_clearing" | "chargeback_principal_suspense";
type BankCashPoolCode =
  | "bank_cash"
  | "bank_outbound_clearing"
  | "bank_unmatched_credit_suspense"
  | "bank_unmatched_debit_suspense";
type AstrologerCode =
  | "astrologer_recovery_receivable"
  | "astrologer_pending"
  | "astrologer_available"
  | "astrologer_reserved"
  | "astrologer_payout_pending"
  | "astrologer_refund_pending";
type PlatformCode =
  | "platform_commission_deferred"
  | "platform_subscription_deferred"
  | "platform_commission_revenue"
  | "platform_subscription_revenue"
  | "provider_fee_expense"
  | "chargeback_fee_expense"
  | "platform_refund_loss"
  | "platform_chargeback_loss";

export type FinanceLedgerAccountRef =
  | {
      readonly code: ArcProviderAccountOnlyCode;
      readonly arcProviderAccountId: string;
      readonly currency: "RUB";
    }
  | {
      readonly code: "arc_to_bank_clearing";
      readonly arcProviderAccountId: string;
      readonly bankCashPoolId: string;
      readonly currency: "RUB";
    }
  | {
      readonly code: BankCashPoolCode;
      readonly bankCashPoolId: string;
      readonly currency: "RUB";
    }
  | {
      readonly code: AstrologerCode;
      readonly astrologerUserId: string;
      readonly currency: "RUB";
    }
  | {
      readonly code: "payout_inflight_refund_bridge";
      readonly refundId: string;
      readonly payoutRequestId: string;
      readonly currency: "RUB";
    }
  | {
      readonly code: PlatformCode;
      readonly currency: "RUB";
    };

export class FinanceLedgerChartIntegrityError extends Error {
  readonly code = "finance_ledger_chart_integrity_error";

  constructor() {
    super("Finance ledger account does not match the approved operational chart");
    this.name = "FinanceLedgerChartIntegrityError";
  }
}

const accountCodes = new Set<string>(financeLedgerAccountCodeValues);

export function createFinanceLedgerAccountRef(input: unknown): FinanceLedgerAccountRef {
  const candidate = dataRecord(input);
  if (typeof candidate.code !== "string" || !accountCodes.has(candidate.code)) {
    throw new FinanceLedgerChartIntegrityError();
  }
  if (candidate.currency !== "RUB") throw new FinanceLedgerChartIntegrityError();

  const chart = financeLedgerChart[candidate.code as FinanceLedgerAccountCode];
  const scopeKeys = requiredScopeKeys(chart.scopeKind);
  assertExactDataKeys(candidate, ["code", ...scopeKeys, "currency"]);
  for (const key of scopeKeys) {
    if (!isBoundedIdentifier(candidate[key])) throw new FinanceLedgerChartIntegrityError();
  }

  return canonicalAccountRef(candidate.code as FinanceLedgerAccountCode, candidate);
}

export function serializeFinanceLedgerAccountRef(account: FinanceLedgerAccountRef): string {
  const canonical = createFinanceLedgerAccountRef(account);
  const chart = financeLedgerChart[canonical.code];
  return JSON.stringify([
    canonical.code,
    ...requiredScopeKeys(chart.scopeKind).map((key) => canonical[key as keyof typeof canonical]),
    canonical.currency
  ]);
}

function canonicalAccountRef(
  code: FinanceLedgerAccountCode,
  input: Record<string, unknown>
): FinanceLedgerAccountRef {
  switch (financeLedgerChart[code].scopeKind) {
    case "arc_provider_account":
      return Object.freeze({
        code: code as ArcProviderAccountOnlyCode,
        arcProviderAccountId: input.arcProviderAccountId as string,
        currency: "RUB"
      });
    case "arc_provider_account_and_bank_cash_pool":
      return Object.freeze({
        code: "arc_to_bank_clearing",
        arcProviderAccountId: input.arcProviderAccountId as string,
        bankCashPoolId: input.bankCashPoolId as string,
        currency: "RUB"
      });
    case "bank_cash_pool":
      return Object.freeze({
        code: code as BankCashPoolCode,
        bankCashPoolId: input.bankCashPoolId as string,
        currency: "RUB"
      });
    case "astrologer":
      return Object.freeze({
        code: code as AstrologerCode,
        astrologerUserId: input.astrologerUserId as string,
        currency: "RUB"
      });
    case "refund_and_payout":
      return Object.freeze({
        code: "payout_inflight_refund_bridge",
        refundId: input.refundId as string,
        payoutRequestId: input.payoutRequestId as string,
        currency: "RUB"
      });
    case "platform":
      return Object.freeze({ code: code as PlatformCode, currency: "RUB" });
  }
}

function requiredScopeKeys(scopeKind: FinanceLedgerAccountScopeKind): readonly string[] {
  switch (scopeKind) {
    case "arc_provider_account":
      return ["arcProviderAccountId"];
    case "arc_provider_account_and_bank_cash_pool":
      return ["arcProviderAccountId", "bankCashPoolId"];
    case "bank_cash_pool":
      return ["bankCashPoolId"];
    case "astrologer":
      return ["astrologerUserId"];
    case "refund_and_payout":
      return ["refundId", "payoutRequestId"];
    case "platform":
      return [];
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataRecord(value: unknown): Record<string, unknown> {
  try {
    if (!isPlainRecord(value)) throw new FinanceLedgerChartIntegrityError();
    const projected = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new FinanceLedgerChartIntegrityError();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw new FinanceLedgerChartIntegrityError();
      }
      projected[key] = descriptor.value;
    }
    return Object.freeze(projected);
  } catch (error) {
    if (error instanceof FinanceLedgerChartIntegrityError) throw error;
    throw new FinanceLedgerChartIntegrityError();
  }
}

function assertExactDataKeys(value: object, expectedKeys: readonly string[]): void {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length) {
    throw new FinanceLedgerChartIntegrityError();
  }
  const expected = new Set(expectedKeys);
  if (!keys.every((key) => typeof key === "string" && expected.has(key))) {
    throw new FinanceLedgerChartIntegrityError();
  }
}

function isBoundedIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160
  );
}
