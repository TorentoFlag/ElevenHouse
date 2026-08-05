export type OnlineWalletPayoutStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing_manual"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";

export type OnlineWalletPayoutStateTransitionPlan = Readonly<{
  payoutRequestId: string;
  previousStatus: OnlineWalletPayoutStatus;
  nextStatus: OnlineWalletPayoutStatus;
  expectedVersion: string;
  nextVersion: string;
  transitionKind: OnlineWalletPayoutStatus;
}>;

export class OnlineWalletPayoutLifecycleError extends Error {
  readonly code = "online_wallet_payout_lifecycle_error";

  constructor() {
    super("Online payout transition violates the manual payout lifecycle");
    this.name = "OnlineWalletPayoutLifecycleError";
  }
}

const allowedTransitions: Readonly<Record<OnlineWalletPayoutStatus, readonly OnlineWalletPayoutStatus[]>> =
  Object.freeze({
    requested: ["under_review", "rejected", "cancelled"],
    under_review: ["approved", "rejected", "cancelled"],
    approved: ["processing_manual", "rejected", "cancelled"],
    processing_manual: ["paid", "failed"],
    paid: [],
    failed: [],
    rejected: [],
    cancelled: []
  });

/**
 * Transition planning is intentionally separate from money movements. Review and approval only
 * advance the immutable payout aggregate; only a later bank-evidenced `paid` command may settle
 * `payout_pending`, and a bank return is recorded as a separate correction fact.
 */
export function createOnlineWalletPayoutStateTransitionPlan(input: {
  readonly payoutRequestId: string;
  readonly previousStatus: OnlineWalletPayoutStatus;
  readonly expectedVersion: string;
  readonly nextStatus: OnlineWalletPayoutStatus;
}): OnlineWalletPayoutStateTransitionPlan {
  identifier(input.payoutRequestId);
  revision(input.expectedVersion);
  const allowed = allowedTransitions[input.previousStatus];
  if (!allowed?.includes(input.nextStatus)) throw new OnlineWalletPayoutLifecycleError();
  return Object.freeze({
    payoutRequestId: input.payoutRequestId,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    expectedVersion: input.expectedVersion,
    nextVersion: (BigInt(input.expectedVersion) + 1n).toString(),
    transitionKind: input.nextStatus
  });
}

function identifier(value: string): void {
  if (value.trim() !== value || value.length === 0 || value.length > 160) {
    throw new OnlineWalletPayoutLifecycleError();
  }
}

function revision(value: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) throw new OnlineWalletPayoutLifecycleError();
}
