import { describe, expect, it } from "vitest";

import {
  MerchantPayoutStatementIngestionPersistenceError,
  normalizeMerchantPayoutStatementIngestionCommand
} from "./drizzle-merchant-payout-statement-ingestion-uow";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("merchant payout statement ingestion command", () => {
  it("rejects a statement whose aggregate authority disagrees with the ArcPay payout", () => {
    expect(() =>
      normalizeMerchantPayoutStatementIngestionCommand({
        batchIngestion: {
          kind: "settlement_batch_ingestion_commit_receipt",
          receiptId: "batch-receipt-1",
          version: 1,
          canonicalDigest: digest
        },
        payoutEvidence: {
          kind: "verified_arc_merchant_payout_evidence",
          providerAccount: providerAccount(),
          merchantPayoutId: "payout-1",
          providerBankPayoutId: "wire-1",
          amountMinor: "9600",
          currency: "RUB",
          outcome: "completed",
          completedAt: "2026-08-04T08:00:00.000Z",
          artifact: artifact("payout-page-artifact"),
          observedAt: "2026-08-04T08:01:00.000Z"
        },
        statementEvidence: {
          kind: "verified_arc_merchant_payout_statement_evidence",
          providerAccount: providerAccount(),
          merchantPayoutId: "payout-1",
          providerBankPayoutId: "wire-1",
          bankReference: "bank-ref-1",
          reportedNetPayoutMinor: "9500",
          currency: "RUB",
          decoderProfileId: "arc-payout-statement-csv-v1",
          decoderProfileVersion: 1,
          decoderProfileDigest: digest,
          decodedPaymentLinesDigest: digest,
          includedPayments: [line(1)],
          artifact: artifact("payout-statement-artifact"),
          observedAt: "2026-08-04T08:02:00.000Z"
        },
        operationEnvelope: envelope()
      } as never)
    ).toThrow(
      expect.objectContaining<Partial<MerchantPayoutStatementIngestionPersistenceError>>({
        reason: "evidence_correlation_conflict"
      })
    );
  });

  it("rejects duplicate provider payments instead of allowing a duplicated statement line", () => {
    const command = validCommand();
    const duplicate = line(2);
    expect(() =>
      normalizeMerchantPayoutStatementIngestionCommand({
        ...command,
        statementEvidence: {
          ...command.statementEvidence,
          includedPayments: [command.statementEvidence.includedPayments[0]!, {
            ...duplicate,
            providerPaymentId: command.statementEvidence.includedPayments[0]!.providerPaymentId
          }]
        }
      } as never)
    ).toThrow(
      expect.objectContaining<Partial<MerchantPayoutStatementIngestionPersistenceError>>({
        reason: "duplicate_statement_payment"
      })
    );
  });
});

function validCommand() {
  return {
    batchIngestion: {
      kind: "settlement_batch_ingestion_commit_receipt",
      receiptId: "batch-receipt-1",
      version: 1,
      canonicalDigest: digest
    },
    payoutEvidence: {
      kind: "verified_arc_merchant_payout_evidence",
      providerAccount: providerAccount(),
      merchantPayoutId: "payout-1",
      providerBankPayoutId: "wire-1",
      amountMinor: "9600",
      currency: "RUB",
      outcome: "completed",
      completedAt: "2026-08-04T08:00:00.000Z",
      artifact: artifact("payout-page-artifact"),
      observedAt: "2026-08-04T08:01:00.000Z"
    },
    statementEvidence: {
      kind: "verified_arc_merchant_payout_statement_evidence",
      providerAccount: providerAccount(),
      merchantPayoutId: "payout-1",
      providerBankPayoutId: "wire-1",
      bankReference: "bank-ref-1",
      reportedNetPayoutMinor: "9600",
      currency: "RUB",
      decoderProfileId: "arc-payout-statement-csv-v1",
      decoderProfileVersion: 1,
      decoderProfileDigest: digest,
      decodedPaymentLinesDigest: digest,
      includedPayments: [line(1)],
      artifact: artifact("payout-statement-artifact"),
      observedAt: "2026-08-04T08:02:00.000Z"
    },
    operationEnvelope: envelope()
  };
}

function providerAccount() {
  return {
    seriesId: "arc-series-1",
    providerAccountId: "arc-account-1",
    identityVersion: 1
  };
}

function artifact(artifactId: string) {
  return { artifactId, sha256Digest: digest, byteLength: 100 };
}

function line(lineNumber: number) {
  return {
    lineNumber,
    providerPaymentId: `provider-payment-${lineNumber}`,
    externalId: `payment-intent-${lineNumber}`,
    amountMinor: "9600",
    feeAmountMinor: "0",
    currency: "RUB",
    lineDigest: digest
  };
}

function envelope() {
  return {
    kind: "resolved_finance_operation_envelope",
    policyId: "settlement-ingestion",
    policyVersion: 1,
    policyDigest: digest,
    maximumRows: 20,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 1_000_000
  };
}
