import { describe, expect, it } from "vitest";

import {
  BankCashMatchPersistenceError,
  normalizeBankCashMatchCommand
} from "./drizzle-bank-cash-match-uow";

const digest = `sha256:${"a".repeat(64)}`;

function command() {
  return {
    bankCashPoolId: "bank-pool-rub-1",
    currency: "RUB",
    expectedBankLiquidityRevision: "7",
    statementIngestion: {
      kind: "bank_statement_ingestion_commit_receipt",
      receiptId: "statement-receipt-1",
      version: 1,
      canonicalDigest: digest
    },
    matchAuthority: {
      kind: "manual_payout",
      payoutPaid: {
        kind: "online_wallet_payout_paid_receipt",
        receiptId: "paid-receipt-1",
        version: 1,
        canonicalDigest: digest
      }
    },
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "bank-statement-match",
      policyVersion: 1,
      policyDigest: digest,
      maximumRows: 1,
      maximumDecimalDigits: 12,
      maximumArtifactBytes: 1_000_000
    }
  };
}

describe("normalizeBankCashMatchCommand", () => {
  it("accepts only the V2 manual-payout receipt authority", () => {
    expect(normalizeBankCashMatchCommand(command())).toMatchObject({
      bankCashPoolId: "bank-pool-rub-1",
      expectedBankLiquidityRevision: "7",
      payoutPaid: { receiptId: "paid-receipt-1" }
    });
  });

  it("rejects a legacy or broader authority before persistence", () => {
    const invalid = command();
    invalid.matchAuthority = { kind: "merchant_settlement" } as never;
    expect(() => normalizeBankCashMatchCommand(invalid)).toThrow(
      expect.objectContaining<Partial<BankCashMatchPersistenceError>>({ reason: "invalid_command" })
    );
  });

  it("rejects unexpected browser-provided fields", () => {
    const invalid = { ...command(), amountMinor: "5000" };
    expect(() => normalizeBankCashMatchCommand(invalid)).toThrow(
      expect.objectContaining<Partial<BankCashMatchPersistenceError>>({ reason: "invalid_command" })
    );
  });
});
