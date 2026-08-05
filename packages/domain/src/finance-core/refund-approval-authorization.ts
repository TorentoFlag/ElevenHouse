import type { ProviderDispatchAuthorizationReceipt } from "./ports/provider-operation-intent-creation-uow";
import type { VerifiedRefundApprovalAuthority } from "./ports/trusted-finance-evidence";

/**
 * Narrows a persistence-verified refund approval into the only provider-dispatch authorization
 * accepted for that refund. This is a derivation, not an authority issuer: callers cannot create
 * the branded input structurally.
 */
export function deriveRefundProviderDispatchAuthorization(
  authority: VerifiedRefundApprovalAuthority
): Extract<ProviderDispatchAuthorizationReceipt, { kind: "refund_authorization" }> {
  return Object.freeze({
    kind: "refund_authorization" as const,
    authorityId: authority.approvalAuthorityId,
    authorityVersion: authority.approvalAuthorityVersion,
    authorityDigest: authority.approvalAuthorityDigest,
    // Provider-operation source chains are scoped to the original economic payment. The refund
    // itself remains independently idempotent through its provider envelope/external ID.
    sourceId: authority.orderId,
    refundId: authority.refundId,
    refundVersion: authority.refundVersion,
    approvedCumulativeAmountMinor: authority.approvedCumulativeRefundedMinor
  }) as Extract<ProviderDispatchAuthorizationReceipt, { kind: "refund_authorization" }>;
}
