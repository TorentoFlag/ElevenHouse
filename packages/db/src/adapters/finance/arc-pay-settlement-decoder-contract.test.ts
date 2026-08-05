import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createLosslessSettlementEntry,
  createLosslessSettlementPayout,
  createSettlementPageCheckpointKey,
  digestFinanceCanonicalValueV1,
  serializeSettlementPageCheckpointKey,
  type LosslessSettlementEntry,
  type LosslessSettlementPayout,
  type VerifiedSettlementPageBundle
} from "@elevenhouse/domain/finance-core";
import { describe, expect, expectTypeOf, it } from "vitest";

const providerAccount = Object.freeze({
  seriesId: "arc-live-series",
  providerAccountId: "elevenhouse-primary",
  identityVersion: 3
});

describe("ArcPay settlement decoder to database contract", () => {
  it("keeps ledger and merchant payout pages physically discriminated", () => {
    expectTypeOf<
      Extract<
        VerifiedSettlementPageBundle,
        { stream: "settlement_ledger" }
      >["normalizedEntries"]["rows"]
    >().toEqualTypeOf<readonly LosslessSettlementEntry[]>();
    expectTypeOf<
      Extract<
        VerifiedSettlementPageBundle,
        { stream: "settlement_payouts" }
      >["normalizedEntries"]["rows"]
    >().toEqualTypeOf<readonly LosslessSettlementPayout[]>();

    const ledger = ledgerEntry();
    const payout = merchantPayout();

    expect(ledger).toMatchObject({
      amountMinor: "9223372036854775807",
      feeAmountMinor: "-9223372036854775808",
      balanceAfterMinor: "9007199254740993"
    });
    expect(ledger).not.toHaveProperty("status");
    expect(ledger).not.toHaveProperty("providerBankPayoutId");
    expect(payout).toMatchObject({
      amountMinor: "9223372036854775807",
      status: "provider_completed",
      providerBankPayoutId: "arc-bank-payout-opaque"
    });
    expect(payout).not.toHaveProperty("entryType");
    expect(payout).not.toHaveProperty("referenceId");

    expect(digestFinanceCanonicalValueV1([ledger])).toBe(
      "sha256:5f42ff30fbed95c187c7f2d301bed7fcafdd08e60ee86ae6f8306b35fb5e37e7"
    );
    expect(digestFinanceCanonicalValueV1([payout])).toBe(
      "sha256:de44386984cfb2f174e64c3f0de2ff80c69a8fa32a123e303508919e73af41b8"
    );
  });

  it("serializes the first-page checkpoint with an explicit null cursor", () => {
    const checkpoint = createSettlementPageCheckpointKey({
      cursorKey: { providerAccount, stream: "settlement_ledger" },
      windowGeneration: 7,
      providerPageCursor: null
    });

    expect(serializeSettlementPageCheckpointKey(checkpoint)).toBe(
      '["arc-live-series","elevenhouse-primary",3,"settlement_ledger",7,null]'
    );
    expect(digestFinanceCanonicalValueV1(checkpoint)).toBe(
      "sha256:2ac1fa204cc9454a18fe36b7c936f77294c73ca00f1f4032c9bbecdb97782d3a"
    );
  });

  it("keeps provider transport and money mutation outside both database UoWs", () => {
    const sources = [
      readFileSync(join(__dirname, "drizzle-settlement-cursor-lease-uow.ts"), "utf8"),
      readFileSync(join(__dirname, "drizzle-settlement-batch-ingestion-uow.ts"), "utf8")
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/\bfetch\s*\(/u);
      expect(source).not.toContain("response.json");
      expect(source).not.toMatch(/financeJournal|journalTransaction/u);
      expect(source).not.toMatch(/bank_cash|financeBankCash/u);
    }
  });
});

function ledgerEntry(): LosslessSettlementEntry {
  return createLosslessSettlementEntry({
    key: { providerAccount, providerEntryId: "ledger-entry-opaque" },
    amountMinor: "9223372036854775807",
    currency: "RUB",
    direction: "provider_credit",
    entryType: "provider_defined_entry",
    referenceType: "provider_payment",
    referenceId: "payment-opaque",
    feeAmountMinor: "-9223372036854775808",
    balanceAfterMinor: "9007199254740993",
    occurredAt: "2026-08-04T10:11:12.123456789Z",
    organizationId: "organization-opaque",
    terminalId: null,
    bankTerminalId: "terminal-opaque",
    bankCode: null,
    bankRrn: "rrn-opaque",
    bankAuthCode: null,
    bankInternalReference: "bank-reference-opaque",
    settlementStatus: "provider_status_opaque",
    rawPayloadDigest: digest("1")
  });
}

function merchantPayout(): LosslessSettlementPayout {
  return createLosslessSettlementPayout({
    key: { providerAccount, providerPayoutId: "merchant-payout-opaque" },
    amountMinor: "9223372036854775807",
    currency: "RUB",
    status: "provider_completed",
    payoutMethod: "provider_bank_transfer",
    bankCode: "bank-opaque",
    bankTerminalId: null,
    providerBankPayoutId: "arc-bank-payout-opaque",
    bankPayoutStatus: "provider_bank_completed",
    initiatedAt: "2026-08-04T10:00:00Z",
    completedAt: "2026-08-04T10:10:00Z",
    failedReason: null,
    rawPayloadDigest: digest("2")
  });
}

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
