import { describe, expect, it } from "vitest";
import {
  createFinanceSourceKey,
  FinanceSourceKeyIntegrityError,
  financeSourceOperationsByKind,
  serializeFinanceSourceKey
} from "./finance-source-key";

describe("finance source key", () => {
  it("defines only typed source operations derived from the approved posting matrix", () => {
    expect(financeSourceOperationsByKind).toEqual({
      bank: [
        "payout_debit_matched",
        "payout_return_credit_matched",
        "unknown_debit_recorded",
        "unknown_credit_recorded",
        "suspense_reclassified"
      ],
      order: ["sale_captured", "commission_earned"],
      platform_invoice: ["captured", "revenue_earned"],
      provider_fee: ["confirmed", "returned"],
      reserve: ["hold_released", "released"],
      payout: ["requested", "released", "paid", "returned_without_debit"],
      refund: ["approved", "confirmed", "failed", "bridge_payout_failed", "bridge_payout_paid"],
      chargeback: ["confirmed", "principal_allocated", "recovery_collected", "won"],
      settlement: ["merchant_payout_confirmed", "merchant_payout_bank_matched"],
      correction: ["reversal", "replacement"]
    });
  });

  it("serializes kind, source id, and operation collision-free", () => {
    const first = createFinanceSourceKey({
      kind: "order",
      sourceId: "a|b",
      operation: "sale_captured"
    });
    const second = createFinanceSourceKey({
      kind: "order",
      sourceId: "a",
      operation: "sale_captured"
    });

    expect(first).toEqual({ kind: "order", sourceId: "a|b", operation: "sale_captured" });
    expect(serializeFinanceSourceKey(first)).toBe('["order","a|b","sale_captured"]');
    expect(serializeFinanceSourceKey(first)).not.toBe(serializeFinanceSourceKey(second));
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    { kind: "order", sourceId: "", operation: "sale_captured" },
    { kind: "order", sourceId: "order-1", operation: "paid" },
    { kind: "bank", sourceId: "launch", operation: "opening_recorded" },
    { kind: "manual", sourceId: "source-1", operation: "adjustment" },
    {
      kind: "order",
      sourceId: "order-1",
      operation: "sale_captured",
      hidden: "extra"
    }
  ])("rejects malformed or untyped source input: %o", (input) => {
    expect(() => createFinanceSourceKey(input)).toThrow(FinanceSourceKeyIntegrityError);
  });

  it("rejects accessor-backed source records without invoking getters", () => {
    let getterCalls = 0;
    const input = {
      kind: "order",
      sourceId: "order-1",
      operation: "sale_captured"
    } as Record<string, unknown>;
    Object.defineProperty(input, "sourceId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    expect(() => createFinanceSourceKey(input)).toThrow(FinanceSourceKeyIntegrityError);
    expect(getterCalls).toBe(0);
  });

  it("validates structurally typed values again before serialization", () => {
    let getterCalls = 0;
    const hostile = {
      kind: "order",
      sourceId: "order-1",
      operation: "sale_captured"
    } as Record<string, unknown>;
    Object.defineProperty(hostile, "kind", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    expect(() => serializeFinanceSourceKey(hostile as never)).toThrow(
      FinanceSourceKeyIntegrityError
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects proxies before invoking their get traps", () => {
    let getCalls = 0;
    const proxy = new Proxy(
      {
        kind: "order" as const,
        sourceId: "order-1",
        operation: "sale_captured" as const
      },
      {
        get() {
          getCalls += 1;
          throw new Error("must not execute");
        }
      }
    );

    expect(() => createFinanceSourceKey(proxy)).toThrow(FinanceSourceKeyIntegrityError);
    expect(() => serializeFinanceSourceKey(proxy)).toThrow(FinanceSourceKeyIntegrityError);
    expect(getCalls).toBe(0);
  });
});
