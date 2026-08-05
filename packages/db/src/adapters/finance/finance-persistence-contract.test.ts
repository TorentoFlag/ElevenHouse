import * as financeCoreRuntime from "@elevenhouse/domain/finance-core";
import type {
  ApplyVerifiedCaptureCommand,
  BankCashMatchCommitReceiptRef,
  BankCashMatchUnitOfWork,
  BankLiquiditySnapshotAdoptionUnitOfWork,
  BankStatementIngestionCommitReceiptRef,
  BankStatementIngestionUnitOfWork,
  CashPoolDirectoryBootstrapPort,
  ChargebackFactApplicationUnitOfWork,
  ChargebackResolutionUnitOfWork,
  EconomicPaymentIntentCreationUnitOfWork,
  FinanceJournalLinkProofRef,
  FinanceOnlineReconciliationReadPort,
  PaymentClearingAdvanceUnitOfWork,
  PayoutBankReturnApplicationUnitOfWork,
  PayoutDefinitiveNoTransferUnitOfWork,
  PayoutManualExecutionUnitOfWork,
  PayoutPaidConfirmationCommitReceiptRef,
  PayoutPaidConfirmationUnitOfWork,
  PayoutRequestUnitOfWork,
  PayoutReviewApprovalUnitOfWork,
  PersistProviderOperationBeforeIoCommand,
  ProviderOperationIntentCreationUnitOfWork,
  ProviderOperationResultApplicationUnitOfWork,
  ProviderOperationResultCommitReceipt,
  RefundApprovalUnitOfWork,
  RefundResultApplicationUnitOfWork,
  SealedWalletJournalCommitUnitOfWork,
  SettlementBatchIngestionCommitReceiptRef,
  SettlementBatchIngestionUnitOfWork,
  SettlementCursorLeaseUnitOfWork,
  SettlementPaymentMatchCommitReceiptRef,
  SettlementPaymentMatchUnitOfWork,
  VerifiedCaptureApplicationUnitOfWork,
  VerifiedSettlementPageBundle,
  VerifiedWalletOperationCommitReceipt,
  WebhookInboxProcessingUnitOfWork,
  WebhookIngressStorageUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { describe, expect, expectTypeOf, it } from "vitest";

type PersistenceCapabilities = EconomicPaymentIntentCreationUnitOfWork &
  ProviderOperationIntentCreationUnitOfWork &
  ProviderOperationResultApplicationUnitOfWork &
  VerifiedCaptureApplicationUnitOfWork &
  PaymentClearingAdvanceUnitOfWork &
  WebhookIngressStorageUnitOfWork &
  WebhookInboxProcessingUnitOfWork &
  SealedWalletJournalCommitUnitOfWork &
  RefundApprovalUnitOfWork &
  RefundResultApplicationUnitOfWork &
  ChargebackFactApplicationUnitOfWork &
  ChargebackResolutionUnitOfWork &
  PayoutRequestUnitOfWork &
  PayoutReviewApprovalUnitOfWork &
  PayoutManualExecutionUnitOfWork &
  PayoutPaidConfirmationUnitOfWork &
  PayoutDefinitiveNoTransferUnitOfWork &
  PayoutBankReturnApplicationUnitOfWork &
  CashPoolDirectoryBootstrapPort &
  BankLiquiditySnapshotAdoptionUnitOfWork &
  BankStatementIngestionUnitOfWork &
  BankCashMatchUnitOfWork &
  SettlementCursorLeaseUnitOfWork &
  SettlementBatchIngestionUnitOfWork &
  SettlementPaymentMatchUnitOfWork &
  FinanceOnlineReconciliationReadPort;

type ForbiddenGenericPersistenceKey = Extract<
  keyof PersistenceCapabilities,
  "transaction" | "transact" | "withTransaction" | "repository" | "repositories" | "execute"
>;

type SavedCardChargeCommand = Extract<
  PersistProviderOperationBeforeIoCommand,
  { operationKind: "saved_card_charge" }
>;
type SavedCardCredentialRef = SavedCardChargeCommand["dispatchEnvelope"]["savedCardCredential"];
type ForbiddenProviderField = Extract<
  | "customerId"
  | "cardTokenId"
  | "tokenValue"
  | "restrictedTokenHandleRef"
  | "pan"
  | "PAN"
  | "cvv"
  | "CVV"
  | "cvc"
  | "cardNumber"
  | "raw"
  | "rawCardData"
  | "rawTokenizationArtifact"
  | "encrypted"
  | "encryptedCard"
  | "encryptedCardData"
  | "split"
  | "splits"
  | "submerchant"
  | "submerchantId"
  | "subMerchant"
  | "subMerchantId",
  keyof SavedCardChargeCommand["dispatchEnvelope"] | keyof SavedCardCredentialRef
>;

type PlainReceiptRef = Readonly<{
  kind: string;
  receiptId: string;
  version: 1;
  canonicalDigest: string;
}>;

describe("finance persistence package contract", () => {
  it("exposes only narrow capability methods and no generic transaction/repository bag", () => {
    expectTypeOf<ForbiddenGenericPersistenceKey>().toEqualTypeOf<never>();
  });

  it("keeps provider dispatch free of card data, splits and sub-merchants", () => {
    expectTypeOf<ForbiddenProviderField>().toEqualTypeOf<never>();
    expectTypeOf<SavedCardCredentialRef>().toEqualTypeOf<
      Readonly<{
        kind: "restricted_saved_card_credential_ref";
        schemaVersion: 1;
        credentialId: string;
        credentialVersion: number;
      }>
    >();
    expectTypeOf<
      SavedCardChargeCommand["dispatchAuthorization"]["savedCardCredentialId"]
    >().toEqualTypeOf<SavedCardCredentialRef["credentialId"]>();
    expectTypeOf<SavedCardChargeCommand["dispatchAuthorization"]>().toHaveProperty(
      "savedCardCredentialVersion"
    );
    expectTypeOf<
      SavedCardChargeCommand["dispatchAuthorization"]["savedCardCredentialVersion"]
    >().toEqualTypeOf<SavedCardCredentialRef["credentialVersion"]>();
    expect(financeCoreRuntime).toHaveProperty("assertSavedCardCredentialAuthorizationBinding");
  });

  it("chains provider capture and settlement/bank authority through nominal receipts", () => {
    expectTypeOf<
      ApplyVerifiedCaptureCommand["providerResult"]
    >().toMatchTypeOf<ProviderOperationResultCommitReceipt>();
    expectTypeOf<VerifiedSettlementPageBundle>().toHaveProperty("rawArtifact");
    expectTypeOf<VerifiedSettlementPageBundle>().toHaveProperty("normalizedEntries");
    expectTypeOf<PlainReceiptRef>().not.toMatchTypeOf<
      | SettlementBatchIngestionCommitReceiptRef
      | SettlementPaymentMatchCommitReceiptRef
      | BankStatementIngestionCommitReceiptRef
      | BankCashMatchCommitReceiptRef
      | PayoutPaidConfirmationCommitReceiptRef
    >();
    expectTypeOf<
      Record<string, unknown>
    >().not.toMatchTypeOf<VerifiedWalletOperationCommitReceipt>();
  });

  it("freezes the exact allocation-link proof reference vocabulary", () => {
    expectTypeOf<
      FinanceJournalLinkProofRef["kind"]
    >().toEqualTypeOf<"finance_allocation_link_proof">();
    expectTypeOf<FinanceJournalLinkProofRef["version"]>().toEqualTypeOf<1>();
    expectTypeOf<keyof FinanceJournalLinkProofRef>().toEqualTypeOf<
      "kind" | "proofId" | "version" | "proofDigest"
    >();
  });

  it("publishes no runtime factory that can self-issue trusted authority", () => {
    expect(financeCoreRuntime).not.toHaveProperty(
      "hydratePersistedVerifiedEconomicPaymentCaptureReceipt"
    );
    expect(financeCoreRuntime).not.toHaveProperty("recordProviderOperationResult");
    expect(Object.keys(financeCoreRuntime).some((key) => /^createVerified/.test(key))).toBe(false);
  });
});
