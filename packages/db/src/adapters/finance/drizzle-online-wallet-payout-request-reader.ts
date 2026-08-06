import type {
  ListAstrologerOnlineWalletPayoutRequestsInput,
  ListOnlineWalletPayoutRequestsInput,
  OnlineWalletPayoutRequestProjection,
  OnlineWalletPayoutRequestReader
} from "@elevenhouse/domain/finance-core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  financeOnlinePayoutPaidReceipts,
  financeOnlinePayoutRequests,
  financeOnlinePayoutStateTransitions
} from "../../schema/finance/online-payouts.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

/**
 * Read-only resolver for the v2 payout request command. The writer still locks and rechecks the
 * wallet/method itself, so this reader cannot turn a stale read into an authorization.
 */
export function createDrizzleOnlineWalletPayoutRequestReader(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutRequestReader {
  return Object.freeze({
    async findWalletId({ astrologerUserId, currency }) {
      const rows = await input.database
        .select({ id: financeOnlineWalletHeads.id })
        .from(financeOnlineWalletHeads)
        .where(
          and(
            eq(financeOnlineWalletHeads.astrologerUserId, astrologerUserId),
            eq(financeOnlineWalletHeads.currency, currency)
          )
        )
        .limit(2);
      if (rows.length > 1) {
        throw new OnlineWalletPayoutRequestReadError("wallet_identity_conflict");
      }
      return rows[0]?.id ?? null;
    },
    async findPayoutRequest({ payoutRequestId, astrologerUserId }) {
      const rows = await input.database
        .select(projectionFields)
        .from(financeOnlinePayoutRequests)
        .innerJoin(
          financeOnlinePayoutStateTransitions,
          and(
            eq(
              financeOnlinePayoutStateTransitions.payoutRequestId,
              financeOnlinePayoutRequests.id
            ),
            eq(
              financeOnlinePayoutStateTransitions.payoutVersion,
              financeOnlinePayoutRequests.version
            )
          )
        )
        .leftJoin(
          financeOnlinePayoutPaidReceipts,
          eq(financeOnlinePayoutPaidReceipts.payoutRequestId, financeOnlinePayoutRequests.id)
        )
        .where(
          and(
            eq(financeOnlinePayoutRequests.id, payoutRequestId),
            eq(financeOnlinePayoutRequests.astrologerUserId, astrologerUserId)
          )
        )
        .limit(2);
      if (rows.length > 1) throw new OnlineWalletPayoutRequestReadError("projection_conflict");
      return rows[0] ? toProjection(rows[0]) : null;
    },
    async findPayoutRequestById(payoutRequestId) {
      const rows = await input.database
        .select(projectionFields)
        .from(financeOnlinePayoutRequests)
        .innerJoin(
          financeOnlinePayoutStateTransitions,
          and(
            eq(
              financeOnlinePayoutStateTransitions.payoutRequestId,
              financeOnlinePayoutRequests.id
            ),
            eq(
              financeOnlinePayoutStateTransitions.payoutVersion,
              financeOnlinePayoutRequests.version
            )
          )
        )
        .leftJoin(
          financeOnlinePayoutPaidReceipts,
          eq(financeOnlinePayoutPaidReceipts.payoutRequestId, financeOnlinePayoutRequests.id)
        )
        .where(eq(financeOnlinePayoutRequests.id, payoutRequestId))
        .limit(2);
      if (rows.length > 1) throw new OnlineWalletPayoutRequestReadError("projection_conflict");
      return rows[0] ? toProjection(rows[0]) : null;
    },
    async listPayoutRequests(command) {
      const normalized = normalizeList(command);
      const rows = await input.database
        .select(projectionFields)
        .from(financeOnlinePayoutRequests)
        .innerJoin(
          financeOnlinePayoutStateTransitions,
          and(
            eq(
              financeOnlinePayoutStateTransitions.payoutRequestId,
              financeOnlinePayoutRequests.id
            ),
            eq(
              financeOnlinePayoutStateTransitions.payoutVersion,
              financeOnlinePayoutRequests.version
            )
          )
        )
        .leftJoin(
          financeOnlinePayoutPaidReceipts,
          eq(financeOnlinePayoutPaidReceipts.payoutRequestId, financeOnlinePayoutRequests.id)
        )
        .where(
          normalized.statuses
            ? inArray(financeOnlinePayoutRequests.status, normalized.statuses)
            : undefined
        )
        .orderBy(asc(financeOnlinePayoutRequests.requestedAt), asc(financeOnlinePayoutRequests.id))
        .limit(normalized.limit);
      return Object.freeze(rows.map(toProjection));
    },
    async listPayoutRequestsForAstrologer(command) {
      const normalized = normalizeAstrologerList(command);
      const rows = await input.database
        .select(projectionFields)
        .from(financeOnlinePayoutRequests)
        .innerJoin(
          financeOnlinePayoutStateTransitions,
          and(
            eq(
              financeOnlinePayoutStateTransitions.payoutRequestId,
              financeOnlinePayoutRequests.id
            ),
            eq(
              financeOnlinePayoutStateTransitions.payoutVersion,
              financeOnlinePayoutRequests.version
            )
          )
        )
        .leftJoin(
          financeOnlinePayoutPaidReceipts,
          eq(financeOnlinePayoutPaidReceipts.payoutRequestId, financeOnlinePayoutRequests.id)
        )
        .where(eq(financeOnlinePayoutRequests.astrologerUserId, normalized.astrologerUserId))
        .orderBy(desc(financeOnlinePayoutRequests.requestedAt), desc(financeOnlinePayoutRequests.id))
        .limit(normalized.limit);
      return Object.freeze(rows.map(toProjection));
    }
  } satisfies OnlineWalletPayoutRequestReader);
}

const projectionFields = {
  payoutRequestId: financeOnlinePayoutRequests.id,
  walletId: financeOnlinePayoutRequests.walletId,
  astrologerUserId: financeOnlinePayoutRequests.astrologerUserId,
  amountMinor: financeOnlinePayoutRequests.immutableAmountMinor,
  currency: financeOnlinePayoutRequests.currency,
  status: financeOnlinePayoutRequests.status,
  version: financeOnlinePayoutRequests.version,
  requestedAt: financeOnlinePayoutRequests.requestedAt,
  latestTransitionActorUserId: financeOnlinePayoutStateTransitions.actorUserId,
  latestTransitionOccurredAt: financeOnlinePayoutStateTransitions.occurredAt,
  latestTransitionFailureReason: financeOnlinePayoutStateTransitions.failureReason,
  latestTransitionAdminNote: financeOnlinePayoutStateTransitions.adminNote,
  paidBankReference: financeOnlinePayoutPaidReceipts.bankReference,
  paidTransferredAt: financeOnlinePayoutPaidReceipts.transferredAt
};

type DatabasePayoutProjection = Readonly<{
  payoutRequestId: string;
  walletId: string;
  astrologerUserId: string;
  amountMinor: string;
  currency: string;
  status: string;
  version: string;
  requestedAt: Date;
  latestTransitionActorUserId: string | null;
  latestTransitionOccurredAt: Date;
  latestTransitionFailureReason: string | null;
  latestTransitionAdminNote: string | null;
  paidBankReference: string | null;
  paidTransferredAt: Date | null;
}>;

function toProjection(row: DatabasePayoutProjection): OnlineWalletPayoutRequestProjection {
  if (row.currency !== "RUB") throw new OnlineWalletPayoutRequestReadError("currency_mismatch");
  return Object.freeze({
    payoutRequestId: row.payoutRequestId,
    walletId: row.walletId,
    astrologerUserId: row.astrologerUserId,
    amountMinor: row.amountMinor,
    currency: "RUB" as const,
    status: row.status as OnlineWalletPayoutRequestProjection["status"],
    version: row.version,
    requestedAt: row.requestedAt.toISOString(),
    latestTransitionActorUserId: row.latestTransitionActorUserId,
    latestTransitionOccurredAt: row.latestTransitionOccurredAt.toISOString(),
    latestTransitionFailureReason: row.latestTransitionFailureReason,
    latestTransitionAdminNote: row.latestTransitionAdminNote,
    paidBankReference: row.paidBankReference,
    paidTransferredAt: row.paidTransferredAt?.toISOString() ?? null
  });
}

function normalizeList(input: ListOnlineWalletPayoutRequestsInput): ListOnlineWalletPayoutRequestsInput {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200) {
    throw new OnlineWalletPayoutRequestReadError("invalid_list_request");
  }
  if (input.statuses && input.statuses.length === 0) {
    throw new OnlineWalletPayoutRequestReadError("invalid_list_request");
  }
  return input;
}

function normalizeAstrologerList(
  input: ListAstrologerOnlineWalletPayoutRequestsInput
): ListAstrologerOnlineWalletPayoutRequestsInput {
  if (
    typeof input.astrologerUserId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.astrologerUserId
    ) ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  ) {
    throw new OnlineWalletPayoutRequestReadError("invalid_list_request");
  }
  return input;
}

export class OnlineWalletPayoutRequestReadError extends Error {
  readonly code = "online_wallet_payout_request_read_error";

  constructor(
    readonly reason:
      | "wallet_identity_conflict"
      | "currency_mismatch"
      | "projection_conflict"
      | "invalid_list_request"
  ) {
    super("Online wallet payout request projection is inconsistent");
    this.name = "OnlineWalletPayoutRequestReadError";
  }
}
