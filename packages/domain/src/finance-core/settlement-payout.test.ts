import { describe, expect, it } from "vitest";

import {
  createLosslessSettlementPayout,
  createProviderSettlementPayoutKey,
  FinanceSettlementCursorIntegrityError,
  serializeProviderSettlementPayoutKey
} from "./settlement-cursor";

const providerAccount = Object.freeze({
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-v3",
  identityVersion: 3
});

describe("lossless ArcPay merchant payout", () => {
  it("uses exact provider identity plus payout_id and preserves the documented payload", () => {
    const payout = createLosslessSettlementPayout(fullPayoutInput());

    expect(payout).toEqual(fullPayoutInput());
    expect(payout.amountMinor).toBe("9223372036854775807");
    expect(serializeProviderSettlementPayoutKey(payout.key)).toBe(
      '["arc-series-primary","arc-account-v3",3,"merchant-payout-1"]'
    );
    expect(Object.isFrozen(payout)).toBe(true);
    expect(Object.isFrozen(payout.key)).toBe(true);
  });

  it("retains open provider status strings and explicit nullable fields", () => {
    const payout = createLosslessSettlementPayout({
      ...fullPayoutInput(),
      status: "future_provider_status",
      payoutMethod: null,
      bankCode: null,
      bankTerminalId: null,
      providerBankPayoutId: null,
      bankPayoutStatus: null,
      initiatedAt: null,
      completedAt: null,
      failedReason: null
    });

    expect(payout.status).toBe("future_provider_status");
    expect(payout.providerBankPayoutId).toBeNull();
  });

  it.each([
    ["unsafe number", { amountMinor: 9_007_199_254_740_992 }],
    ["non-canonical amount", { amountMinor: "01" }],
    ["out-of-range amount", { amountMinor: "9223372036854775808" }],
    ["invalid instant", { completedAt: "not-an-instant" }],
    ["invalid digest", { rawPayloadDigest: "sha256:nope" }],
    ["astrologer payout identity", { payoutRequestId: "payout-request-1" }],
    ["generic metadata", { metadata: { guessed: true } }]
  ])("rejects %s", (_label, patch) => {
    expect(() => createLosslessSettlementPayout({ ...fullPayoutInput(), ...patch })).toThrow(
      FinanceSettlementCursorIntegrityError
    );
  });

  it("rejects accessor-backed payout facts without invoking getters", () => {
    let getterCalls = 0;
    const input = fullPayoutInput() as Record<string, unknown>;
    Object.defineProperty(input, "amountMinor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    expect(() => createLosslessSettlementPayout(input)).toThrow(
      FinanceSettlementCursorIntegrityError
    );
    expect(getterCalls).toBe(0);
  });
});

function fullPayoutInput() {
  return {
    key: createProviderSettlementPayoutKey({
      providerAccount,
      providerPayoutId: "merchant-payout-1"
    }),
    amountMinor: "9223372036854775807",
    currency: "RUB",
    status: "completed",
    payoutMethod: "wire",
    bankCode: "bank-code-1",
    bankTerminalId: "bank-terminal-1",
    providerBankPayoutId: "wire-1",
    bankPayoutStatus: "completed",
    initiatedAt: "2026-08-03T09:00:00.000Z",
    completedAt: "2026-08-03T09:30:00.000Z",
    failedReason: null,
    rawPayloadDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  } as const;
}
