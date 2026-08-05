import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";

export type BankSuspenseReclassificationOriginalUnknown = Readonly<{
  classificationPath: "unknown_then_reclassification";
  classificationAuthorityId: string;
  classificationVersion: number;
  journalTransactionId: string;
  journalTransactionDigest: FinanceAuthorizationPayloadHash;
  occurredAt: string;
  postedAt: string;
  operationId: string;
  sourceKey: Readonly<{
    kind: "bank";
    sourceId: string;
    operation: "unknown_debit_recorded" | "unknown_credit_recorded";
  }>;
  evidenceId: string;
  evidenceDigest: FinanceAuthorizationPayloadHash;
  bankStatementEntryId: string;
  bankCashPoolId: string;
  direction: "debit" | "credit";
  amount: Money;
}>;

export type UnverifiedConsumedBankStatementMatchAuthorizationBinding = Readonly<{
  authorizationId: string;
  actorUserId: string;
  actionKind: "bank_statement_match";
  aggregateId: string;
  expectedVersion: number;
  payloadHash: FinanceAuthorizationPayloadHash;
  claimedStatus: "consumed";
  consumedAt: string;
}>;

export type UnverifiedBankReclassificationApprovalBinding = Readonly<{
  kind: "bank_reclassification_approval_binding";
  bindingId: string;
  version: string;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  payloadHash: FinanceAuthorizationPayloadHash;
  makerBinding: UnverifiedConsumedBankStatementMatchAuthorizationBinding;
  checkerBinding: UnverifiedConsumedBankStatementMatchAuthorizationBinding;
  issuedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type UnverifiedBankOutboundClearingExposureBinding = Readonly<{
  kind: "bank_outbound_clearing_exposure_binding";
  bindingId: string;
  version: string;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  bankExposureId: string;
  payoutRequestId: string;
  bankCashPoolId: string;
  amount: Money;
  claimedRemainingAmount: Money;
  claimedConsumptionStatus: "unconsumed";
  clearingJournalTransactionId: string;
  clearingJournalTransactionDigest: FinanceAuthorizationPayloadHash;
  issuedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type UnverifiedArcMerchantPayoutClearingExposureBinding = Readonly<{
  kind: "arc_merchant_payout_clearing_exposure_binding";
  bindingId: string;
  version: string;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  providerAccountId: string;
  merchantPayoutId: string;
  bankCashPoolId: string;
  amount: Money;
  claimedRemainingAmount: Money;
  claimedConsumptionStatus: "unconsumed";
  clearingJournalTransactionId: string;
  clearingJournalTransactionDigest: FinanceAuthorizationPayloadHash;
  issuedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type BankSuspenseReclassificationTarget =
  | Readonly<{
      kind: "payout_debit";
      exposureBinding: UnverifiedBankOutboundClearingExposureBinding;
    }>
  | Readonly<{
      kind: "merchant_payout_credit";
      exposureBinding: UnverifiedArcMerchantPayoutClearingExposureBinding;
    }>
  | Readonly<{
      kind: "returned_payout_credit";
      payoutRequestId: string;
      proposedAllocations: readonly ReturnedPayoutCreditAllocation[];
    }>;

export type ReturnedPayoutCreditAllocation = Readonly<{
  astrologerUserId: string;
  amount: Money;
  originalSaleId: string;
  componentId: string;
  payableLotId: string;
  payoutAllocationId: string;
}>;

export type UnverifiedBankSuspenseReclassificationBinding = Readonly<{
  kind: "unverified_bank_suspense_reclassification_binding";
  authorityId: string;
  version: number;
  operationId: string;
  direction: "debit" | "credit";
  bankCashPoolId: string;
  amount: Money;
  approvedAt: string;
  originalUnknown: BankSuspenseReclassificationOriginalUnknown;
  approvalBinding: UnverifiedBankReclassificationApprovalBinding;
  target: BankSuspenseReclassificationTarget;
}>;
