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
