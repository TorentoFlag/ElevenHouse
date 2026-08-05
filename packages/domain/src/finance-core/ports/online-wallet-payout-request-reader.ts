import type { OnlineWalletPayoutStatus } from "../online-wallet-payout-lifecycle";

/**
 * Safe projection needed by the astrologer payout command boundary. It deliberately exposes
 * no plaintext beneficiary data and never authorizes a wallet mutation by itself.
 */
export type OnlineWalletPayoutRequestProjection = Readonly<{
  payoutRequestId: string;
  walletId: string;
  astrologerUserId: string;
  amountMinor: string;
  currency: "RUB";
  status: OnlineWalletPayoutStatus;
  version: string;
  requestedAt: string;
  latestTransitionActorUserId: string | null;
  latestTransitionOccurredAt: string;
  latestTransitionFailureReason: string | null;
  latestTransitionAdminNote: string | null;
}>;

/**
 * The admin queue is intentionally a redacted operational projection. It contains neither the
 * sealed beneficiary destination nor any path to reveal it; bank-operator access is a separate
 * step-up protected flow.
 */
export type ListOnlineWalletPayoutRequestsInput = Readonly<{
  statuses?: readonly OnlineWalletPayoutStatus[];
  limit: number;
}>;

/** Owner-scoped history for the astrologer cabinet. It is deliberately separate from the admin
 * queue shape so an omitted ownership predicate can never turn into a cross-tenant read. */
export type ListAstrologerOnlineWalletPayoutRequestsInput = Readonly<{
  astrologerUserId: string;
  limit: number;
}>;

export type OnlineWalletPayoutRequestReader = Readonly<{
  findWalletId(input: Readonly<{
    astrologerUserId: string;
    currency: "RUB";
  }>): Promise<string | null>;
  findPayoutRequest(input: Readonly<{
    payoutRequestId: string;
    astrologerUserId: string;
  }>): Promise<OnlineWalletPayoutRequestProjection | null>;
  findPayoutRequestById(
    payoutRequestId: string
  ): Promise<OnlineWalletPayoutRequestProjection | null>;
  listPayoutRequests(
    input: ListOnlineWalletPayoutRequestsInput
  ): Promise<readonly OnlineWalletPayoutRequestProjection[]>;
  listPayoutRequestsForAstrologer(
    input: ListAstrologerOnlineWalletPayoutRequestsInput
  ): Promise<readonly OnlineWalletPayoutRequestProjection[]>;
}>;
