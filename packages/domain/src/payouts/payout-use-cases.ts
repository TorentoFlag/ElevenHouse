import type { Money } from "../money";
import type {
  CreateLedgerTransactionInput,
  LedgerStore,
  LedgerTransactionRecord
} from "../wallet";
import type {
  PayoutMethodRecord,
  PayoutRequestRecord,
  PayoutRequestStatus,
  PayoutStore
} from "./payout-store";

export type { PayoutMethodRecord, PayoutRequestRecord } from "./payout-store";

export type PayoutCommandStore = Pick<
  PayoutStore,
  "createRequest" | "findDefaultMethod" | "findRequestById" | "updateRequestStatus"
> &
  Pick<LedgerStore, "createTransaction" | "findWalletBalance">;

export type PayoutStatusCommandStore = Pick<PayoutStore, "findRequestById" | "updateRequestStatus"> &
  Pick<LedgerStore, "createTransaction" | "findWalletBalance">;

export type RequestAstrologerPayoutInput = {
  readonly store: PayoutCommandStore;
  readonly astrologerUserId: string;
  readonly amount: Money;
  readonly metadata: Record<string, unknown>;
  readonly now: string;
};

export type ReleaseAstrologerFundsFromHoldInput = {
  readonly store: Pick<LedgerStore, "createTransaction">;
  readonly astrologerUserId: string;
  readonly orderId: string;
  readonly amount: Money;
  readonly reason: "hold_expired" | "settlement_cleared" | "hold_expired_and_settlement_cleared";
  readonly now: string;
};

export type ApprovePayoutStatusUpdateInput = {
  readonly store: PayoutStatusCommandStore;
  readonly payoutRequestId: string;
  readonly adminUserId: string;
  readonly update: PayoutStatusUpdate;
  readonly now: string;
};

export type PayoutStatusUpdate =
  | {
      readonly status: "under_review" | "approved" | "processing_manual";
      readonly adminNote?: string | null;
    }
  | {
      readonly status: "processing_provider";
      readonly adminNote?: string | null;
      readonly providerPayoutId?: string;
    }
  | {
      readonly status: "paid";
      readonly externalReference: string;
      readonly transferredAt: string;
      readonly adminNote?: string | null;
      readonly providerPayoutId?: string;
    }
  | {
      readonly status: "failed" | "rejected";
      readonly failureReason: string;
      readonly adminNote?: string | null;
    }
  | {
      readonly status: "cancelled";
      readonly adminNote?: string | null;
    };

export class PayoutMethodMissingError extends Error {
  readonly code = "payout_method_missing";

  constructor() {
    super("Default payout method is required before payout request");
    this.name = "PayoutMethodMissingError";
  }
}

export class PayoutInsufficientAvailableBalanceError extends Error {
  readonly code = "payout_insufficient_available_balance";

  constructor() {
    super("Payout request amount exceeds available wallet balance");
    this.name = "PayoutInsufficientAvailableBalanceError";
  }
}

export class PayoutRequestNotFoundError extends Error {
  readonly code = "payout_request_not_found";

  constructor() {
    super("Payout request was not found");
    this.name = "PayoutRequestNotFoundError";
  }
}

export class PayoutStatusTransitionError extends Error {
  readonly code = "payout_status_transition_invalid";

  constructor(readonly from: PayoutRequestStatus, readonly to: PayoutRequestStatus) {
    super(`Invalid payout status transition: ${from} -> ${to}`);
    this.name = "PayoutStatusTransitionError";
  }
}

export async function requestAstrologerPayout(
  input: RequestAstrologerPayoutInput
): Promise<PayoutRequestRecord> {
  assertPositiveRubMoney(input.amount);

  const [method, balance] = await Promise.all([
    input.store.findDefaultMethod(input.astrologerUserId),
    input.store.findWalletBalance(input.astrologerUserId)
  ]);
  if (!method) throw new PayoutMethodMissingError();
  if ((balance?.available.amountMinor ?? 0) < input.amount.amountMinor) {
    throw new PayoutInsufficientAvailableBalanceError();
  }

  const request = await input.store.createRequest({
    astrologerUserId: input.astrologerUserId,
    payoutMethodId: method.id,
    amount: input.amount,
    metadata: input.metadata,
    now: input.now
  });
  await input.store.createTransaction(
    createPayoutReservedLedgerTransaction({
      request,
      now: input.now
    })
  );
  return request;
}

export async function approvePayoutStatusUpdate(
  input: ApprovePayoutStatusUpdateInput
): Promise<PayoutRequestRecord> {
  const before = await input.store.findRequestById(input.payoutRequestId);
  if (!before) throw new PayoutRequestNotFoundError();
  if (before.status === input.update.status) return before;
  assertPayoutTransition(before.status, input.update.status);

  const updated = await input.store.updateRequestStatus({
    payoutRequestId: input.payoutRequestId,
    status: input.update.status,
    adminUserId: input.adminUserId,
    adminNote: "adminNote" in input.update ? input.update.adminNote ?? null : null,
    failureReason: "failureReason" in input.update ? input.update.failureReason : undefined,
    externalReference: "externalReference" in input.update ? input.update.externalReference : undefined,
    transferredAt: "transferredAt" in input.update ? input.update.transferredAt : undefined,
    providerPayoutId: "providerPayoutId" in input.update ? input.update.providerPayoutId : undefined,
    now: input.now
  });
  if (!updated) throw new PayoutRequestNotFoundError();

  const ledgerTransaction = createPayoutStatusLedgerTransaction({
    before,
    after: updated,
    adminUserId: input.adminUserId,
    now: input.now
  });
  if (ledgerTransaction) await input.store.createTransaction(ledgerTransaction);
  return updated;
}

export async function releaseAstrologerFundsFromHold(
  input: ReleaseAstrologerFundsFromHoldInput
): Promise<LedgerTransactionRecord> {
  assertPositiveRubMoney(input.amount);
  return input.store.createTransaction({
    operationType: "funds_released",
    orderId: input.orderId,
    payoutRequestId: null,
    occurredAt: input.now,
    postedAt: input.now,
    metadata: { reason: input.reason },
    entries: [
      {
        account: {
          accountType: "astrologer_pending",
          astrologerUserId: input.astrologerUserId,
          currency: input.amount.currency
        },
        side: "debit",
        amount: input.amount,
        metadata: { orderId: input.orderId, reason: input.reason }
      },
      {
        account: {
          accountType: "astrologer_available",
          astrologerUserId: input.astrologerUserId,
          currency: input.amount.currency
        },
        side: "credit",
        amount: input.amount,
        metadata: { orderId: input.orderId, reason: input.reason }
      }
    ]
  });
}

function createPayoutReservedLedgerTransaction(input: {
  readonly request: PayoutRequestRecord;
  readonly now: string;
}): CreateLedgerTransactionInput {
  return {
    operationType: "payout_reserved",
    orderId: null,
    payoutRequestId: input.request.id,
    occurredAt: input.now,
    postedAt: input.now,
    metadata: { payoutMethodId: input.request.payoutMethodId, method: input.request.method },
    entries: [
      {
        account: {
          accountType: "astrologer_available",
          astrologerUserId: input.request.astrologerUserId,
          currency: input.request.amount.currency
        },
        side: "debit",
        amount: input.request.amount,
        metadata: { payoutRequestId: input.request.id }
      },
      {
        account: {
          accountType: "astrologer_payout_pending",
          astrologerUserId: input.request.astrologerUserId,
          currency: input.request.amount.currency
        },
        side: "credit",
        amount: input.request.amount,
        metadata: { payoutRequestId: input.request.id }
      }
    ]
  };
}

function createPayoutStatusLedgerTransaction(input: {
  readonly before: PayoutRequestRecord;
  readonly after: PayoutRequestRecord;
  readonly adminUserId: string;
  readonly now: string;
}): CreateLedgerTransactionInput | null {
  if (input.after.status === "paid") {
    return {
      operationType: "payout_paid",
      orderId: null,
      payoutRequestId: input.after.id,
      occurredAt: input.after.transferredAt ?? input.now,
      postedAt: input.now,
      metadata: {
        adminUserId: input.adminUserId,
        externalReference: input.after.externalReference,
        providerPayoutId: input.after.providerPayoutId
      },
      entries: [
        {
          account: {
            accountType: "astrologer_payout_pending",
            astrologerUserId: input.after.astrologerUserId,
            currency: input.after.amount.currency
          },
          side: "debit",
          amount: input.after.amount,
          metadata: { payoutRequestId: input.after.id }
        },
        {
          account: {
            accountType: "payout_clearing",
            astrologerUserId: null,
            currency: input.after.amount.currency
          },
          side: "credit",
          amount: input.after.amount,
          metadata: {
            payoutRequestId: input.after.id,
            externalReference: input.after.externalReference
          }
        }
      ]
    };
  }

  if (
    input.after.status === "failed" ||
    input.after.status === "rejected" ||
    input.after.status === "cancelled"
  ) {
    return {
      operationType: "payout_failed",
      orderId: null,
      payoutRequestId: input.after.id,
      occurredAt: input.now,
      postedAt: input.now,
      metadata: {
        adminUserId: input.adminUserId,
        fromStatus: input.before.status,
        toStatus: input.after.status,
        failureReason: input.after.failureReason
      },
      entries: [
        {
          account: {
            accountType: "astrologer_payout_pending",
            astrologerUserId: input.after.astrologerUserId,
            currency: input.after.amount.currency
          },
          side: "debit",
          amount: input.after.amount,
          metadata: { payoutRequestId: input.after.id }
        },
        {
          account: {
            accountType: "astrologer_available",
            astrologerUserId: input.after.astrologerUserId,
            currency: input.after.amount.currency
          },
          side: "credit",
          amount: input.after.amount,
          metadata: { payoutRequestId: input.after.id }
        }
      ]
    };
  }

  return null;
}

function assertPayoutTransition(from: PayoutRequestStatus, to: PayoutRequestStatus): void {
  if (isTerminalPayoutStatus(from)) throw new PayoutStatusTransitionError(from, to);
  const allowed = allowedPayoutTransitions[from] ?? [];
  if (!allowed.includes(to)) throw new PayoutStatusTransitionError(from, to);
}

function isTerminalPayoutStatus(status: PayoutRequestStatus): boolean {
  return status === "paid" || status === "failed" || status === "rejected" || status === "cancelled";
}

const allowedPayoutTransitions: Record<PayoutRequestStatus, readonly PayoutRequestStatus[]> = {
  requested: ["under_review", "approved", "processing_manual", "processing_provider", "rejected", "cancelled"],
  under_review: ["approved", "processing_manual", "processing_provider", "rejected", "cancelled"],
  approved: ["processing_manual", "processing_provider", "rejected", "cancelled"],
  processing_manual: ["paid", "failed"],
  processing_provider: ["paid", "failed"],
  paid: [],
  failed: [],
  rejected: [],
  cancelled: []
};

function assertPositiveRubMoney(amount: Money): void {
  if (amount.currency !== "RUB" || amount.amountMinor <= 0) {
    throw new Error("Payout money must be a positive RUB amount");
  }
}
