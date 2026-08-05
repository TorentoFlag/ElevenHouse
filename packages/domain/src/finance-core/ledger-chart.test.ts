import { describe, expect, it } from "vitest";
import {
  createFinanceLedgerAccountRef,
  financeLedgerAccountCodeValues,
  financeLedgerChart,
  FinanceLedgerChartIntegrityError,
  serializeFinanceLedgerAccountRef
} from "./ledger-chart";

describe("finance ledger chart", () => {
  it("defines the exact approved zero-opening 22-account operational chart", () => {
    expect(financeLedgerAccountCodeValues).toEqual([
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
    ]);
    expect(Object.keys(financeLedgerChart)).toEqual(financeLedgerAccountCodeValues);
    expect(financeLedgerChart).toMatchObject({
      arc_provider_clearing: {
        accountClass: "asset",
        normalSide: "debit",
        scopeKind: "arc_provider_account"
      },
      arc_to_bank_clearing: {
        accountClass: "asset",
        normalSide: "debit",
        scopeKind: "arc_provider_account_and_bank_cash_pool"
      },
      bank_cash: {
        accountClass: "asset",
        normalSide: "debit",
        scopeKind: "bank_cash_pool"
      },
      astrologer_recovery_receivable: {
        accountClass: "asset",
        normalSide: "debit",
        scopeKind: "astrologer"
      },
      payout_inflight_refund_bridge: {
        accountClass: "control",
        normalSide: "debit",
        scopeKind: "refund_and_payout"
      },
      chargeback_principal_suspense: {
        accountClass: "control",
        normalSide: "debit",
        scopeKind: "arc_provider_account"
      },
      astrologer_pending: {
        accountClass: "liability",
        normalSide: "credit",
        scopeKind: "astrologer"
      },
      platform_commission_deferred: {
        accountClass: "liability",
        normalSide: "credit",
        scopeKind: "platform"
      },
      bank_outbound_clearing: {
        accountClass: "control",
        normalSide: "credit",
        scopeKind: "bank_cash_pool"
      },
      platform_commission_revenue: {
        accountClass: "income",
        normalSide: "credit",
        scopeKind: "platform"
      },
      provider_fee_expense: {
        accountClass: "expense",
        normalSide: "debit",
        scopeKind: "platform"
      },
      bank_unmatched_debit_suspense: {
        accountClass: "control",
        normalSide: "debit",
        scopeKind: "bank_cash_pool"
      }
    });
    for (const forbidden of [
      "platform_clearing",
      "platform_revenue",
      "payout_clearing",
      "manual_adjustment",
      "bank_opening_control"
    ]) {
      expect(financeLedgerChart).not.toHaveProperty(forbidden);
    }
    expect(Object.isFrozen(financeLedgerAccountCodeValues)).toBe(true);
  });

  it.each([
    {
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    },
    {
      code: "arc_to_bank_clearing",
      arcProviderAccountId: "arc-account-1",
      bankCashPoolId: "bank-pool-1",
      currency: "RUB"
    },
    { code: "bank_cash", bankCashPoolId: "bank-pool-1", currency: "RUB" },
    {
      code: "astrologer_pending",
      astrologerUserId: "astrologer-1",
      currency: "RUB"
    },
    {
      code: "payout_inflight_refund_bridge",
      refundId: "refund-1",
      payoutRequestId: "payout-1",
      currency: "RUB"
    },
    { code: "platform_commission_deferred", currency: "RUB" }
  ])("accepts the exact $code account scope", (input) => {
    expect(createFinanceLedgerAccountRef(input)).toEqual(input);
    expect(Object.isFrozen(createFinanceLedgerAccountRef(input))).toBe(true);
  });

  it.each([
    { code: "arc_provider_clearing", currency: "RUB" },
    {
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      bankCashPoolId: "extra",
      currency: "RUB"
    },
    { code: "bank_cash", arcProviderAccountId: "wrong", currency: "RUB" },
    {
      code: "payout_inflight_refund_bridge",
      refundId: "refund-1",
      currency: "RUB"
    },
    {
      code: "platform_commission_deferred",
      astrologerUserId: "extra",
      currency: "RUB"
    },
    { code: "manual_adjustment", currency: "RUB" },
    { code: "bank_cash", bankCashPoolId: "bank-pool-1", currency: "USD" },
    { code: "bank_cash", bankCashPoolId: "", currency: "RUB" }
  ])("rejects invalid or over-scoped account input: %o", (input) => {
    expect(() => createFinanceLedgerAccountRef(input)).toThrow(FinanceLedgerChartIntegrityError);
  });

  it("rejects accessor-backed account records without invoking getters", () => {
    let getterCalls = 0;
    const input = {
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    } as Record<string, unknown>;
    Object.defineProperty(input, "code", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    expect(() => createFinanceLedgerAccountRef(input)).toThrow(FinanceLedgerChartIntegrityError);
    expect(getterCalls).toBe(0);
  });

  it("projects accepted non-enumerable data properties explicitly", () => {
    const input = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of Object.entries({
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    })) {
      Object.defineProperty(input, key, { value, enumerable: false });
    }

    expect(createFinanceLedgerAccountRef(input)).toEqual({
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    });
  });

  it("projects account descriptors without invoking Proxy get traps", () => {
    let getCalls = 0;
    const proxy = new Proxy(
      {
        code: "arc_provider_clearing" as const,
        arcProviderAccountId: "arc-account-1",
        currency: "RUB" as const
      },
      {
        get() {
          getCalls += 1;
          throw new Error("must not execute");
        }
      }
    );

    expect(createFinanceLedgerAccountRef(proxy)).toEqual({
      code: "arc_provider_clearing",
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    });
    expect(serializeFinanceLedgerAccountRef(proxy)).toBe(
      '["arc_provider_clearing","arc-account-1","RUB"]'
    );
    expect(getCalls).toBe(0);
  });

  it("rejects an own __proto__ data key without installing or invoking it", () => {
    let getterCalls = 0;
    const inherited = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(inherited, "code", {
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    const input = {
      arcProviderAccountId: "arc-account-1",
      currency: "RUB"
    } as Record<string, unknown>;
    Object.defineProperty(input, "__proto__", {
      value: inherited,
      enumerable: true
    });

    expect(() => createFinanceLedgerAccountRef(input)).toThrow(FinanceLedgerChartIntegrityError);
    expect(getterCalls).toBe(0);
  });
});
