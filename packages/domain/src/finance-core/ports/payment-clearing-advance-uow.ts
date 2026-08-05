import type { ProviderSettlementEntryKey } from "../settlement-cursor-types";
import type { BankCashMatchCommitReceiptRef } from "./bank-cash-pool-port";
import type { FinanceCurrency, FinanceProviderAccountIdentity } from "./finance-port-types";
import type {
  MerchantPayoutPaymentInclusionCommitReceiptRef,
  SettlementBatchIngestionCommitReceiptRef,
  SettlementPaymentMatchCommitReceiptRef
} from "./settlement-persistence-port";

declare const paymentClearingAdvanceCommitReceiptBrand: unique symbol;

type PaymentClearingAdvanceCommandBase = Readonly<{
  economicPaymentIntentId: string;
  expectedClearingVersion: number;
  providerAccount: FinanceProviderAccountIdentity;
  currency: FinanceCurrency;
}>;

export type PaymentClearingAdvanceEvidence =
  | Readonly<{
      kind: "settlement_batch_ingestion";
      receipt: SettlementBatchIngestionCommitReceiptRef;
      providerEntryKey: ProviderSettlementEntryKey;
    }>
  | Readonly<{
      kind: "settlement_payment_match";
      receipt: SettlementPaymentMatchCommitReceiptRef;
    }>
  | Readonly<{
      kind: "bank_cash_match";
      bankCashMatch: BankCashMatchCommitReceiptRef;
      payoutPaymentInclusion: MerchantPayoutPaymentInclusionCommitReceiptRef;
    }>;

export type AdvancePaymentClearingCommand =
  | (PaymentClearingAdvanceCommandBase &
      Readonly<{
        nextState: "settlement_seen";
        evidence: Extract<PaymentClearingAdvanceEvidence, { kind: "settlement_batch_ingestion" }>;
      }>)
  | (PaymentClearingAdvanceCommandBase &
      Readonly<{
        nextState: "provider_matched";
        evidence: Extract<PaymentClearingAdvanceEvidence, { kind: "settlement_payment_match" }>;
      }>)
  | (PaymentClearingAdvanceCommandBase &
      Readonly<{
        nextState: "bank_matched";
        evidence: Extract<PaymentClearingAdvanceEvidence, { kind: "bank_cash_match" }>;
      }>);

export type PaymentClearingAdvanceCommitReceipt = Readonly<{
  kind: "payment_clearing_advance_commit_receipt";
  economicPaymentIntentId: string;
  clearingVersion: number;
  clearingState: "settlement_seen" | "provider_matched" | "bank_matched";
  evidenceKind: PaymentClearingAdvanceEvidence["kind"];
  evidenceReceiptId: string;
  committedAt: string;
  [paymentClearingAdvanceCommitReceiptBrand]: true;
}>;

/**
 * Implementations lock the current clearing projection and load the nominal evidence receipt in
 * the same transaction. They revalidate the receipt's exact provider-account binding, economic
 * payment identity and predecessor clearing version before applying the single requested step.
 * Final bank matching additionally proves that the exact captured provider payment was listed in
 * the same aggregate ArcPay payout whose bank credit was matched.
 */
export type PaymentClearingAdvanceUnitOfWork = Readonly<{
  advancePaymentClearing(
    command: AdvancePaymentClearingCommand
  ): Promise<PaymentClearingAdvanceCommitReceipt>;
}>;
