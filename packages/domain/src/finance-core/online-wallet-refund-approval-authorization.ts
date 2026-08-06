import type { ProviderDispatchAuthorizationReceipt } from "./ports/provider-operation-intent-creation-uow";
import type { VerifiedOnlineWalletRefundApprovalAuthority } from "./ports/trusted-finance-evidence";

/**
 * The generic provider-operation outbox uses one refund authorization shape. This derivation
 * deliberately accepts only the branded V2 authority and therefore does not make a legacy
 * refund case a possible input to a new online-wallet operation.
 */
export function deriveOnlineWalletRefundProviderDispatchAuthorization(
  authority: VerifiedOnlineWalletRefundApprovalAuthority
): Extract<ProviderDispatchAuthorizationReceipt, { kind: "refund_authorization" }> {
  return Object.freeze({
    kind: "refund_authorization" as const,
    authorityId: authority.approvalAuthorityId,
    authorityVersion: authority.approvalAuthorityVersion,
    authorityDigest: authority.approvalAuthorityDigest,
    sourceId: authority.orderId,
    refundId: authority.refundCaseId,
    refundVersion: 1,
    approvedCumulativeAmountMinor: authority.approvedCumulativeRefundedMinor
  }) as Extract<ProviderDispatchAuthorizationReceipt, { kind: "refund_authorization" }>;
}
