import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type {
  BankCashMatchCommitReceipt,
  BankStatementIngestionCommitReceiptRef
} from "./bank-cash-pool-port";
import type { ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { PayoutPaidConfirmationCommitReceiptRef } from "./payout-paid-confirmation-uow";
import type { VerifiedPayoutBankReturnEvidence } from "./trusted-finance-evidence";

declare const payoutBankReturnApplicationCommitReceiptBrand: unique symbol;

export type ApplyVerifiedBankReturnCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: number;
  walletId: string;
  expectedWalletRevision: string;
  bankExposureId: string;
  expectedBankExposureVersion: number;
  paidConfirmation: PayoutPaidConfirmationCommitReceiptRef;
  statementIngestion: BankStatementIngestionCommitReceiptRef;
  returnEvidence: VerifiedPayoutBankReturnEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PayoutBankReturnApplicationCommitReceipt = Readonly<{
  kind: "payout_bank_return_application_commit_receipt";
  payoutRequestId: string;
  payoutVersion: number;
  immutablePayoutState: "paid";
  returnCaseId: string;
  bankExposureId: string;
  bankExposureVersion: number;
  bankExposureState: "returned_reflected";
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt;
  bankCashMatchCommitReceipt: BankCashMatchCommitReceipt;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [payoutBankReturnApplicationCommitReceiptBrand]: true;
}>;

/**
 * A paid payout is never edited backwards. This UoW locks the paid request, exact statement,
 * exposure, wallet and returned source-lot set, records the bank credit and creates a new
 * reserved payable lot atomically.
 */
export type PayoutBankReturnApplicationUnitOfWork = Readonly<{
  applyVerifiedBankReturn(
    command: ApplyVerifiedBankReturnCommand
  ): Promise<PayoutBankReturnApplicationCommitReceipt>;
}>;
