import type { ProviderAccountIdentityBinding } from "../provider-account-binding";

/**
 * Read-only V2 position used to bind an ArcPay refund's cumulative provider amount before its
 * canonical re-read. It never creates an accounting effect and must not read the legacy ledger.
 */
export type OnlineWalletRefundPositionReader = Readonly<{
  findRefundPosition(
    input: Readonly<{
      providerAccount: ProviderAccountIdentityBinding;
      providerPaymentId: string;
    }>
  ): Promise<
    | Readonly<{
        economicPaymentIntentId: string;
        previousCumulativeRefundedMinor: string;
      }>
    | null
  >;
}>;

/**
 * Resolves the exact V2 refund case that was approved before ArcPay received the request.
 * The canonical webhook must settle that frozen case, never reconstruct a refund from current
 * wallet positions.
 */
export type ApprovedOnlineWalletRefundCaseReader = Readonly<{
  findApprovedRefundCase(
    input: Readonly<{
      providerAccount: ProviderAccountIdentityBinding;
      economicPaymentIntentId: string;
      providerPaymentId: string;
      previousCumulativeRefundedMinor: string;
      cumulativeRefundedMinor: string;
    }>
  ): Promise<Readonly<{ refundCaseId: string }> | null>;
}>;
