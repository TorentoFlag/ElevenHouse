import type {
  BankEvidenceArtifactRef,
  FinanceCurrency,
  FinanceDigest,
  FinanceProviderAccountIdentity,
  RawBankArtifactRef,
  RawProviderArtifactRef
} from "./finance-port-types";

declare const verifiedProviderOperationEvidenceBrand: unique symbol;
declare const verifiedWebhookIngressEvidenceBrand: unique symbol;
declare const verifiedWebhookSemanticEvidenceBrand: unique symbol;
declare const verifiedPayoutNoTransferEvidenceBrand: unique symbol;
declare const verifiedRefundProviderOutcomeBrand: unique symbol;
declare const verifiedChargebackProviderEvidenceBrand: unique symbol;
declare const verifiedSettlementPageEvidenceBrand: unique symbol;
declare const verifiedArcMerchantPayoutEvidenceBrand: unique symbol;
declare const verifiedArcMerchantPayoutStatementEvidenceBrand: unique symbol;
declare const verifiedBankStatementEvidenceBrand: unique symbol;
declare const verifiedBankLiquiditySnapshotEvidenceBrand: unique symbol;
declare const bankLiquiditySnapshotAttestationReceiptRefBrand: unique symbol;
declare const verifiedPayoutDestinationSnapshotBrand: unique symbol;
declare const verifiedPayoutApprovalAuthorityBrand: unique symbol;
declare const verifiedPayoutExecutionEvidenceBrand: unique symbol;
declare const verifiedPayoutPaidEvidenceBrand: unique symbol;
declare const verifiedRefundApprovalAuthorityBrand: unique symbol;
declare const verifiedOnlineWalletRefundApprovalAuthorityBrand: unique symbol;
declare const verifiedChargebackResolutionAuthorityBrand: unique symbol;
declare const verifiedPayoutBankReturnEvidenceBrand: unique symbol;

export type VerifiedProviderOperationEvidence = Readonly<{
  kind: "verified_provider_operation_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string | null;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerOperationIntentId: string;
  operationKind:
    | "checkout_session_create"
    | "card_setup"
    | "card_setup_execute"
    | "card_setup_3ds_method_complete"
    | "saved_card_charge"
    | "saved_card_charge_3ds_method_complete"
    | "refund"
    | "void";
  providerOperationId: string;
  canonicalRequestDigest: FinanceDigest;
  idempotencyKey: string;
  outcome: "succeeded" | "failed" | "ambiguous";
  providerPaymentId: string | null;
  amountMinor: string | null;
  currency: FinanceCurrency | null;
  artifact: RawProviderArtifactRef;
  observedAt: string;
  [verifiedProviderOperationEvidenceBrand]: true;
}>;

export type VerifiedWebhookIngressEvidence = Readonly<{
  kind: "verified_webhook_ingress_evidence";
  provider: "arc_pay";
  providerAccount: FinanceProviderAccountIdentity;
  receivingEnvironment: "sandbox" | "live";
  webhookId: string;
  providerEventType: string;
  rawBodyDigest: FinanceDigest;
  sealedPayloadRef: string;
  signatureScheme: string;
  verifierContractVersion: string;
  webhookSigningKeyVersionId: string;
  signedTimestamp: string;
  signatureEvidenceDigest: FinanceDigest;
  verifiedAt: string;
  receivedAt: string;
  [verifiedWebhookIngressEvidenceBrand]: true;
}>;

type VerifiedWebhookSemanticEvidenceCommon = Readonly<{
  kind: "verified_webhook_semantic_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  webhookId: string;
  semanticSourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  canonicalFactDigest: FinanceDigest;
  artifact: RawProviderArtifactRef;
  observedAt: string;
  [verifiedWebhookSemanticEvidenceBrand]: true;
}>;

/**
 * Canonical webhook evidence deliberately carries the full fact shape needed by the persistence
 * boundary. A capture worker cannot reconstruct amount, session or payment identity from a raw
 * webhook after the provider read; those values are bound here before the semantic fact commits.
 */
export type VerifiedWebhookSemanticEvidence =
  | Readonly<
      VerifiedWebhookSemanticEvidenceCommon & {
        semanticSourceKind: "payment_transition";
        economicPaymentIntentId: string;
        economicPaymentSessionId: string;
        providerPaymentId: string;
        amountMinor: string;
        currency: FinanceCurrency;
      }
    >
  | Readonly<
      VerifiedWebhookSemanticEvidenceCommon & {
        semanticSourceKind: "refund" | "chargeback" | "settlement_entry";
        economicPaymentIntentId: string;
        economicPaymentSessionId: null;
        providerPaymentId: null;
        amountMinor: null;
        currency: null;
      }
    >;

export type VerifiedPayoutNoTransferEvidence = Readonly<{
  kind: "verified_payout_no_transfer_evidence";
  payoutRequestId: string;
  payoutVersion: number;
  walletId: string;
  walletRevision: string;
  activeBridgeInventoryRevision: string;
  bankCashPoolId: string;
  bankLiquidityRevision: string;
  bankExposureId: string;
  bankExposureVersion: number;
  currency: FinanceCurrency;
  outcome: "definitive_no_transfer";
  bankArtifact: BankEvidenceArtifactRef;
  canonicalOutcomeDigest: FinanceDigest;
  determinedAt: string;
  [verifiedPayoutNoTransferEvidenceBrand]: true;
}>;

export type VerifiedRefundProviderOutcome = Readonly<{
  kind: "verified_refund_provider_outcome";
  providerAccount: FinanceProviderAccountIdentity;
  refundId: string;
  providerRefundId: string;
  providerPaymentId: string;
  outcome: "succeeded" | "failed" | "ambiguous";
  cumulativeRefundedMinor: string;
  currency: FinanceCurrency;
  artifact: RawProviderArtifactRef;
  observedAt: string;
  [verifiedRefundProviderOutcomeBrand]: true;
}>;

/**
 * Step-up-authorised V2 refund decision. Unlike the legacy refund authority it is bound to the
 * online capture/wallet graph and can only authorize a provider command after V2 reservation.
 */
export type VerifiedOnlineWalletRefundApprovalAuthority = Readonly<{
  kind: "verified_online_wallet_refund_approval_authority";
  refundCaseId: string;
  refundCandidateId: string;
  refundCandidateVersion: number;
  orderId: string;
  captureApplicationId: string;
  walletId: string;
  economicPaymentIntentId: string;
  providerAccount: FinanceProviderAccountIdentity;
  providerPaymentId: string;
  previousCumulativeRefundedMinor: string;
  approvedCumulativeRefundedMinor: string;
  approvalAuthorityId: string;
  approvalAuthorityVersion: string;
  approvalAuthorityDigest: FinanceDigest;
  approvedByActorId: string;
  approvedAt: string;
  [verifiedOnlineWalletRefundApprovalAuthorityBrand]: true;
}>;

export type VerifiedChargebackProviderEvidence = Readonly<{
  kind: "verified_chargeback_provider_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  chargebackCaseId: string;
  providerPaymentId: string;
  lifecycleFact: "opened" | "provisional_loss" | "won" | "lost";
  cumulativePrincipalMinor: string;
  currency: FinanceCurrency;
  artifact: RawProviderArtifactRef;
  observedAt: string;
  [verifiedChargebackProviderEvidenceBrand]: true;
}>;

export type VerifiedSettlementPageEvidence = Readonly<{
  kind: "verified_settlement_page_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  stream: "settlement_ledger" | "settlement_payouts";
  windowGeneration: number;
  providerPageCursor: string | null;
  artifact: RawProviderArtifactRef;
  fetchedAt: string;
  [verifiedSettlementPageEvidenceBrand]: true;
}>;

/**
 * Decoder-issued aggregate ArcPay payout evidence. A completed merchant payout is one net bank
 * transfer to ElevenHouse; it is not the settlement state of an individual client payment.
 */
export type VerifiedArcMerchantPayoutEvidence = Readonly<{
  kind: "verified_arc_merchant_payout_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  merchantPayoutId: string;
  providerBankPayoutId: string;
  amountMinor: string;
  currency: FinanceCurrency;
  outcome: "completed";
  completedAt: string;
  artifact: RawProviderArtifactRef;
  observedAt: string;
  [verifiedArcMerchantPayoutEvidenceBrand]: true;
}>;

export type VerifiedArcMerchantPayoutStatementPaymentLine = Readonly<{
  lineNumber: number;
  providerPaymentId: string;
  externalId: string;
  amountMinor: string;
  feeAmountMinor: string;
  currency: FinanceCurrency;
  lineDigest: FinanceDigest;
}>;

/**
 * Decoder-issued evidence from the downloadable ArcPay payout statement. ArcPay's payout list API
 * proves only the aggregate bank transfer; this statement is the separate authority that binds an
 * individual provider payment to that aggregate payout.
 */
export type VerifiedArcMerchantPayoutStatementEvidence = Readonly<{
  kind: "verified_arc_merchant_payout_statement_evidence";
  providerAccount: FinanceProviderAccountIdentity;
  merchantPayoutId: string;
  providerBankPayoutId: string;
  bankReference: string;
  reportedNetPayoutMinor: string;
  currency: FinanceCurrency;
  decoderProfileId: string;
  decoderProfileVersion: number;
  decoderProfileDigest: FinanceDigest;
  decodedPaymentLinesDigest: FinanceDigest;
  includedPayments: readonly VerifiedArcMerchantPayoutStatementPaymentLine[];
  artifact: RawProviderArtifactRef;
  observedAt: string;
  [verifiedArcMerchantPayoutStatementEvidenceBrand]: true;
}>;

export type VerifiedBankStatementEvidence = Readonly<{
  kind: "verified_bank_statement_evidence";
  bankCashPoolId: string;
  bankStatementEntryId: string;
  sourceStatementId: string;
  /** Immutable cursor/checkpoint emitted by the bank-statement decoder for this source export. */
  sourceCheckpoint: string;
  sourceRowId: string;
  direction: "credit" | "debit";
  amountMinor: string;
  currency: FinanceCurrency;
  occurredAt: string;
  bankReference: string;
  artifact: RawBankArtifactRef;
  [verifiedBankStatementEvidenceBrand]: true;
}>;

export type VerifiedBankLiquiditySnapshotEvidence = Readonly<{
  kind: "verified_bank_liquidity_snapshot_evidence";
  bankCashPoolId: string;
  balanceBasis: "unrestricted_available";
  unrestrictedAvailableMinor: string;
  currency: FinanceCurrency;
  sourceCheckpoint: string;
  asOf: string;
  expiresAt: string;
  evidenceDigest: FinanceDigest;
  attestation: BankLiquiditySnapshotAttestationReceiptRef;
  [verifiedBankLiquiditySnapshotEvidenceBrand]: true;
}>;

/** Immutable receipt binding a manual snapshot to exact bank evidence and a consumed WebAuthn grant. */
export type BankLiquiditySnapshotAttestationReceiptRef = Readonly<{
  kind: "bank_liquidity_snapshot_attestation_receipt";
  attestationId: string;
  version: 1;
  canonicalDigest: FinanceDigest;
  [bankLiquiditySnapshotAttestationReceiptRefBrand]: true;
}>;

export type VerifiedPayoutDestinationSnapshot = Readonly<{
  kind: "verified_payout_destination_snapshot";
  payoutMethodId: string;
  payoutMethodVersion: number;
  destinationKind: "bank_card" | "bank_account";
  beneficiaryFingerprint: FinanceDigest;
  redactedDisplay: string;
  encryptedDestinationRef: string;
  verifiedAt: string;
  [verifiedPayoutDestinationSnapshotBrand]: true;
}>;

export type VerifiedPayoutApprovalAuthority = Readonly<{
  kind: "verified_payout_approval_authority";
  payoutRequestId: string;
  payoutVersion: number;
  reviewerActorId: string;
  approverActorId: string;
  transactionAuthorizationId: string;
  authorizationPayloadDigest: FinanceDigest;
  authorityVersion: string;
  payoutMethodId: string;
  payoutMethodVersion: number;
  beneficiaryFingerprint: FinanceDigest;
  amountMinor: string;
  currency: FinanceCurrency;
  bankCashPoolId: string;
  separationPolicy: "reviewer_must_differ_from_approver";
  authorizedAt: string;
  [verifiedPayoutApprovalAuthorityBrand]: true;
}>;

export type VerifiedPayoutExecutionEvidence = Readonly<{
  kind: "verified_payout_execution_evidence";
  payoutRequestId: string;
  payoutVersion: number;
  executorActorId: string;
  bankCashPoolId: string;
  bankExposureId: string;
  payoutMethodId: string;
  payoutMethodVersion: number;
  beneficiaryFingerprint: FinanceDigest;
  amountMinor: string;
  currency: FinanceCurrency;
  approvalReceiptId: string;
  approvalReceiptVersion: number;
  approvalReceiptDigest: FinanceDigest;
  approvalAuthorityId: string;
  approvalAuthorityVersion: string;
  approvalAuthorityDigest: FinanceDigest;
  approvalReviewerActorId: string;
  approvalApproverActorId: string;
  initiatedAt: string;
  evidenceDigest: FinanceDigest;
  [verifiedPayoutExecutionEvidenceBrand]: true;
}>;

export type VerifiedPayoutPaidEvidence = Readonly<{
  kind: "verified_payout_paid_evidence";
  payoutRequestId: string;
  payoutVersion: number;
  bankCashPoolId: string;
  bankExposureId: string;
  payoutMethodId: string;
  payoutMethodVersion: number;
  beneficiaryFingerprint: FinanceDigest;
  amountMinor: string;
  currency: FinanceCurrency;
  approvalReceiptId: string;
  approvalReceiptVersion: number;
  approvalReceiptDigest: FinanceDigest;
  approvalAuthorityId: string;
  approvalAuthorityVersion: string;
  approvalAuthorityDigest: FinanceDigest;
  approvalReviewerActorId: string;
  approvalApproverActorId: string;
  executorActorId: string;
  bankReference: string;
  transferredAt: string;
  evidenceDocumentRef: string;
  evidenceDigest: FinanceDigest;
  confirmerActorId: string;
  separationPolicy: "approver_and_executor_must_differ_from_paid_confirmer";
  [verifiedPayoutPaidEvidenceBrand]: true;
}>;

export type VerifiedRefundApprovalAuthority = Readonly<{
  kind: "verified_refund_approval_authority";
  refundId: string;
  refundVersion: number;
  orderId: string;
  economicPaymentIntentId: string;
  previousCumulativeRefundedMinor: string;
  approvedCumulativeRefundedMinor: string;
  allocationAuthorityId: string;
  allocationAuthorityVersion: string;
  allocationAuthorityDigest: FinanceDigest;
  approvalAuthorityId: string;
  approvalAuthorityVersion: string;
  approvalAuthorityDigest: FinanceDigest;
  approvedByActorId: string;
  approvedAt: string;
  [verifiedRefundApprovalAuthorityBrand]: true;
}>;

export type VerifiedChargebackResolutionAuthority = Readonly<{
  kind: "verified_chargeback_resolution_authority";
  chargebackCaseId: string;
  expectedChargebackVersion: number;
  resolution: "won" | "lost";
  cumulativePrincipalMinor: string;
  /** The terminal provider fact is verified and sealed before this authority is issued. */
  providerEvidence: VerifiedChargebackProviderEvidence;
  allocationAuthorityId: string;
  allocationAuthorityVersion: string;
  allocationAuthorityDigest: FinanceDigest;
  decidedByActorId: string;
  decidedAt: string;
  [verifiedChargebackResolutionAuthorityBrand]: true;
}>;

export type VerifiedPayoutBankReturnEvidence = Readonly<{
  kind: "verified_payout_bank_return_evidence";
  payoutRequestId: string;
  payoutVersion: number;
  paidConfirmationReceiptId: string;
  paidConfirmationReceiptVersion: number;
  paidConfirmationReceiptDigest: FinanceDigest;
  bankCashPoolId: string;
  bankExposureId: string;
  bankStatementEntryId: string;
  amountMinor: string;
  currency: FinanceCurrency;
  bankReference: string;
  returnedAt: string;
  evidenceDigest: FinanceDigest;
  [verifiedPayoutBankReturnEvidenceBrand]: true;
}>;
