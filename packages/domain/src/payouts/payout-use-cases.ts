import type { Money } from "../money";
import type { SealedPayoutDestinationSnapshot } from "../finance-core/finance-payout-destination-vault";
import { hasAsciiControlCharacter } from "../finance-core/finance-string-validation";
import type {
  CreateLedgerTransactionInput,
  FinancePeriodSummary,
  LedgerStore,
  LedgerTransactionRecord,
  WalletBalance
} from "../wallet";
import type {
  CreatePayoutMethodInput,
  PayoutMethodRecord,
  PayoutPaidProofArtifact,
  PayoutRequestRecord,
  PayoutRequestStatus,
  PayoutStore
} from "./payout-store";
import { PayoutStatusEvidenceError } from "./payout-store";

export type { PayoutMethodRecord, PayoutRequestRecord } from "./payout-store";

export type PayoutCommandStore = Pick<
  PayoutStore,
  "createRequest" | "findDefaultMethod" | "findRequestById" | "updateRequestStatus"
> &
  Pick<LedgerStore, "createTransaction" | "findWalletBalance">;

export type AstrologerPayoutReadStore = Pick<PayoutStore, "findDefaultMethod" | "listRequests"> &
  Pick<LedgerStore, "findWalletBalance" | "summarizePeriod">;

export type PayoutMethodCommandStore = Pick<PayoutStore, "createMethod" | "findDefaultMethod">;

export type PayoutStatusCommandStore = Pick<
  PayoutStore,
  "findRequestById" | "updateRequestStatus"
> &
  Pick<LedgerStore, "createTransaction" | "findWalletBalance">;

export type AstrologerFinanceOverview = {
  readonly balance: WalletBalance;
  readonly defaultPayoutMethod: PayoutMethodRecord | null;
  readonly recentPayoutRequests: readonly PayoutRequestRecord[];
  readonly periodSummary: FinancePeriodSummary;
  readonly canRequestPayout: boolean;
  readonly minimumPayoutAmount: Money;
  readonly payoutRequestUnavailableReason:
    | "payout_method_required"
    | "insufficient_available_balance"
    | null;
};

export type GetAstrologerFinanceOverviewInput = {
  readonly store: AstrologerPayoutReadStore;
  readonly astrologerUserId: string;
  readonly minimumPayoutAmount: Money;
  readonly now: string;
};

export type CreateManualPayoutMethodInput = {
  readonly store: PayoutMethodCommandStore;
  /** Stable id lets KMS sealing and database idempotency converge on one immutable method. */
  readonly payoutMethodId: string;
  readonly astrologerUserId: string;
  readonly displayName: string;
  readonly destination: SealedPayoutDestinationSnapshot;
  readonly now: string;
};

export type RequestAstrologerPayoutInput = {
  readonly store: PayoutCommandStore;
  readonly astrologerUserId: string;
  readonly amount: Money;
  readonly minimumPayoutAmount: Money;
  readonly method: PayoutMethodRecord["method"];
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
  readonly expectedVersion: number;
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
      readonly status: "paid";
      readonly externalReference: string;
      readonly transferredAt: string;
      readonly proofArtifact: PayoutPaidProofArtifact;
      readonly adminNote?: string | null;
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

export class PayoutMinimumAmountError extends Error {
  readonly code = "payout_amount_below_minimum";

  constructor() {
    super("Payout request amount is below the configured minimum");
    this.name = "PayoutMinimumAmountError";
  }
}

export class PayoutMethodMismatchError extends Error {
  readonly code = "payout_method_mismatch";

  constructor() {
    super("Payout request method must match the configured default payout method");
    this.name = "PayoutMethodMismatchError";
  }
}

export class PayoutMethodAlreadyConfiguredError extends Error {
  readonly code = "payout_method_already_configured";

  constructor() {
    super("Default payout method is already configured");
    this.name = "PayoutMethodAlreadyConfiguredError";
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

  constructor(
    readonly from: PayoutRequestStatus,
    readonly to: PayoutRequestStatus
  ) {
    super(`Invalid payout status transition: ${from} -> ${to}`);
    this.name = "PayoutStatusTransitionError";
  }
}

export class PayoutVersionConflictError extends Error {
  readonly code = "payout_version_conflict";

  constructor() {
    super("Payout request changed before this transition could be applied");
  }
}

export async function getAstrologerFinanceOverview(
  input: GetAstrologerFinanceOverviewInput
): Promise<AstrologerFinanceOverview> {
  assertPositiveRubMoney(input.minimumPayoutAmount);

  const period = resolveCurrentUtcMonth(input.now);
  const [balance, defaultPayoutMethod, recentPayoutRequests, periodSummary] = await Promise.all([
    input.store.findWalletBalance(input.astrologerUserId),
    input.store.findDefaultMethod(input.astrologerUserId),
    input.store.listRequests({ astrologerUserId: input.astrologerUserId, limit: 10 }),
    input.store.summarizePeriod({
      astrologerUserId: input.astrologerUserId,
      periodStart: period.periodStart,
      periodEndExclusive: period.periodEndExclusive
    })
  ]);
  const resolvedBalance = balance ?? emptyWalletBalance(input.astrologerUserId, input.now);
  const payoutRequestUnavailableReason = resolvePayoutUnavailableReason({
    balance: resolvedBalance,
    defaultPayoutMethod,
    minimumPayoutAmount: input.minimumPayoutAmount
  });

  return {
    balance: resolvedBalance,
    defaultPayoutMethod,
    recentPayoutRequests,
    periodSummary,
    canRequestPayout: payoutRequestUnavailableReason === null,
    minimumPayoutAmount: input.minimumPayoutAmount,
    payoutRequestUnavailableReason
  };
}

function resolveCurrentUtcMonth(now: string): {
  readonly periodStart: string;
  readonly periodEndExclusive: string;
} {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid finance overview timestamp");
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEndExclusive = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    periodStart: periodStart.toISOString(),
    periodEndExclusive: periodEndExclusive.toISOString()
  };
}

export async function createManualPayoutMethod(
  input: CreateManualPayoutMethodInput
): Promise<PayoutMethodRecord> {
  const existing = await input.store.findDefaultMethod(input.astrologerUserId);
  if (existing) throw new PayoutMethodAlreadyConfiguredError();

  return input.store.createMethod(toCreateManualPayoutMethodInput(input));
}

export async function requestAstrologerPayout(
  input: RequestAstrologerPayoutInput
): Promise<PayoutRequestRecord> {
  assertPositiveRubMoney(input.amount);
  assertPositiveRubMoney(input.minimumPayoutAmount);

  const [method, balance] = await Promise.all([
    input.store.findDefaultMethod(input.astrologerUserId),
    input.store.findWalletBalance(input.astrologerUserId)
  ]);
  if (!method) throw new PayoutMethodMissingError();
  if (method.method !== input.method) throw new PayoutMethodMismatchError();
  if (input.amount.amountMinor < input.minimumPayoutAmount.amountMinor) {
    throw new PayoutMinimumAmountError();
  }
  if ((balance?.available.amountMinor ?? 0) < input.amount.amountMinor) {
    throw new PayoutInsufficientAvailableBalanceError();
  }

  const request = await input.store.createRequest({
    astrologerUserId: input.astrologerUserId,
    payoutMethodId: method.id,
    payoutMethodVersion: method.destination.payoutMethodVersion,
    destination: method.destination,
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

function toCreateManualPayoutMethodInput(
  input: CreateManualPayoutMethodInput
): CreatePayoutMethodInput {
  return {
    id: input.payoutMethodId,
    astrologerUserId: input.astrologerUserId,
    method: "manual_bank_transfer",
    currency: "RUB",
    displayName: input.displayName,
    destination: input.destination,
    isDefault: true,
    now: input.now
  };
}

function resolvePayoutUnavailableReason(input: {
  readonly balance: WalletBalance;
  readonly defaultPayoutMethod: PayoutMethodRecord | null;
  readonly minimumPayoutAmount: Money;
}): AstrologerFinanceOverview["payoutRequestUnavailableReason"] {
  if (!input.defaultPayoutMethod) return "payout_method_required";
  if (input.balance.available.amountMinor < input.minimumPayoutAmount.amountMinor) {
    return "insufficient_available_balance";
  }
  return null;
}

function emptyWalletBalance(astrologerUserId: string, now: string): WalletBalance {
  const zero = { amountMinor: 0, currency: "RUB" as const };
  return {
    astrologerUserId,
    pending: zero,
    available: zero,
    reserved: zero,
    payoutPending: zero,
    negativeBalance: zero,
    updatedAt: now
  };
}

export async function approvePayoutStatusUpdate(
  input: ApprovePayoutStatusUpdateInput
): Promise<PayoutRequestRecord> {
  const before = await input.store.findRequestById(input.payoutRequestId);
  if (!before) throw new PayoutRequestNotFoundError();
  if (before.version !== input.expectedVersion) throw new PayoutVersionConflictError();
  if (before.status === input.update.status) return before;
  assertPayoutTransition(before.status, input.update.status);
  if (input.update.status === "paid") assertPaidProofArtifact(input.update.proofArtifact);

  const updated = await input.store.updateRequestStatus({
    payoutRequestId: input.payoutRequestId,
    expectedVersion: input.expectedVersion,
    status: input.update.status,
    adminUserId: input.adminUserId,
    adminNote: "adminNote" in input.update ? (input.update.adminNote ?? null) : null,
    failureReason: "failureReason" in input.update ? input.update.failureReason : undefined,
    externalReference:
      "externalReference" in input.update ? input.update.externalReference : undefined,
    transferredAt: "transferredAt" in input.update ? input.update.transferredAt : undefined,
    proofArtifact: "proofArtifact" in input.update ? input.update.proofArtifact : undefined,
    now: input.now
  });
  // The request was observed immediately above; a null conditional write means a concurrent
  // transition won the optimistic lock, never that the request silently disappeared.
  if (!updated) throw new PayoutVersionConflictError();

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
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
}

const allowedPayoutTransitions: Record<PayoutRequestStatus, readonly PayoutRequestStatus[]> = {
  requested: [
    "under_review",
    "approved",
    "processing_manual",
    "rejected",
    "cancelled"
  ],
  under_review: ["approved", "processing_manual", "rejected", "cancelled"],
  approved: ["processing_manual", "rejected", "cancelled"],
  processing_manual: ["paid", "failed"],
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

function assertPaidProofArtifact(value: PayoutPaidProofArtifact): void {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.artifactId !== "string" ||
    value.artifactId.length < 1 ||
    value.artifactId.length > 160 ||
    value.artifactId.trim() !== value.artifactId ||
    hasAsciiControlCharacter(value.artifactId) ||
    typeof value.sha256Digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.sha256Digest) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength <= 0
  ) {
    throw new PayoutStatusEvidenceError(
      "Paid payout requests require an immutable bank transfer proof artifact"
    );
  }
}
