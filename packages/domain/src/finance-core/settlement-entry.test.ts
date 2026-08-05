import { describe, expect, it } from "vitest";
import {
  createLosslessSettlementEntry,
  createProviderSettlementEntryKey,
  FinanceSettlementCursorIntegrityError,
  serializeProviderSettlementEntryKey
} from "./settlement-cursor";

const providerAccount = Object.freeze({
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-v3",
  identityVersion: 3
});

describe("lossless settlement ledger entry", () => {
  it("deduplicates by exact provider identity and immutable provider entry id", () => {
    const base = createProviderSettlementEntryKey({
      providerAccount,
      providerEntryId: "ledger-entry-1"
    });
    const otherSeries = createProviderSettlementEntryKey({
      providerAccount: { ...providerAccount, seriesId: "arc-series-secondary" },
      providerEntryId: "ledger-entry-1"
    });
    const replacementIdentity = createProviderSettlementEntryKey({
      providerAccount: {
        ...providerAccount,
        providerAccountId: "arc-account-v4",
        identityVersion: 4
      },
      providerEntryId: "ledger-entry-1"
    });

    expect(serializeProviderSettlementEntryKey(base)).toBe(
      '["arc-series-primary","arc-account-v3",3,"ledger-entry-1"]'
    );
    expect(serializeProviderSettlementEntryKey(base)).not.toBe(
      serializeProviderSettlementEntryKey(otherSeries)
    );
    expect(serializeProviderSettlementEntryKey(base)).not.toBe(
      serializeProviderSettlementEntryKey(replacementIdentity)
    );
  });

  it("preserves every documented ledger field and signed int64 values without JS numbers", () => {
    const entry = createLosslessSettlementEntry(fullEntryInput());

    expect(entry).toEqual(fullEntryInput());
    expect(entry.amountMinor).toBe("-9223372036854775808");
    expect(entry.feeAmountMinor).toBe("9223372036854775807");
    expect(entry.balanceAfterMinor).toBe("-1");
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.key)).toBe(true);
  });

  it("represents every optional OpenAPI ledger field explicitly as null", () => {
    const entry = createLosslessSettlementEntry({
      ...fullEntryInput(),
      feeAmountMinor: null,
      balanceAfterMinor: null,
      occurredAt: null,
      organizationId: null,
      terminalId: null,
      bankTerminalId: null,
      bankCode: null,
      bankRrn: null,
      bankAuthCode: null,
      bankInternalReference: null,
      settlementStatus: null
    });

    expect(entry.feeAmountMinor).toBeNull();
    expect(entry.settlementStatus).toBeNull();
  });

  it.each([
    ["unsafe JS number", { amountMinor: 9_007_199_254_740_992 }],
    ["above int64", { amountMinor: "9223372036854775808" }],
    ["below int64", { amountMinor: "-9223372036854775809" }],
    ["leading zero", { amountMinor: "01" }],
    ["negative zero", { amountMinor: "-0" }],
    ["invalid fee", { feeAmountMinor: "1.25" }],
    ["invalid instant", { occurredAt: "not-an-instant" }],
    ["invalid digest", { rawPayloadDigest: "sha256:nope" }],
    ["undocumented payout status", { payoutStatus: "paid" }],
    ["generic metadata", { metadata: { guessed: true } }]
  ])("rejects %s instead of weakening the ingestion contract", (_label, patch) => {
    expect(() => createLosslessSettlementEntry({ ...fullEntryInput(), ...patch })).toThrow(
      FinanceSettlementCursorIntegrityError
    );
  });

  it("rejects accessor-backed entries without invoking getters", () => {
    let getterCalls = 0;
    const input = fullEntryInput() as Record<string, unknown>;
    Object.defineProperty(input, "amountMinor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });

    expect(() => createLosslessSettlementEntry(input)).toThrow(
      FinanceSettlementCursorIntegrityError
    );
    expect(getterCalls).toBe(0);
  });
});

function fullEntryInput() {
  return {
    key: createProviderSettlementEntryKey({
      providerAccount,
      providerEntryId: "ledger-entry-1"
    }),
    amountMinor: "-9223372036854775808",
    currency: "RUB",
    direction: "future_direction",
    entryType: "future_entry_type",
    referenceType: "future_reference_type",
    referenceId: "provider-reference-1",
    feeAmountMinor: "9223372036854775807",
    balanceAfterMinor: "-1",
    occurredAt: "2026-08-03T09:59:00.000Z",
    organizationId: "organization-1",
    terminalId: "terminal-1",
    bankTerminalId: "bank-terminal-1",
    bankCode: "bank-code-1",
    bankRrn: "123456789012",
    bankAuthCode: "AUTH01",
    bankInternalReference: "bank-internal-reference-1",
    settlementStatus: "future_settlement_status",
    rawPayloadDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  } as const;
}
