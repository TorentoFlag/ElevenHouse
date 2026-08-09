import { eq, sql, type SQL } from "drizzle-orm";
import type {
  AdminPaymentReversalCaseRecord,
  AdminPaymentReversalCaseStore,
  AdminPaymentReversalCaseReviewResolution,
  AdminPaymentReversalCaseType,
  FinancePaymentProvider,
  PaymentAttemptStatus
} from "@elevenhouse/domain";
import type { Money, WalletBalance } from "@elevenhouse/domain";
import {
  ledgerTransactions,
  orders,
  paymentAttempts,
  paymentProviderEvents,
  paymentReversalCaseReviews,
  refunds,
  walletBalanceReadModels
} from "../../schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

type ReversalCaseRow = {
  readonly id: string;
  readonly type: "refund" | "chargeback";
  readonly severity: "info" | "attention" | "critical";
  readonly provider: string;
  readonly provider_webhook_id: string;
  readonly provider_payment_id: string | null;
  readonly provider_refund_id: string | null;
  readonly payment_attempt_id: string;
  readonly order_id: string;
  readonly client_user_id: string;
  readonly astrologer_user_id: string;
  readonly order_status: string;
  readonly payment_attempt_status: string;
  readonly amount_minor: string | number;
  readonly currency: string;
  readonly refund_status: string | null;
  readonly ledger_operation_type: string | null;
  readonly ledger_transaction_id: string | null;
  readonly review_resolution: string | null;
  readonly review_admin_note: string | null;
  readonly reviewed_by_user_id: string | null;
  readonly reviewed_at: Date | string | null;
  readonly wallet_pending_amount_minor: string | number | null;
  readonly wallet_available_amount_minor: string | number | null;
  readonly wallet_reserved_amount_minor: string | number | null;
  readonly wallet_payout_pending_amount_minor: string | number | null;
  readonly wallet_negative_balance_amount_minor: string | number | null;
  readonly wallet_updated_at: Date | string | null;
  readonly occurred_at: Date | string;
  readonly received_at: Date | string;
};

export function createDrizzlePaymentReversalCaseStore(
  database: FinanceDatabase
): AdminPaymentReversalCaseStore {
  return {
    findCaseById: async (caseId) => {
      const [paymentReversalCase] = await readCases(database, {
        caseId,
        reviewStatus: "all",
        limit: 1
      });
      return paymentReversalCase ?? null;
    },
    listCases: async (input) => {
      return readCases(database, input);
    },
    recordReview: async (input) => {
      const existing = await readCases(database, {
        caseId: input.caseId,
        reviewStatus: "all",
        limit: 1
      });
      if (!existing[0]) return null;
      if (existing[0].review) return existing[0];

      await database
        .insert(paymentReversalCaseReviews)
        .values({
          providerEventId: input.caseId,
          resolution: input.resolution,
          adminUserId: input.adminUserId,
          adminNote: input.adminNote,
          reviewedAt: new Date(input.reviewedAt)
        })
        .onConflictDoNothing({
          target: paymentReversalCaseReviews.providerEventId
        });

      const [reviewed] = await readCases(database, {
        caseId: input.caseId,
        reviewStatus: "all",
        limit: 1
      });
      return reviewed ?? null;
    }
  };
}

async function readCases(
  database: FinanceDatabase,
  input: {
    readonly caseId?: string;
    readonly types?: readonly AdminPaymentReversalCaseType[];
    readonly reviewStatus?: "open" | "reviewed" | "all";
    readonly limit: number;
  }
): Promise<readonly AdminPaymentReversalCaseRecord[]> {
  assertLimit(input.limit);
  const eventTypes = toProviderEventTypes(input.types);
  const reviewStatus = input.reviewStatus ?? "open";
  const predicates = [
    sql`${paymentProviderEvents.type} in (${sql.join(eventTypes, sql`, `)})`,
    input.caseId ? eq(paymentProviderEvents.id, input.caseId) : undefined,
    reviewStatus === "open" ? sql`${paymentReversalCaseReviews.id} is null` : undefined,
    reviewStatus === "reviewed" ? sql`${paymentReversalCaseReviews.id} is not null` : undefined
  ].filter((predicate): predicate is SQL => Boolean(predicate));
  const result = await database.execute(sql<ReversalCaseRow>`
        select
          ${paymentProviderEvents.id} as id,
          case
            when ${paymentProviderEvents.type} = 'payment.chargeback' then 'chargeback'
            else 'refund'
          end as type,
          case
            when ${walletBalanceReadModels.negativeBalanceAmountMinor} > 0 then 'critical'
            when ${paymentProviderEvents.type} = 'payment.chargeback' then 'critical'
            when reversal_ledger.id is null then 'critical'
            else 'attention'
          end as severity,
          ${paymentProviderEvents.provider} as provider,
          ${paymentProviderEvents.providerWebhookId} as provider_webhook_id,
          ${paymentProviderEvents.providerPaymentId} as provider_payment_id,
          ${refunds.providerRefundId} as provider_refund_id,
          ${paymentAttempts.id} as payment_attempt_id,
          ${orders.id} as order_id,
          ${orders.clientUserId} as client_user_id,
          ${orders.astrologerUserId} as astrologer_user_id,
          ${orders.status} as order_status,
          ${paymentAttempts.status} as payment_attempt_status,
          coalesce(
            ${refunds.amountMinor},
            nullif(reversal_ledger.metadata->>'reversalGrossAmountMinor', '')::bigint
          ) as amount_minor,
          coalesce(${refunds.currency}, ${paymentAttempts.currency}) as currency,
          ${refunds.status} as refund_status,
          reversal_ledger.operation_type as ledger_operation_type,
          reversal_ledger.id as ledger_transaction_id,
          ${paymentReversalCaseReviews.resolution} as review_resolution,
          ${paymentReversalCaseReviews.adminNote} as review_admin_note,
          ${paymentReversalCaseReviews.adminUserId} as reviewed_by_user_id,
          ${paymentReversalCaseReviews.reviewedAt} as reviewed_at,
          ${walletBalanceReadModels.pendingAmountMinor} as wallet_pending_amount_minor,
          ${walletBalanceReadModels.availableAmountMinor} as wallet_available_amount_minor,
          ${walletBalanceReadModels.reservedAmountMinor} as wallet_reserved_amount_minor,
          ${walletBalanceReadModels.payoutPendingAmountMinor} as wallet_payout_pending_amount_minor,
          ${walletBalanceReadModels.negativeBalanceAmountMinor} as wallet_negative_balance_amount_minor,
          ${walletBalanceReadModels.updatedAt} as wallet_updated_at,
          ${paymentProviderEvents.occurredAt} as occurred_at,
          ${paymentProviderEvents.receivedAt} as received_at
        from ${paymentProviderEvents}
        inner join ${paymentAttempts}
          on ${paymentAttempts.id} = ${paymentProviderEvents.paymentAttemptId}
        inner join ${orders}
          on ${orders.id} = ${paymentAttempts.orderId}
        left join ${refunds}
          on ${refunds.providerEventId} = ${paymentProviderEvents.id}
        left join ${paymentReversalCaseReviews}
          on ${paymentReversalCaseReviews.providerEventId} = ${paymentProviderEvents.id}
        left join lateral (
          select ${ledgerTransactions.id}, ${ledgerTransactions.operationType}, ${ledgerTransactions.metadata}
          from ${ledgerTransactions}
          where ${ledgerTransactions.orderId} = ${orders.id}
            and ${ledgerTransactions.operationType} in ('refund_recorded', 'chargeback_recorded')
            and ${ledgerTransactions.metadata}->>'providerEventId' = ${paymentProviderEvents.id}::text
          order by ${ledgerTransactions.postedAt} desc, ${ledgerTransactions.id} desc
          limit 1
        ) as reversal_ledger on true
        left join ${walletBalanceReadModels}
          on ${walletBalanceReadModels.astrologerUserId} = ${orders.astrologerUserId}
        where ${sql.join(predicates, sql` and `)}
        order by ${paymentProviderEvents.receivedAt} desc, ${paymentProviderEvents.id} desc
        limit ${input.limit}
      `);
  return (result.rows as ReversalCaseRow[]).map(toReversalCase);
}

function toProviderEventTypes(types: readonly AdminPaymentReversalCaseType[] | undefined): SQL[] {
  const requested = types && types.length > 0 ? types : ["refund", "chargeback"];
  const values = new Set(requested);
  return [
    ...(values.has("refund") ? ["payment.refunded", "payment.partially_refunded"] : []),
    ...(values.has("chargeback") ? ["payment.chargeback"] : [])
  ].map((eventType) => sql`${eventType}`);
}

function toReversalCase(row: ReversalCaseRow): AdminPaymentReversalCaseRecord {
  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Payment reversal case is missing a positive reversal amount");
  }
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    provider: row.provider as FinancePaymentProvider,
    providerWebhookId: row.provider_webhook_id,
    providerPaymentId: row.provider_payment_id,
    providerRefundId: row.provider_refund_id,
    paymentAttemptId: row.payment_attempt_id,
    orderId: row.order_id,
    clientUserId: row.client_user_id,
    astrologerUserId: row.astrologer_user_id,
    orderStatus: row.order_status as AdminPaymentReversalCaseRecord["orderStatus"],
    paymentAttemptStatus: row.payment_attempt_status as PaymentAttemptStatus,
    amount: money(amountMinor, row.currency),
    refundStatus: row.refund_status as AdminPaymentReversalCaseRecord["refundStatus"],
    ledgerOperationType:
      row.ledger_operation_type as AdminPaymentReversalCaseRecord["ledgerOperationType"],
    ledgerTransactionId: row.ledger_transaction_id,
    review: toReview(row),
    walletBalance: toWalletBalance(row),
    occurredAt: toIso(row.occurred_at),
    receivedAt: toIso(row.received_at)
  };
}

function toReview(row: ReversalCaseRow): AdminPaymentReversalCaseRecord["review"] {
  if (!row.review_resolution || !row.review_admin_note || !row.reviewed_at) return null;
  return {
    resolution: row.review_resolution as AdminPaymentReversalCaseReviewResolution,
    adminNote: row.review_admin_note,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: toIso(row.reviewed_at)
  };
}

function toWalletBalance(row: ReversalCaseRow): WalletBalance | null {
  if (row.wallet_updated_at === null) return null;
  return {
    astrologerUserId: row.astrologer_user_id,
    pending: money(Number(row.wallet_pending_amount_minor ?? 0), "RUB"),
    available: money(Number(row.wallet_available_amount_minor ?? 0), "RUB"),
    reserved: money(Number(row.wallet_reserved_amount_minor ?? 0), "RUB"),
    payoutPending: money(Number(row.wallet_payout_pending_amount_minor ?? 0), "RUB"),
    negativeBalance: money(Number(row.wallet_negative_balance_amount_minor ?? 0), "RUB"),
    updatedAt: toIso(row.wallet_updated_at)
  };
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Admin payment reversal case limit must be between 1 and 100");
  }
}
