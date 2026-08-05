import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ArcProviderAccountIdentity } from "../provider-account";
import type { OrderEconomicsSnapshot } from "../order-economics";
import type { RefundCumulativePositionRef } from "./refund-cumulative-position-types";
import type { RefundPostingAuthorityRef } from "./refund-posting-authority-ref";

export type { RefundPostingAuthorityRef } from "./refund-posting-authority-ref";

export type RefundPostingEvidenceRef<Kind extends string = string> = Readonly<{
  kind: Kind;
  evidenceId: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundFundingReservationRef = Readonly<{
  kind: "refund_funding_reservation";
  reservationId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundPostingPriorAllocationAuthorityRef = Readonly<{
  kind: "refund_posting_allocation_authority";
  authorityId: string;
  version: number;
  nextCumulativeRefunded: Money;
  nextCumulativePayableReversed: Money;
  nextCumulativePlatformReversed: Money;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundSourceAllocation = Readonly<{
  sourceAmount: Money;
  priorAllocatedAmount: Money;
  nextAllocatedAmount: Money;
}>;

export type RefundShortfallTreatment =
  | Readonly<{
      accountCode: "astrologer_recovery_receivable";
      authorityRef: RefundPostingAuthorityRef<"refund_recovery_allocation">;
    }>
  | Readonly<{
      accountCode: "platform_refund_loss";
      authorityRef: RefundPostingAuthorityRef<"refund_platform_loss_allocation">;
    }>;

export type RefundPayableComponent = Readonly<{
  kind: "payable_lot";
  componentId: string;
  rootLotId: string;
  sourceLotId: string;
  refundPendingLotId: string;
  originalBucket: "pending" | "available" | "reserved";
  payoutAllocationId: string | null;
  amount: Money;
}>;

export type RefundAlreadyPaidComponent = Readonly<{
  kind: "already_paid";
  componentId: string;
  rootLotId: string;
  payableLotId: string;
  payoutRequestId: string;
  payoutAllocationId: string;
  payoutPaidAuthorityRef: RefundPostingAuthorityRef<"payout_paid">;
  sourceAllocation: RefundSourceAllocation;
  fundingReservationRef: RefundFundingReservationRef;
  treatment: RefundShortfallTreatment;
  amount: Money;
}>;

export type RefundInFlightPayoutComponent = Readonly<{
  kind: "in_flight_payout";
  componentId: string;
  rootLotId: string;
  payableLotId: string;
  payoutRequestId: string;
  payoutAllocationId: string;
  payoutProcessingAuthorityRef: RefundPostingAuthorityRef<"payout_processing_manual">;
  bridgeAllocationRef: RefundPostingAuthorityRef<"refund_payout_bridge_allocation">;
  bridgePolicyAuthorityRef: RefundPostingAuthorityRef<"refund_payout_bridge_policy">;
  sourceAllocation: RefundSourceAllocation;
  fundingReservationRef: RefundFundingReservationRef;
  paidOutcomeTreatment: RefundShortfallTreatment;
  amount: Money;
}>;

export type RefundPlatformCommissionComponent = Readonly<{
  kind: "platform_commission";
  componentId: string;
  sourceJournalTransactionId: string;
  sourceJournalEntryIndex: number;
  sourceAccountCode: "platform_commission_deferred" | "platform_commission_revenue";
  sourceEntryDigest: FinanceAuthorizationPayloadHash;
  sourceAllocation: RefundSourceAllocation;
  fundingReservationRef: RefundFundingReservationRef;
  amount: Money;
}>;

export type RefundPostingAllocationAuthorityV1 = Readonly<{
  kind: "refund_posting_allocation_authority";
  schemaVersion: 1;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  authorityId: string;
  version: number;
  refundId: string;
  orderId: string;
  astrologerUserId: string;
  providerAccount: ArcProviderAccountIdentity;
  providerPaymentId: string;
  providerIntentId: string;
  providerRequestDigest: FinanceAuthorizationPayloadHash;
  approvedAt: string;
  allocationStatus: "approved";
  fundingStatus: "fully_funded";
  priorAllocationAuthorityRef: RefundPostingPriorAllocationAuthorityRef | null;
  confirmedCumulativePositionRef: RefundCumulativePositionRef;
  refundApprovalAuthorityRef: RefundPostingAuthorityRef<"refund_approval">;
  orderEconomics: OrderEconomicsSnapshot;
  orderEconomicsDigest: FinanceAuthorizationPayloadHash;
  capturedGross: Money;
  capturedPayable: Money;
  capturedPlatformCommission: Money;
  priorCumulativeRefunded: Money;
  nextCumulativeRefunded: Money;
  priorCumulativePayableReversed: Money;
  nextCumulativePayableReversed: Money;
  priorCumulativePlatformReversed: Money;
  nextCumulativePlatformReversed: Money;
  refundAmount: Money;
  payableLotAmount: Money;
  alreadyPaidAmount: Money;
  inFlightPayoutAmount: Money;
  platformCommissionAmount: Money;
  payableComponents: readonly RefundPayableComponent[];
  alreadyPaidComponents: readonly RefundAlreadyPaidComponent[];
  inFlightPayoutComponents: readonly RefundInFlightPayoutComponent[];
  platformCommissionComponents: readonly RefundPlatformCommissionComponent[];
  providerClearingComponentId: string;
  allocationDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundCanonicalProviderEvidence = Readonly<{
  kind: "canonical_provider_read" | "verified_webhook" | "settlement_entry";
  reference: string;
  digest: FinanceAuthorizationPayloadHash;
  observedAt: string;
}>;

export type RefundProviderTerminalIntentProjection = Readonly<{
  kind: "refund_provider_terminal_intent";
  intentId: string;
  version: number;
  providerAccount: ArcProviderAccountIdentity;
  purpose: "client_order";
  operationKind: "refund";
  source: Readonly<{ kind: "client_order"; id: string }>;
  providerPaymentId: string;
  canonicalRequestDigest: FinanceAuthorizationPayloadHash;
  status: "succeeded" | "failed";
  canonicalEvidence: RefundCanonicalProviderEvidence;
  projectionDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundTerminalOutcome =
  | Readonly<{
      kind: "succeeded";
      providerRefundId: string;
      refundAmount: Money;
      priorProviderTotalRefunded: Money;
      nextProviderTotalRefunded: Money;
      recordedAt: string;
    }>
  | Readonly<{
      kind: "failed";
      providerRefundId: string;
      refundAmount: Money;
      failureCode: string;
      recordedAt: string;
    }>;

export type UnverifiedRefundTerminalEvidenceBindingV1 = Readonly<{
  kind: "refund_terminal_evidence_binding";
  schemaVersion: 1;
  bindingId: string;
  version: string;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  allocationAuthorityRef: RefundPostingAuthorityRef<"refund_posting_allocation_authority">;
  operationReceiptRef: RefundPostingEvidenceRef<"payable_lot_operation_receipt">;
  terminalAuthorityRef: RefundPostingAuthorityRef<"refund_confirmed" | "refund_failed">;
  providerIntent: RefundProviderTerminalIntentProjection;
  outcome: RefundTerminalOutcome;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;
