import { describe, expect, expectTypeOf, it } from "vitest";
import type { ProviderAccountIdentityBinding } from "../provider-account-binding";
import type { ProviderOperationReplacementAuthority } from "../provider-operation-intent";
import type { LosslessSettlementEntry, LosslessSettlementPayout } from "../settlement-cursor-types";
import type { PersistedVerifiedEconomicPaymentCaptureReceipt } from "../economic-payment";
import type {
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef,
  ResolvedFinanceWalletOperationEnvelope
} from "./finance-port-types";
import type { EconomicPaymentIntentCreationUnitOfWork } from "./economic-payment-intent-creation-uow";
import type { EconomicPaymentSessionOpenUnitOfWork } from "./economic-payment-session-open-uow";
import type {
  ClientCheckoutPreparationReadPort,
  ClientCheckoutPreparationWorkerUnitOfWork
} from "./client-checkout-preparation-store";
import type {
  ClientOrderCheckoutPreparationUnitOfWork,
  PrepareClientOrderCheckoutCommand
} from "./client-order-checkout-preparation-uow";
import type { ClientCheckoutSessionResultUnitOfWork } from "./client-checkout-session-result-uow";
import type { ClientCheckoutProviderTransportUnknownUnitOfWork } from "./client-checkout-provider-transport-unknown-uow";
import type {
  PersistProviderOperationBeforeIoCommand,
  ProviderOperationIntentCreationUnitOfWork,
  ProviderOperationIoPort
} from "./provider-operation-intent-creation-uow";
import type {
  ProviderOperationResultApplicationUnitOfWork,
  ProviderOperationResultCommitReceipt
} from "./provider-operation-result-application-uow";
import type {
  ApplyVerifiedCaptureCommand,
  CaptureFinancialMutationProposal,
  VerifiedCaptureApplicationCommitReceipt,
  VerifiedCaptureApplicationCommitReceiptRef,
  VerifiedCaptureApplicationUnitOfWork
} from "./verified-capture-application-uow";
import type {
  ApplyCanonicalClientOrderCaptureCommand,
  CanonicalClientOrderCaptureUnitOfWork,
  VerifiedClientOrderCaptureSemanticCommitReceipt
} from "./client-order-canonical-capture-uow";
import type {
  ApplyCanonicalOnlineSaleCaptureCommand,
  OnlineSaleCaptureCanonicalCaptureUnitOfWork,
  OnlineSaleCapturePersistenceResolver
} from "./online-sale-capture-persistence-port";
import type {
  AdvancePaymentClearingCommand,
  PaymentClearingAdvanceEvidence,
  PaymentClearingAdvanceUnitOfWork
} from "./payment-clearing-advance-uow";
import type {
  WebhookCanonicalReadPort,
  WebhookInboxProcessingUnitOfWork,
  WebhookIngressStorageUnitOfWork
} from "./webhook-inbox-persistence-port";
import type {
  SealedWalletJournalCommitUnitOfWork,
  SealedWalletJournalMutationCommand
} from "./wallet-journal-commit-port";
import type {
  CompleteActivePayoutBridgeInventoryReceipt,
  PayoutDefinitiveNoTransferCommand,
  PayoutDefinitiveNoTransferCommitReceipt,
  PayoutDefinitiveNoTransferUnitOfWork,
  PayoutNoTransferCanonicalLockOrder
} from "./payout-definitive-no-transfer-uow";
import type {
  ApproveRefundCommand,
  RefundApprovalExecutionProposal,
  RefundApprovalUnitOfWork
} from "./refund-approval-uow";
import type {
  ApplyVerifiedRefundResultCommand,
  RefundResultApplicationUnitOfWork,
  RefundResultExecutionProposal
} from "./refund-result-application-uow";
import type { ChargebackFactApplicationUnitOfWork } from "./chargeback-fact-application-uow";
import type { ChargebackResolutionUnitOfWork } from "./chargeback-resolution-uow";
import type {
  ClaimSettlementCursorLeaseCommand,
  ConfirmMerchantPayoutCommand,
  IngestVerifiedMerchantPayoutStatementCommand,
  IngestVerifiedSettlementPageCommand,
  SettlementBatchIngestionUnitOfWork,
  SettlementBatchIngestionCommitReceiptRef,
  MerchantPayoutPaymentInclusionCommitReceiptRef,
  MerchantPayoutConfirmationCommitReceiptRef,
  MerchantPayoutStatementIngestionUnitOfWork,
  MerchantPayoutStatementIngestionCommitReceiptRef,
  MerchantPayoutConfirmationUnitOfWork,
  SettlementCursorLeaseUnitOfWork,
  SettlementPageCheckpointIdentity,
  SettlementPaymentMatchCommitReceiptRef,
  SettlementPaymentMatchUnitOfWork,
  SettlementProviderReadPort,
  VerifiedSettlementPageBundle
} from "./settlement-persistence-port";
import type {
  BankCashMatchCommitReceiptRef,
  BankCashMatchAuthority,
  BankCashMatchUnitOfWork,
  BankLiquiditySnapshotAdoptionUnitOfWork,
  BankStatementIngestionUnitOfWork,
  CashPoolDirectoryBootstrapPort,
  EmptyCashPoolDirectoryReceipt
} from "./bank-cash-pool-port";
import type { PayoutRequestUnitOfWork } from "./payout-request-uow";
import type {
  PayoutApprovalCommitReceiptRef,
  PayoutReviewApprovalUnitOfWork
} from "./payout-review-approval-uow";
import type {
  PayoutManualExecutionUnitOfWork,
  StartManualPayoutExecutionCommand
} from "./payout-manual-execution-uow";
import type {
  ConfirmPayoutPaidCommand,
  PayoutPaidConfirmationUnitOfWork
} from "./payout-paid-confirmation-uow";
import type { PayoutBankReturnApplicationUnitOfWork } from "./payout-bank-return-application-uow";
import type {
  FinanceFullHistoryReconstructionPort,
  FinanceOnlineReconciliationReadPort,
  FinanceReconciliationUnitOfWork
} from "./reconciliation-port";
import type { DistributedArcPayRateBudgetPort } from "./rate-budget-port";
import type { PlatformTariffCredentialActivationUnitOfWork } from "./platform-tariff-credential-activation-uow";
import type {
  VerifiedBankStatementEvidence,
  VerifiedArcMerchantPayoutEvidence,
  VerifiedArcMerchantPayoutStatementEvidence,
  VerifiedChargebackProviderEvidence,
  VerifiedPayoutNoTransferEvidence,
  VerifiedProviderOperationEvidence,
  VerifiedRefundProviderOutcome,
  VerifiedSettlementPageEvidence,
  VerifiedWebhookSemanticEvidence
} from "./trusted-finance-evidence";

// @ts-expect-error A universal transaction facade is intentionally forbidden.
import type { FinanceUnitOfWork } from "./finance-port-types";
// @ts-expect-error Ports stay on exact-module imports until adapters are implemented.
import type { FinancePersistencePorts } from "./index";

export type ForbiddenUniversalFinanceUnitOfWork = FinanceUnitOfWork;
export type ForbiddenFinancePortsFacade = FinancePersistencePorts;

type PlainProviderEvidence = Readonly<{
  kind: "verified_provider_operation_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerOperationIntentId: string;
  operationKind:
    | "checkout_session_create"
    | "card_setup"
    | "card_setup_execute"
    | "card_setup_3ds_method_complete"
    | "saved_card_charge"
    | "refund"
    | "void";
  providerOperationId: string;
  canonicalRequestDigest: `sha256:${string}`;
  idempotencyKey: string;
  outcome: "succeeded" | "failed" | "ambiguous";
  providerPaymentId: string | null;
  amountMinor: string | null;
  currency: "RUB" | null;
  artifact: RawProviderArtifactRef;
  observedAt: string;
}>;

type SavedCardChargeCommand = Extract<
  PersistProviderOperationBeforeIoCommand,
  { operationKind: "saved_card_charge" }
>;
type SavedCardCredentialRef = SavedCardChargeCommand["dispatchEnvelope"]["savedCardCredential"];
type ForbiddenSavedCardDispatchKey = Extract<
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

type PlainSettlementBatchIngestionCommitReceiptRef = Readonly<{
  kind: "settlement_batch_ingestion_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: `sha256:${string}`;
}>;

type PlainSettlementPaymentMatchCommitReceiptRef = Readonly<{
  kind: "settlement_payment_match_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: `sha256:${string}`;
}>;

type PlainMerchantPayoutConfirmationCommitReceiptRef = Readonly<{
  kind: "merchant_payout_confirmation_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: `sha256:${string}`;
}>;

type PlainMerchantPayoutPaymentInclusionCommitReceiptRef = Readonly<{
  kind: "merchant_payout_payment_inclusion_commit_receipt";
  receiptId: string;
  version: 1;
  canonicalDigest: `sha256:${string}`;
}>;

describe("finance persistence port contracts", () => {
  it("binds saved-card dispatch to one logical restricted credential vocabulary", () => {
    expectTypeOf<ForbiddenSavedCardDispatchKey>().toEqualTypeOf<never>();
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
    expectTypeOf<
      SavedCardChargeCommand["dispatchAuthorization"]["savedCardCredentialVersion"]
    >().toEqualTypeOf<SavedCardCredentialRef["credentialVersion"]>();
  });

  it("keeps provider identity exact and provider calls outside database transactions", () => {
    expectTypeOf<FinanceProviderAccountIdentity>().toEqualTypeOf<ProviderAccountIdentityBinding>();
    expectTypeOf<FinanceProviderAccountIdentity>().toEqualTypeOf<
      Readonly<{
        seriesId: string;
        providerAccountId: string;
        identityVersion: number;
      }>
    >();
    expectTypeOf<
      ProviderOperationIoPort["transactionBoundary"]
    >().toEqualTypeOf<"outside_database_transaction">();
    expectTypeOf<
      WebhookCanonicalReadPort["transactionBoundary"]
    >().toEqualTypeOf<"outside_database_transaction">();
    expectTypeOf<
      SettlementProviderReadPort["transactionBoundary"]
    >().toEqualTypeOf<"outside_database_transaction">();
  });

  it("exposes capability-specific atomic boundaries instead of one generic unit of work", () => {
    expectTypeOf<
      keyof EconomicPaymentIntentCreationUnitOfWork
    >().toEqualTypeOf<"createEconomicPaymentIntent">();
    expectTypeOf<
      keyof EconomicPaymentSessionOpenUnitOfWork
    >().toEqualTypeOf<"openEconomicPaymentSession">();
    expectTypeOf<
      keyof ClientCheckoutPreparationReadPort
    >().toEqualTypeOf<"findClientCheckoutPreparation">();
    expectTypeOf<keyof ClientCheckoutPreparationWorkerUnitOfWork>().toEqualTypeOf<
      | "publishClientCheckoutReady"
      | "markClientCheckoutProviderSessionUnknown"
      | "failClientCheckoutPreparation"
    >();
    expectTypeOf<
      keyof ClientOrderCheckoutPreparationUnitOfWork
    >().toEqualTypeOf<"prepareClientOrderCheckout">();
    expectTypeOf<
      Extract<"amountMinor" | "currency", keyof PrepareClientOrderCheckoutCommand>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      keyof ClientCheckoutSessionResultUnitOfWork
    >().toEqualTypeOf<"completeClientCheckoutSession">();
    expectTypeOf<
      keyof ClientCheckoutProviderTransportUnknownUnitOfWork
    >().toEqualTypeOf<"markClientCheckoutProviderTransportUnknown">();
    expectTypeOf<
      keyof ProviderOperationIntentCreationUnitOfWork
    >().toEqualTypeOf<"persistBeforeProviderIo">();
    expectTypeOf<
      keyof PlatformTariffCredentialActivationUnitOfWork
    >().toEqualTypeOf<"createInitialInvoiceAfterVerifiedCredentialActivation">();
    expectTypeOf<keyof PersistProviderOperationBeforeIoCommand>().toEqualTypeOf<
      | "providerOperationIntentId"
      | "economicPaymentIntentId"
      | "expectedEconomicPaymentVersion"
      | "economicPaymentSessionId"
      | "expectedProviderOperationSourceVersion"
      | "providerAccount"
      | "operationKind"
      | "dispatchEnvelope"
      | "dispatchAuthorization"
      | "dispatchArtifact"
      | "replacementAuthority"
      | "idempotencyKey"
      | "idempotencyRetentionDeadline"
      | "operationEnvelope"
    >();
    expectTypeOf<
      PersistProviderOperationBeforeIoCommand["dispatchArtifact"]
    >().toEqualTypeOf<RawProviderArtifactRef>();
    expectTypeOf<
      PersistProviderOperationBeforeIoCommand["replacementAuthority"]
    >().toEqualTypeOf<ProviderOperationReplacementAuthority | null>();
    expectTypeOf<
      Extract<
        PersistProviderOperationBeforeIoCommand,
        { economicPaymentSessionId: null }
      >["operationKind"]
    >().toEqualTypeOf<"refund" | "void">();
    expectTypeOf<
      keyof ProviderOperationResultApplicationUnitOfWork
    >().toEqualTypeOf<"applyVerifiedProviderResult">();
    expectTypeOf<Extract<keyof ProviderOperationResultCommitReceipt, string>>().toEqualTypeOf<
      | "kind"
      | "providerOperationResultId"
      | "providerOperationIntentId"
      | "providerOperationIntentVersion"
      | "providerOperationId"
      | "operationKind"
      | "economicPaymentIntentId"
      | "correlatedEconomicPaymentVersion"
      | "economicPaymentSessionId"
      | "sourceId"
      | "purpose"
      | "providerAccount"
      | "outcome"
      | "providerPaymentId"
      | "amountMinor"
      | "currency"
      | "evidenceArtifactId"
      | "evidenceArtifactDigest"
      | "canonicalRequestDigest"
      | "observedAt"
      | "persistenceTransactionBoundaryRef"
      | "committedAt"
    >();
    expectTypeOf<
      keyof VerifiedCaptureApplicationUnitOfWork
    >().toEqualTypeOf<"applyVerifiedCapture">();
    expectTypeOf<
      keyof CanonicalClientOrderCaptureUnitOfWork
    >().toEqualTypeOf<"applyCanonicalClientOrderCapture">();
    expectTypeOf<keyof ApplyCanonicalClientOrderCaptureCommand>().toEqualTypeOf<
      | "economicPaymentIntentId"
      | "expectedEconomicPaymentVersion"
      | "semanticCapture"
      | "financialMutation"
      | "operationEnvelope"
    >();
    expectTypeOf<
      keyof OnlineSaleCaptureCanonicalCaptureUnitOfWork
    >().toEqualTypeOf<"applyCanonicalOnlineSaleCapture">();
    expectTypeOf<keyof ApplyCanonicalOnlineSaleCaptureCommand["capture"]>().toEqualTypeOf<
      "economicPaymentIntentId" | "expectedEconomicPaymentVersion" | "operationEnvelope"
    >();
    expectTypeOf<
      Extract<keyof ApplyCanonicalOnlineSaleCaptureCommand["capture"], "financialMutation">
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Awaited<
        ReturnType<
          OnlineSaleCapturePersistenceResolver<
            Readonly<{ transaction: "caller-owned" }>
          >["resolveOnlineSaleCapturePersistence"]
        >
      >
    >().toHaveProperty("receipt");
    expectTypeOf<
      Extract<keyof VerifiedClientOrderCaptureSemanticCommitReceipt, string>
    >().toEqualTypeOf<
      | "kind"
      | "receiptId"
      | "semanticFactId"
      | "inboxItemId"
      | "inboxVersion"
      | "committedCheckpointSequence"
      | "semanticSourceKind"
      | "providerAccount"
      | "economicPaymentIntentId"
      | "economicPaymentSessionId"
      | "semanticSourceId"
      | "purpose"
      | "providerPaymentId"
      | "amountMinor"
      | "currency"
      | "canonicalFactDigest"
      | "evidenceArtifactId"
      | "evidenceArtifactDigest"
      | "observedAt"
      | "businessEffect"
      | "walletJournalCommitReceipt"
      | "persistenceTransactionBoundaryRef"
      | "committedAt"
    >();
    expectTypeOf<keyof ApplyVerifiedCaptureCommand>().toEqualTypeOf<
      | "economicPaymentIntentId"
      | "expectedEconomicPaymentVersion"
      | "providerOperationIntentId"
      | "expectedProviderOperationIntentVersion"
      | "financialMutation"
      | "providerResult"
      | "operationEnvelope"
    >();
    expectTypeOf<
      ApplyVerifiedCaptureCommand["financialMutation"]
    >().toEqualTypeOf<CaptureFinancialMutationProposal>();
    expectTypeOf<
      Extract<CaptureFinancialMutationProposal, { kind: "wallet_and_journal" }>["command"]
    >().toEqualTypeOf<SealedWalletJournalMutationCommand>();
    expectTypeOf<
      ApplyVerifiedCaptureCommand["providerResult"]
    >().toMatchTypeOf<ProviderOperationResultCommitReceipt>();
    expectTypeOf<
      VerifiedCaptureApplicationCommitReceipt["economicCaptureReceipt"]
    >().toEqualTypeOf<PersistedVerifiedEconomicPaymentCaptureReceipt>();
    expectTypeOf<
      VerifiedCaptureApplicationCommitReceipt["ref"]
    >().toEqualTypeOf<VerifiedCaptureApplicationCommitReceiptRef>();
    expectTypeOf<
      keyof PaymentClearingAdvanceUnitOfWork
    >().toEqualTypeOf<"advancePaymentClearing">();
    expectTypeOf<keyof AdvancePaymentClearingCommand>().toEqualTypeOf<
      | "economicPaymentIntentId"
      | "expectedClearingVersion"
      | "providerAccount"
      | "currency"
      | "nextState"
      | "evidence"
    >();
    expectTypeOf<
      Extract<AdvancePaymentClearingCommand, { nextState: "settlement_seen" }>["evidence"]
    >().toEqualTypeOf<
      Extract<PaymentClearingAdvanceEvidence, { kind: "settlement_batch_ingestion" }>
    >();
    expectTypeOf<
      Extract<AdvancePaymentClearingCommand, { nextState: "provider_matched" }>["evidence"]
    >().toEqualTypeOf<
      Extract<PaymentClearingAdvanceEvidence, { kind: "settlement_payment_match" }>
    >();
    expectTypeOf<
      Extract<AdvancePaymentClearingCommand, { nextState: "bank_matched" }>["evidence"]
    >().toEqualTypeOf<Extract<PaymentClearingAdvanceEvidence, { kind: "bank_cash_match" }>>();
    expectTypeOf<
      Readonly<{
        kind: "settlement_payment_match";
        receipt: SettlementPaymentMatchCommitReceiptRef;
      }>
    >().not.toMatchTypeOf<
      Extract<AdvancePaymentClearingCommand, { nextState: "bank_matched" }>["evidence"]
    >();
    expectTypeOf<
      Readonly<{
        kind: "settlement_batch_ingestion";
        receipt: SettlementBatchIngestionCommitReceiptRef;
        providerEntryKey: string;
      }>
    >().not.toMatchTypeOf<
      Extract<AdvancePaymentClearingCommand, { nextState: "provider_matched" }>["evidence"]
    >();
    expectTypeOf<
      Extract<PaymentClearingAdvanceEvidence, { kind: "bank_cash_match" }>["bankCashMatch"]
    >().toEqualTypeOf<BankCashMatchCommitReceiptRef>();
    expectTypeOf<
      Extract<PaymentClearingAdvanceEvidence, { kind: "bank_cash_match" }>["payoutPaymentInclusion"]
    >().toEqualTypeOf<MerchantPayoutPaymentInclusionCommitReceiptRef>();
    expectTypeOf<
      keyof WebhookIngressStorageUnitOfWork
    >().toEqualTypeOf<"storeBeforeAcknowledgement">();
    expectTypeOf<
      keyof WebhookInboxProcessingUnitOfWork
    >().toEqualTypeOf<"applyVerifiedSemanticFact">();
    expectTypeOf<
      keyof SealedWalletJournalCommitUnitOfWork
    >().toEqualTypeOf<"commitSealedWalletJournalMutation">();
    expectTypeOf<keyof ResolvedFinanceWalletOperationEnvelope["walletProjection"]>().toEqualTypeOf<
      "decoderEnvelope" | "resolvedLimitPolicy"
    >();
    expectTypeOf<keyof SealedWalletJournalMutationCommand>().toEqualTypeOf<
      | "operationId"
      | "walletId"
      | "astrologerUserId"
      | "currency"
      | "expectedWalletRevision"
      | "sourceLotTransition"
      | "sourceTransitionReceipt"
      | "postingRecipe"
      | "journalLinkProof"
      | "commitBinding"
      | "operationEnvelope"
    >();
    expectTypeOf<
      keyof PayoutDefinitiveNoTransferUnitOfWork
    >().toEqualTypeOf<"resolveDefinitiveNoTransfer">();
    expectTypeOf<keyof RefundApprovalUnitOfWork>().toEqualTypeOf<"approveRefund">();
    expectTypeOf<keyof ApproveRefundCommand>().toEqualTypeOf<
      | "refundId"
      | "expectedRefundVersion"
      | "orderId"
      | "economicPaymentIntentId"
      | "walletId"
      | "expectedWalletRevision"
      | "expectedCumulativePositionVersion"
      | "expectedActivePayoutSetRevision"
      | "approvedCumulativeRefundMinor"
      | "currency"
      | "approvalAuthority"
      | "execution"
      | "postingDecoderEnvelope"
      | "operationEnvelope"
    >();
    expectTypeOf<keyof RefundApprovalExecutionProposal>().toEqualTypeOf<
      | "kind"
      | "allocation"
      | "resolvedCumulativePosition"
      | "fundingTransitionBinding"
      | "resolvedFundingPositions"
      | "walletJournalMutation"
      | "providerDispatch"
    >();
    expectTypeOf<
      keyof RefundResultApplicationUnitOfWork
    >().toEqualTypeOf<"applyVerifiedRefundResult">();
    expectTypeOf<keyof ApplyVerifiedRefundResultCommand>().toEqualTypeOf<
      | "refundId"
      | "expectedRefundVersion"
      | "walletId"
      | "expectedWalletRevision"
      | "expectedCumulativePositionVersion"
      | "providerResult"
      | "refundOutcome"
      | "execution"
      | "postingDecoderEnvelope"
      | "operationEnvelope"
    >();
    expectTypeOf<keyof RefundResultExecutionProposal>().toEqualTypeOf<
      | "kind"
      | "allocation"
      | "resolvedPriorAllocation"
      | "resolvedCumulativePosition"
      | "resolvedFundingPositions"
      | "fundingTransitionBinding"
      | "terminalAuthority"
      | "terminalEvidenceBinding"
      | "terminalPosting"
      | "walletJournalMutation"
    >();
    expectTypeOf<
      keyof ChargebackFactApplicationUnitOfWork
    >().toEqualTypeOf<"applyVerifiedChargebackFact">();
    expectTypeOf<keyof ChargebackResolutionUnitOfWork>().toEqualTypeOf<"resolveChargeback">();
    expectTypeOf<keyof SettlementBatchIngestionUnitOfWork>().toEqualTypeOf<"ingestVerifiedPage">();
    expectTypeOf<
      keyof SettlementPaymentMatchUnitOfWork
    >().toEqualTypeOf<"matchSettlementPayment">();
    expectTypeOf<
      keyof MerchantPayoutConfirmationUnitOfWork
    >().toEqualTypeOf<"confirmMerchantPayout">();
    expectTypeOf<
      keyof MerchantPayoutStatementIngestionUnitOfWork
    >().toEqualTypeOf<"ingestVerifiedMerchantPayoutStatement">();
    expectTypeOf<keyof IngestVerifiedMerchantPayoutStatementCommand>().toEqualTypeOf<
      "batchIngestion" | "payoutEvidence" | "statementEvidence" | "operationEnvelope"
    >();
    expectTypeOf<keyof ConfirmMerchantPayoutCommand>().toEqualTypeOf<
      | "bankCashPoolId"
      | "expectedProviderPositionRevision"
      | "statementIngestion"
      | "operationEnvelope"
    >();
    expectTypeOf<
      ConfirmMerchantPayoutCommand["statementIngestion"]
    >().toEqualTypeOf<MerchantPayoutStatementIngestionCommitReceiptRef>();
    expectTypeOf<
      keyof BankStatementIngestionUnitOfWork
    >().toEqualTypeOf<"ingestVerifiedStatementEntry">();
    expectTypeOf<keyof BankCashMatchUnitOfWork>().toEqualTypeOf<"matchBankCash">();
    expectTypeOf<keyof PayoutRequestUnitOfWork>().toEqualTypeOf<"createPayoutRequest">();
    expectTypeOf<keyof PayoutReviewApprovalUnitOfWork>().toEqualTypeOf<"reviewOrApprovePayout">();
    expectTypeOf<
      keyof PayoutManualExecutionUnitOfWork
    >().toEqualTypeOf<"startManualPayoutExecution">();
    expectTypeOf<keyof PayoutPaidConfirmationUnitOfWork>().toEqualTypeOf<"confirmPayoutPaid">();
    expectTypeOf<
      keyof PayoutBankReturnApplicationUnitOfWork
    >().toEqualTypeOf<"applyVerifiedBankReturn">();
    expectTypeOf<keyof StartManualPayoutExecutionCommand>().toEqualTypeOf<
      | "payoutRequestId"
      | "expectedPayoutVersion"
      | "bankExposureId"
      | "expectedBankExposureVersion"
      | "approval"
      | "destination"
      | "executionEvidence"
      | "operationEnvelope"
    >();
    expectTypeOf<
      StartManualPayoutExecutionCommand["approval"]
    >().toEqualTypeOf<PayoutApprovalCommitReceiptRef>();
    expectTypeOf<keyof ConfirmPayoutPaidCommand>().toEqualTypeOf<
      | "payoutRequestId"
      | "expectedPayoutVersion"
      | "walletId"
      | "expectedWalletRevision"
      | "bankExposureId"
      | "expectedBankExposureVersion"
      | "approval"
      | "destination"
      | "paidEvidence"
      | "operationEnvelope"
    >();
  });

  it("makes payout no-transfer resolution payout-wide and canonical-lock ordered", () => {
    expectTypeOf<keyof PayoutDefinitiveNoTransferCommand>().toEqualTypeOf<
      | "payoutRequestId"
      | "expectedPayoutVersion"
      | "walletId"
      | "expectedWalletRevision"
      | "expectedActiveBridgeInventoryRevision"
      | "bankCashPoolId"
      | "currency"
      | "expectedBankLiquidityRevision"
      | "bankExposureId"
      | "expectedBankExposureVersion"
      | "outcome"
      | "operationEnvelope"
    >();
    expectTypeOf<PayoutNoTransferCanonicalLockOrder>().toEqualTypeOf<
      readonly [
        "aggregate_roots_by_type_and_id",
        "astrologer_wallet",
        "source_lots_by_source_and_lot_id",
        "active_refund_bridge_reservations_by_payout_and_id",
        "payout_requests_by_id",
        "bank_liquidity_by_pool_and_currency",
        "bank_exposures_by_id"
      ]
    >();
    expectTypeOf<
      PayoutDefinitiveNoTransferCommand["outcome"]
    >().toEqualTypeOf<VerifiedPayoutNoTransferEvidence>();
    expectTypeOf<
      PayoutDefinitiveNoTransferCommitReceipt["completeActiveBridgeInventory"]
    >().toEqualTypeOf<CompleteActivePayoutBridgeInventoryReceipt>();
  });

  it("binds settlement checkpoints to page identity and database-clock leases", () => {
    expectTypeOf<keyof SettlementPageCheckpointIdentity>().toEqualTypeOf<
      "cursorKey" | "windowGeneration" | "providerPageCursor"
    >();
    expectTypeOf<keyof ClaimSettlementCursorLeaseCommand>().toEqualTypeOf<
      "cursorKey" | "expectedCursorVersion" | "leaseOwnerId" | "leaseToken" | "leaseDurationSeconds"
    >();
    expectTypeOf<keyof SettlementCursorLeaseUnitOfWork>().toEqualTypeOf<
      "claimLease" | "renewLease" | "releaseLease"
    >();
    expectTypeOf<keyof IngestVerifiedSettlementPageCommand>().toEqualTypeOf<
      "expectedCursorVersion" | "lease" | "pageBundle"
    >();
    expectTypeOf<
      IngestVerifiedSettlementPageCommand["pageBundle"]
    >().toEqualTypeOf<VerifiedSettlementPageBundle>();
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
    expectTypeOf<PlainSettlementBatchIngestionCommitReceiptRef>().not.toMatchTypeOf<SettlementBatchIngestionCommitReceiptRef>();
    expectTypeOf<PlainSettlementPaymentMatchCommitReceiptRef>().not.toMatchTypeOf<SettlementPaymentMatchCommitReceiptRef>();
    expectTypeOf<PlainMerchantPayoutConfirmationCommitReceiptRef>().not.toMatchTypeOf<MerchantPayoutConfirmationCommitReceiptRef>();
    expectTypeOf<PlainMerchantPayoutPaymentInclusionCommitReceiptRef>().not.toMatchTypeOf<MerchantPayoutPaymentInclusionCommitReceiptRef>();
  });

  it("binds a complete bank row to aggregate payout authority and decoder-issued identity", () => {
    expectTypeOf<VerifiedBankStatementEvidence["sourceStatementId"]>().toEqualTypeOf<string>();
    expectTypeOf<VerifiedBankStatementEvidence["sourceRowId"]>().toEqualTypeOf<string>();
    expectTypeOf<
      Extract<BankCashMatchAuthority, { kind: "merchant_settlement" }>["merchantPayout"]
    >().toEqualTypeOf<MerchantPayoutConfirmationCommitReceiptRef>();
    expectTypeOf<
      Extract<BankCashMatchAuthority, { kind: "merchant_settlement" }>
    >().not.toMatchTypeOf<
      Readonly<{
        kind: "merchant_settlement";
        settlementMatch: SettlementPaymentMatchCommitReceiptRef;
      }>
    >();
    expectTypeOf<VerifiedArcMerchantPayoutEvidence["outcome"]>().toEqualTypeOf<"completed">();
    expectTypeOf<"bankReference">().not.toMatchTypeOf<keyof VerifiedArcMerchantPayoutEvidence>();
    expectTypeOf<
      VerifiedArcMerchantPayoutStatementEvidence["bankReference"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      VerifiedArcMerchantPayoutStatementEvidence["includedPayments"][number]
    >().toEqualTypeOf<
      Readonly<{
        lineNumber: number;
        providerPaymentId: string;
        externalId: string;
        amountMinor: string;
        feeAmountMinor: string;
        currency: "RUB";
        lineDigest: `sha256:${string}`;
      }>
    >();
  });

  it("keeps online reads bounded and full-history reconstruction offline", () => {
    expectTypeOf<keyof FinanceOnlineReconciliationReadPort>().toEqualTypeOf<
      | "readWalletHead"
      | "readEconomicPaymentHead"
      | "readProviderPositionHead"
      | "readNormalizedJournalPage"
      | "readNormalizedSourceLotPage"
    >();
    expectTypeOf<keyof FinanceFullHistoryReconstructionPort>().toEqualTypeOf<
      "executionMode" | "streamNormalizedHistory"
    >();
    expectTypeOf<
      keyof FinanceReconciliationUnitOfWork
    >().toEqualTypeOf<"commitBoundedReconciliationResult">();
    expectTypeOf<
      FinanceFullHistoryReconstructionPort["executionMode"]
    >().toEqualTypeOf<"offline_reconciliation_only">();
    expectTypeOf<DistributedArcPayRateBudgetPort>().not.toBeAny();
  });

  it("permits only a reference-only zero cash-pool bootstrap", () => {
    expectTypeOf<
      keyof CashPoolDirectoryBootstrapPort
    >().toEqualTypeOf<"ensureEmptySystemCashPoolReference">();
    expectTypeOf<
      keyof BankLiquiditySnapshotAdoptionUnitOfWork
    >().toEqualTypeOf<"adoptVerifiedLiquiditySnapshot">();
    expectTypeOf<
      EmptyCashPoolDirectoryReceipt["monetaryInitialization"]
    >().toEqualTypeOf<"reference_only_zero">();
    expectTypeOf<EmptyCashPoolDirectoryReceipt["journalTransactionId"]>().toEqualTypeOf<null>();
  });

  it("does not let callers structurally self-author trusted financial evidence", () => {
    expectTypeOf<PlainProviderEvidence>().not.toMatchTypeOf<VerifiedProviderOperationEvidence>();
    expectTypeOf<Record<string, unknown>>().not.toMatchTypeOf<
      | VerifiedWebhookSemanticEvidence
      | VerifiedPayoutNoTransferEvidence
      | VerifiedRefundProviderOutcome
      | VerifiedChargebackProviderEvidence
      | VerifiedSettlementPageEvidence
      | VerifiedArcMerchantPayoutEvidence
      | VerifiedArcMerchantPayoutStatementEvidence
      | VerifiedBankStatementEvidence
    >();
  });

  it("has no runtime evidence factories or port facade exports", async () => {
    const modules = await Promise.all([
      import("./finance-port-types.js"),
      import("./trusted-finance-evidence.js"),
      import("./economic-payment-intent-creation-uow.js"),
      import("./provider-operation-intent-creation-uow.js"),
      import("./provider-operation-result-application-uow.js"),
      import("./verified-capture-application-uow.js"),
      import("./payment-clearing-advance-uow.js"),
      import("./webhook-inbox-persistence-port.js"),
      import("./wallet-journal-commit-port.js"),
      import("./payout-definitive-no-transfer-uow.js"),
      import("./payout-request-uow.js"),
      import("./payout-review-approval-uow.js"),
      import("./payout-manual-execution-uow.js"),
      import("./payout-paid-confirmation-uow.js"),
      import("./payout-bank-return-application-uow.js"),
      import("./refund-approval-uow.js"),
      import("./refund-result-application-uow.js"),
      import("./chargeback-fact-application-uow.js"),
      import("./chargeback-resolution-uow.js"),
      import("./settlement-persistence-port.js"),
      import("./bank-cash-pool-port.js"),
      import("./reconciliation-port.js"),
      import("./rate-budget-port.js")
    ]);

    expect(modules.map((module) => Object.keys(module))).toEqual(modules.map(() => []));
  });
});
