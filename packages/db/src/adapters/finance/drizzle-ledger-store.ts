import { createHash } from "node:crypto";
import { and, eq, sql, type SQL } from "drizzle-orm";
import {
  createCapturedSaleHoldReleaseLedgerTransaction,
  LedgerAccountShapeError,
  LedgerUnbalancedTransactionError,
  type CreateLedgerEntryInput,
  type CreateLedgerTransactionInput,
  type FinanceIdempotentCommand,
  type FinancePeriodSummary,
  type FinanceOperationDirection,
  type FinanceLedgerOperationKind,
  type HoldReleaseStore,
  type LedgerAccountRef,
  type LedgerAccountType,
  type LedgerEntryRecord,
  type LedgerOperation,
  type LedgerStore,
  type LedgerTransactionRecord,
  type ListLedgerOperationsInput,
  type Money,
  type ReleasableCapturedSaleHold,
  type SummarizeLedgerPeriodInput,
  type WalletBalance,
  type WalletBalanceBucket
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  orders,
  reconciliationRecords,
  walletBalanceReadModels
} from "../../schema";
import {
  executeIdempotentFinanceCommand,
  type FinanceDatabase,
  type FinanceIdempotencyResult,
  type FinanceTransaction
} from "./drizzle-finance-command-store";

type LedgerAccountRow = typeof ledgerAccounts.$inferSelect;
type LedgerTransactionRow = typeof ledgerTransactions.$inferSelect;
type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
type WalletBalanceRow = typeof walletBalanceReadModels.$inferSelect;

type LedgerOperationListRow = {
  readonly id: string;
  readonly operationType: LedgerOperation["operationType"];
  readonly orderId: string | null;
  readonly payoutRequestId: string | null;
  readonly occurredAt: Date;
  readonly postedAt: Date;
  readonly metadata: Record<string, unknown>;
  readonly amountMinor: number | string;
  readonly signedAmountMinor: number | string;
  readonly grossAmountMinor: number | string | null;
  readonly platformFeeAmountMinor: number | string | null;
  readonly netAmountMinor: number | string;
  readonly balanceBucket: WalletBalanceBucket | null;
};

type FinancePeriodSummaryRow = {
  readonly grossSalesAmountMinor: number | string;
  readonly platformFeeAmountMinor: number | string;
  readonly netSalesAmountMinor: number | string;
  readonly refundsAmountMinor: number | string;
  readonly payoutsAmountMinor: number | string;
  readonly saleCount: number | string;
  readonly refundCount: number | string;
  readonly payoutCount: number | string;
};

type EntryRowWithAccount = {
  readonly entry: LedgerEntryRow;
  readonly account: LedgerAccountRow;
};

export function createDrizzleLedgerStore(database: ElevenHouseDatabase): LedgerStore {
  return {
    createTransaction: (input) =>
      database.transaction((transaction) => createLedgerTransaction(transaction, input)),
    findWalletBalance: (astrologerUserId) => findWalletBalance(database, astrologerUserId),
    summarizePeriod: (input) => summarizeLedgerPeriod(database, input),
    listOperations: (input) => listLedgerOperations(database, input)
  };
}

export function createDrizzleLedgerTransactionStore(
  database: FinanceTransaction
): Pick<
  LedgerStore,
  "createTransaction" | "findWalletBalance" | "summarizePeriod" | "listOperations"
> {
  return {
    createTransaction: (input) => createLedgerTransaction(database, input),
    findWalletBalance: (astrologerUserId) => findWalletBalance(database, astrologerUserId),
    summarizePeriod: (input) => summarizeLedgerPeriod(database, input),
    listOperations: (input) => listLedgerOperations(database, input)
  };
}

export function createDrizzleHoldReleaseStore(database: ElevenHouseDatabase): HoldReleaseStore {
  return {
    listReleasableCapturedSaleHolds: (input) => listReleasableCapturedSaleHolds(database, input),
    releaseCapturedSaleHold: async (input) => {
      const result = await executeIdempotentFinanceCommand({
        database,
        command: createCapturedSaleHoldReleaseCommand(input),
        create: async (transaction) => {
          const ledgerTransaction = await createLedgerTransaction(
            transaction,
            createCapturedSaleHoldReleaseLedgerTransaction(input.hold, input.now)
          );
          return {
            result: { ledgerTransactionId: ledgerTransaction.id },
            value: { transactionId: ledgerTransaction.id }
          };
        },
        replay: async (persistedResult) => replayCapturedSaleHoldReleaseResult(persistedResult)
      });
      return {
        kind: result.kind === "created" ? "released" : "replayed",
        transactionId: result.value.transactionId
      };
    }
  };
}

export async function createLedgerTransaction(
  database: FinanceTransaction,
  input: CreateLedgerTransactionInput
): Promise<LedgerTransactionRecord> {
  assertFinanceLedgerBalanced(input.entries);
  for (const entry of input.entries) assertLedgerAccountShape(entry.account);

  const [transactionRow] = await database
    .insert(ledgerTransactions)
    .values({
      ...(input.id ? { id: input.id } : {}),
      operationType: input.operationType,
      orderId: input.orderId,
      payoutRequestId: input.payoutRequestId,
      occurredAt: new Date(input.occurredAt),
      postedAt: new Date(input.postedAt),
      metadata: input.metadata
    })
    .returning();
  if (!transactionRow) throw new Error("Expected ledger transaction insert to return a row");

  const insertedEntries: EntryRowWithAccount[] = [];
  const affectedAstrologerBuckets = new Map<string, Set<WalletBalanceBucket>>();
  for (const entry of input.entries) {
    const account = await findOrCreateLedgerAccount(database, entry.account, input.postedAt);
    const [entryRow] = await database
      .insert(ledgerEntries)
      .values({
        ledgerTransactionId: transactionRow.id,
        accountId: account.id,
        side: entry.side,
        amountMinor: entry.amount.amountMinor,
        currency: entry.amount.currency,
        metadata: entry.metadata,
        createdAt: new Date(input.postedAt)
      })
      .returning();
    if (!entryRow) throw new Error("Expected ledger entry insert to return a row");
    insertedEntries.push({ entry: entryRow, account });

    if (account.astrologerUserId && account.balanceBucket) {
      const buckets =
        affectedAstrologerBuckets.get(account.astrologerUserId) ?? new Set<WalletBalanceBucket>();
      buckets.add(account.balanceBucket as WalletBalanceBucket);
      affectedAstrologerBuckets.set(account.astrologerUserId, buckets);
    }
  }

  for (const [astrologerUserId, buckets] of affectedAstrologerBuckets) {
    await recomputeWalletBalanceBuckets(database, astrologerUserId, buckets, input.postedAt);
  }

  return toLedgerTransactionRecord(transactionRow, insertedEntries);
}

export async function listReleasableCapturedSaleHolds(
  database: FinanceDatabase,
  input: { readonly now: string; readonly limit: number }
): Promise<readonly ReleasableCapturedSaleHold[]> {
  const rows = await database
    .select({
      orderId: ledgerTransactions.orderId,
      astrologerUserId: ledgerAccounts.astrologerUserId,
      amountMinor: ledgerEntries.amountMinor,
      currency: ledgerEntries.currency,
      capturedAt: ledgerTransactions.occurredAt,
      holdReleaseAt: sql<string>`${ledgerEntries.metadata}->>'holdReleaseAt'`,
      paymentAttemptId: sql<string | null>`${ledgerTransactions.metadata}->>'paymentAttemptId'`,
      providerEventId: sql<string | null>`${ledgerTransactions.metadata}->>'providerEventId'`
    })
    .from(ledgerTransactions)
    .innerJoin(ledgerEntries, eq(ledgerEntries.ledgerTransactionId, ledgerTransactions.id))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .innerJoin(orders, eq(orders.id, ledgerTransactions.orderId))
    .where(
      and(
        eq(ledgerTransactions.operationType, "sale_captured"),
        eq(ledgerAccounts.accountType, "astrologer_pending"),
        eq(ledgerEntries.side, "credit"),
        sql`${ledgerTransactions.orderId} is not null`,
        sql`${ledgerAccounts.astrologerUserId} is not null`,
        sql`${ledgerEntries.metadata}->>'holdReleaseAt' is not null`,
        sql`(${ledgerEntries.metadata}->>'holdReleaseAt')::timestamptz <= ${new Date(input.now)}`,
        sql`not exists (
          select 1
          from ${reconciliationRecords} reconciliation_exception
          where reconciliation_exception.provider = ${ledgerTransactions.metadata}->>'provider'
            and reconciliation_exception.provider_payment_id = ${ledgerTransactions.metadata}->>'providerPaymentId'
            and reconciliation_exception.status = 'exception'
            and reconciliation_exception.resolved_at is null
        )`,
        sql`(
          ${orders.financePolicyProviderSettlementRequired} = false
          or exists (
            select 1
            from ${reconciliationRecords} reconciliation_match
            where reconciliation_match.provider = ${ledgerTransactions.metadata}->>'provider'
              and reconciliation_match.provider_payment_id = ${ledgerTransactions.metadata}->>'providerPaymentId'
              and reconciliation_match.status = 'matched'
          )
        )`,
        sql`not exists (
          select 1
          from ledger_transactions released
          where released.operation_type = 'funds_released'
            and released.order_id = ${ledgerTransactions.orderId}
        )`
      )
    )
    .orderBy(sql`(${ledgerEntries.metadata}->>'holdReleaseAt')::timestamptz`, ledgerTransactions.id)
    .limit(input.limit);

  return rows.map((row) => {
    if (!row.orderId || !row.astrologerUserId) {
      throw new Error("Due captured sale hold query returned an incomplete owner");
    }
    return {
      orderId: row.orderId,
      astrologerUserId: row.astrologerUserId,
      amount: money(row.amountMinor, row.currency),
      capturedAt: row.capturedAt.toISOString(),
      holdReleaseAt: row.holdReleaseAt,
      paymentAttemptId: row.paymentAttemptId,
      providerEventId: row.providerEventId
    };
  });
}

export function createCapturedSaleHoldReleaseCommand(input: {
  readonly hold: ReleasableCapturedSaleHold;
  readonly now: string;
  readonly commandExpiresAt: string;
}): FinanceIdempotentCommand {
  return {
    scope: "finance.hold-release",
    idempotencyKey: `order:${input.hold.orderId}`,
    actorUserId: null,
    requestHash: hashCapturedSaleHoldRelease(input.hold),
    now: input.now,
    expiresAt: input.commandExpiresAt
  };
}

export function replayCapturedSaleHoldReleaseResult(
  result: FinanceIdempotencyResult
): { readonly transactionId: string } | null {
  const ledgerTransactionId = result.ledgerTransactionId;
  return typeof ledgerTransactionId === "string" ? { transactionId: ledgerTransactionId } : null;
}

function hashCapturedSaleHoldRelease(hold: ReleasableCapturedSaleHold): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        orderId: hold.orderId,
        astrologerUserId: hold.astrologerUserId,
        amount: hold.amount,
        capturedAt: hold.capturedAt,
        holdReleaseAt: hold.holdReleaseAt,
        paymentAttemptId: hold.paymentAttemptId,
        providerEventId: hold.providerEventId
      }),
      "utf8"
    )
    .digest("hex")}`;
}

export function assertFinanceLedgerBalanced(entries: readonly CreateLedgerEntryInput[]): void {
  if (entries.length < 2) {
    throw new LedgerUnbalancedTransactionError("RUB");
  }
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const entry of entries) {
    const current = totals.get(entry.amount.currency) ?? { debit: 0, credit: 0 };
    current[entry.side] += entry.amount.amountMinor;
    totals.set(entry.amount.currency, current);
  }

  for (const [currency, total] of totals) {
    if (total.debit !== total.credit) {
      if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
      throw new LedgerUnbalancedTransactionError(currency);
    }
  }
}

export function assertLedgerAccountShape(account: LedgerAccountRef): void {
  const expectedBucket = walletBucketForAccountType(account.accountType);
  if (expectedBucket === null) {
    if (account.astrologerUserId !== null) {
      throw new LedgerAccountShapeError("Platform ledger account cannot have astrologerUserId");
    }
    return;
  }
  if (!account.astrologerUserId) {
    throw new LedgerAccountShapeError("Astrologer ledger account requires astrologerUserId");
  }
}

async function findOrCreateLedgerAccount(
  database: FinanceTransaction,
  account: LedgerAccountRef,
  now: string
): Promise<LedgerAccountRow> {
  const balanceBucket = walletBucketForAccountType(account.accountType);
  const timestamp = new Date(now);
  const [inserted] = await database
    .insert(ledgerAccounts)
    .values({
      accountType: account.accountType,
      astrologerUserId: account.astrologerUserId,
      balanceBucket,
      currency: account.currency,
      createdAt: timestamp
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [existing] = await database
    .select()
    .from(ledgerAccounts)
    .where(
      account.astrologerUserId
        ? and(
            eq(ledgerAccounts.astrologerUserId, account.astrologerUserId),
            eq(ledgerAccounts.accountType, account.accountType),
            eq(ledgerAccounts.currency, account.currency)
          )
        : and(
            eq(ledgerAccounts.accountType, account.accountType),
            eq(ledgerAccounts.currency, account.currency)
          )
    )
    .limit(1);
  if (!existing) throw new Error("Expected ledger account after insert or lookup");
  return existing;
}

async function recomputeWalletBalanceBuckets(
  database: FinanceTransaction,
  astrologerUserId: string,
  buckets: ReadonlySet<WalletBalanceBucket>,
  now: string
): Promise<void> {
  await database
    .insert(walletBalanceReadModels)
    .values({
      astrologerUserId,
      updatedAt: new Date(now)
    })
    .onConflictDoNothing();

  for (const bucket of buckets) {
    const amountMinor = await computeAstrologerBucketAmount(database, astrologerUserId, bucket);
    await updateWalletBalanceBucket(database, astrologerUserId, bucket, amountMinor, now);
  }
}

async function computeAstrologerBucketAmount(
  database: FinanceTransaction,
  astrologerUserId: string,
  bucket: WalletBalanceBucket
): Promise<number> {
  const amountExpression =
    bucket === "negative_balance"
      ? sql<number>`coalesce(sum(case when ${ledgerEntries.side} = 'debit' then ${ledgerEntries.amountMinor} when ${ledgerEntries.side} = 'credit' then -${ledgerEntries.amountMinor} else 0 end), 0)`
      : sql<number>`coalesce(sum(case when ${ledgerEntries.side} = 'credit' then ${ledgerEntries.amountMinor} when ${ledgerEntries.side} = 'debit' then -${ledgerEntries.amountMinor} else 0 end), 0)`;
  const [row] = await database
    .select({
      amountMinor: amountExpression
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(
      and(
        eq(ledgerAccounts.astrologerUserId, astrologerUserId),
        eq(ledgerAccounts.balanceBucket, bucket),
        eq(ledgerEntries.currency, "RUB")
      )
    );
  const amountMinor = Number(row?.amountMinor ?? 0);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("Wallet balance recompute produced an invalid amount");
  }
  return amountMinor;
}

async function updateWalletBalanceBucket(
  database: FinanceTransaction,
  astrologerUserId: string,
  bucket: WalletBalanceBucket,
  amountMinor: number,
  now: string
): Promise<void> {
  const timestamp = new Date(now);
  switch (bucket) {
    case "pending":
      await database
        .update(walletBalanceReadModels)
        .set({ pendingAmountMinor: amountMinor, pendingCurrency: "RUB", updatedAt: timestamp })
        .where(eq(walletBalanceReadModels.astrologerUserId, astrologerUserId));
      return;
    case "available":
      await database
        .update(walletBalanceReadModels)
        .set({ availableAmountMinor: amountMinor, availableCurrency: "RUB", updatedAt: timestamp })
        .where(eq(walletBalanceReadModels.astrologerUserId, astrologerUserId));
      return;
    case "reserved":
      await database
        .update(walletBalanceReadModels)
        .set({ reservedAmountMinor: amountMinor, reservedCurrency: "RUB", updatedAt: timestamp })
        .where(eq(walletBalanceReadModels.astrologerUserId, astrologerUserId));
      return;
    case "payout_pending":
      await database
        .update(walletBalanceReadModels)
        .set({
          payoutPendingAmountMinor: amountMinor,
          payoutPendingCurrency: "RUB",
          updatedAt: timestamp
        })
        .where(eq(walletBalanceReadModels.astrologerUserId, astrologerUserId));
      return;
    case "negative_balance":
      await database
        .update(walletBalanceReadModels)
        .set({
          negativeBalanceAmountMinor: amountMinor,
          negativeBalanceCurrency: "RUB",
          updatedAt: timestamp
        })
        .where(eq(walletBalanceReadModels.astrologerUserId, astrologerUserId));
      return;
  }
}

async function findWalletBalance(
  database: FinanceDatabase,
  astrologerUserId: string
): Promise<WalletBalance | null> {
  const [row] = await database
    .select()
    .from(walletBalanceReadModels)
    .where(eq(walletBalanceReadModels.astrologerUserId, astrologerUserId))
    .limit(1);
  return row ? toWalletBalance(row) : null;
}

async function summarizeLedgerPeriod(
  database: FinanceDatabase,
  input: SummarizeLedgerPeriodInput
): Promise<FinancePeriodSummary> {
  const result = await database.execute(sql<FinancePeriodSummaryRow>`
    with owner_transactions as (
      select distinct tx.id, tx.operation_type
      from ledger_transactions tx
      inner join ledger_entries owner_entry on owner_entry.ledger_transaction_id = tx.id
      inner join ledger_accounts owner_account on owner_account.id = owner_entry.account_id
      where owner_account.astrologer_user_id = ${input.astrologerUserId}::uuid
        and owner_entry.currency = 'RUB'
        and tx.posted_at >= ${new Date(input.periodStart)}
        and tx.posted_at < ${new Date(input.periodEndExclusive)}
    ),
    transaction_amounts as (
      select
        owner_transactions.id,
        owner_transactions.operation_type,
        case
          when owner_transactions.operation_type = 'sale_captured' then (
            select coalesce(sum(gross_entry.amount_minor), 0)
            from ledger_entries gross_entry
            inner join ledger_accounts gross_account on gross_account.id = gross_entry.account_id
            where gross_entry.ledger_transaction_id = owner_transactions.id
              and gross_account.account_type = 'platform_clearing'
              and gross_entry.entry_side = 'debit'
              and gross_entry.currency = 'RUB'
          )
          else 0
        end as gross_sales_amount_minor,
        case
          when owner_transactions.operation_type = 'sale_captured' then (
            select coalesce(sum(fee_entry.amount_minor), 0)
            from ledger_entries fee_entry
            inner join ledger_accounts fee_account on fee_account.id = fee_entry.account_id
            where fee_entry.ledger_transaction_id = owner_transactions.id
              and fee_account.account_type = 'platform_revenue'
              and fee_entry.entry_side = 'credit'
              and fee_entry.currency = 'RUB'
          )
          else 0
        end as platform_fee_amount_minor,
        case
          when owner_transactions.operation_type = 'sale_captured' then (
            select coalesce(sum(net_entry.amount_minor), 0)
            from ledger_entries net_entry
            inner join ledger_accounts net_account on net_account.id = net_entry.account_id
            where net_entry.ledger_transaction_id = owner_transactions.id
              and net_account.astrologer_user_id = ${input.astrologerUserId}::uuid
              and net_entry.entry_side = 'credit'
              and net_entry.currency = 'RUB'
          )
          else 0
        end as net_sales_amount_minor,
        case
          when owner_transactions.operation_type in ('refund_recorded', 'chargeback_recorded') then (
            select coalesce(sum(reversal_entry.amount_minor), 0)
            from ledger_entries reversal_entry
            inner join ledger_accounts reversal_account on reversal_account.id = reversal_entry.account_id
            where reversal_entry.ledger_transaction_id = owner_transactions.id
              and reversal_account.astrologer_user_id = ${input.astrologerUserId}::uuid
              and reversal_entry.entry_side = 'debit'
              and reversal_entry.currency = 'RUB'
          )
          else 0
        end as refunds_amount_minor,
        case
          when owner_transactions.operation_type = 'payout_paid' then (
            select coalesce(sum(payout_entry.amount_minor), 0)
            from ledger_entries payout_entry
            inner join ledger_accounts payout_account on payout_account.id = payout_entry.account_id
            where payout_entry.ledger_transaction_id = owner_transactions.id
              and payout_account.astrologer_user_id = ${input.astrologerUserId}::uuid
              and payout_entry.entry_side = 'debit'
              and payout_entry.currency = 'RUB'
          )
          else 0
        end as payouts_amount_minor
      from owner_transactions
    )
    select
      coalesce(sum(gross_sales_amount_minor), 0)::text as "grossSalesAmountMinor",
      coalesce(sum(platform_fee_amount_minor), 0)::text as "platformFeeAmountMinor",
      coalesce(sum(net_sales_amount_minor), 0)::text as "netSalesAmountMinor",
      coalesce(sum(refunds_amount_minor), 0)::text as "refundsAmountMinor",
      coalesce(sum(payouts_amount_minor), 0)::text as "payoutsAmountMinor",
      count(*) filter (where operation_type = 'sale_captured')::text as "saleCount",
      count(*) filter (where operation_type in ('refund_recorded', 'chargeback_recorded'))::text as "refundCount",
      count(*) filter (where operation_type = 'payout_paid')::text as "payoutCount"
    from transaction_amounts
  `);
  const [row] = result.rows as unknown as readonly FinancePeriodSummaryRow[];

  return {
    periodStart: new Date(input.periodStart).toISOString(),
    periodEndExclusive: new Date(input.periodEndExclusive).toISOString(),
    grossSalesAmount: money(toSafeMinorUnit(row?.grossSalesAmountMinor ?? 0), "RUB"),
    platformFeeAmount: money(toSafeMinorUnit(row?.platformFeeAmountMinor ?? 0), "RUB"),
    netSalesAmount: money(toSafeMinorUnit(row?.netSalesAmountMinor ?? 0), "RUB"),
    refundsAmount: money(toSafeMinorUnit(row?.refundsAmountMinor ?? 0), "RUB"),
    payoutsAmount: money(toSafeMinorUnit(row?.payoutsAmountMinor ?? 0), "RUB"),
    saleCount: toSafeCount(row?.saleCount ?? 0),
    refundCount: toSafeCount(row?.refundCount ?? 0),
    payoutCount: toSafeCount(row?.payoutCount ?? 0),
    recurringRevenueAmount: null,
    recurringRevenueUnavailableReason: "client_subscriptions_not_implemented"
  };
}

async function listLedgerOperations(
  database: FinanceDatabase,
  input: ListLedgerOperationsInput
): ReturnType<LedgerStore["listOperations"]> {
  const pageSize = Math.min(Math.max(input.limit, 1), 100);
  const cursor = input.cursor ? parseLedgerOperationsCursor(input.cursor) : null;
  const signedAmountExpression = sql<number>`coalesce(sum(case
    when ${ledgerAccounts.balanceBucket} = 'negative_balance' and ${ledgerEntries.side} = 'debit' then -${ledgerEntries.amountMinor}
    when ${ledgerAccounts.balanceBucket} = 'negative_balance' and ${ledgerEntries.side} = 'credit' then ${ledgerEntries.amountMinor}
    when ${ledgerEntries.side} = 'credit' then ${ledgerEntries.amountMinor}
    when ${ledgerEntries.side} = 'debit' then -${ledgerEntries.amountMinor}
    else 0
  end), 0)`;
  const grossAmountExpression = sql<number | null>`case
    when ${ledgerTransactions.operationType} = 'sale_captured' then (
      select coalesce(sum(gross_entry.amount_minor), 0)
      from ledger_entries gross_entry
      inner join ledger_accounts gross_account on gross_account.id = gross_entry.account_id
      where gross_entry.ledger_transaction_id = ${ledgerTransactions.id}
        and gross_account.account_type = 'platform_clearing'
        and gross_entry.entry_side = 'debit'
    )
    when ${ledgerTransactions.operationType} in ('refund_recorded', 'chargeback_recorded')
      and ${ledgerTransactions.metadata}->>'reversalGrossAmountMinor' is not null
      then -(${ledgerTransactions.metadata}->>'reversalGrossAmountMinor')::bigint
    else null
  end`;
  const platformFeeAmountExpression = sql<number | null>`case
    when ${ledgerTransactions.operationType} = 'sale_captured' then (
      select nullif(coalesce(sum(fee_entry.amount_minor), 0), 0)
      from ledger_entries fee_entry
      inner join ledger_accounts fee_account on fee_account.id = fee_entry.account_id
      where fee_entry.ledger_transaction_id = ${ledgerTransactions.id}
        and fee_account.account_type = 'platform_revenue'
        and fee_entry.entry_side = 'credit'
    )
    else null
  end`;
  const filters: SQL[] = [
    eq(ledgerAccounts.astrologerUserId, input.astrologerUserId),
    eq(ledgerEntries.currency, "RUB")
  ];
  if (input.operationType) filters.push(eq(ledgerTransactions.operationType, input.operationType));
  if (input.balanceBucket) filters.push(eq(ledgerAccounts.balanceBucket, input.balanceBucket));
  if (cursor) {
    filters.push(
      sql`(${ledgerTransactions.postedAt}, ${ledgerTransactions.id}) < (${new Date(
        cursor.postedAt
      )}, ${cursor.id}::uuid)`
    );
  }

  const rows = await database
    .select({
      id: ledgerTransactions.id,
      operationType: ledgerTransactions.operationType,
      orderId: ledgerTransactions.orderId,
      payoutRequestId: ledgerTransactions.payoutRequestId,
      occurredAt: ledgerTransactions.occurredAt,
      postedAt: ledgerTransactions.postedAt,
      metadata: ledgerTransactions.metadata,
      signedAmountMinor: signedAmountExpression,
      amountMinor: sql<number>`greatest(abs(${signedAmountExpression}), coalesce(max(${ledgerEntries.amountMinor}), 0))`,
      grossAmountMinor: grossAmountExpression,
      platformFeeAmountMinor: platformFeeAmountExpression,
      netAmountMinor: signedAmountExpression,
      balanceBucket: sql<WalletBalanceBucket | null>`case when count(distinct ${ledgerAccounts.balanceBucket}) = 1 then min(${ledgerAccounts.balanceBucket}) else null end`
    })
    .from(ledgerTransactions)
    .innerJoin(ledgerEntries, eq(ledgerEntries.ledgerTransactionId, ledgerTransactions.id))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(and(...filters))
    .groupBy(
      ledgerTransactions.id,
      ledgerTransactions.operationType,
      ledgerTransactions.orderId,
      ledgerTransactions.payoutRequestId,
      ledgerTransactions.occurredAt,
      ledgerTransactions.postedAt,
      ledgerTransactions.metadata
    )
    .orderBy(sql`${ledgerTransactions.postedAt} desc`, sql`${ledgerTransactions.id} desc`)
    .limit(pageSize + 1);
  const pageRows = rows.slice(0, pageSize) as readonly LedgerOperationListRow[];
  const lastRow = pageRows.at(-1);

  return {
    operations: pageRows.map(toLedgerOperation),
    nextCursor:
      rows.length > pageSize && lastRow
        ? createLedgerOperationsCursor({ id: lastRow.id, postedAt: lastRow.postedAt.toISOString() })
        : null
  };
}

function toLedgerTransactionRecord(
  row: LedgerTransactionRow,
  entries: readonly EntryRowWithAccount[]
): LedgerTransactionRecord {
  return {
    id: row.id,
    operationType: row.operationType as LedgerTransactionRecord["operationType"],
    orderId: row.orderId,
    payoutRequestId: row.payoutRequestId,
    occurredAt: row.occurredAt.toISOString(),
    postedAt: row.postedAt.toISOString(),
    metadata: row.metadata,
    entries: entries.map(toLedgerEntryRecord)
  };
}

function toLedgerEntryRecord(row: EntryRowWithAccount): LedgerEntryRecord {
  return {
    id: row.entry.id,
    ledgerAccountId: row.account.id,
    account: {
      accountType: row.account.accountType as LedgerAccountType,
      astrologerUserId: row.account.astrologerUserId,
      currency: money(row.entry.amountMinor, row.entry.currency).currency
    },
    side: row.entry.side as LedgerEntryRecord["side"],
    amount: money(row.entry.amountMinor, row.entry.currency),
    metadata: row.entry.metadata
  };
}

function toWalletBalance(row: WalletBalanceRow): WalletBalance {
  return {
    astrologerUserId: row.astrologerUserId,
    pending: money(row.pendingAmountMinor, row.pendingCurrency),
    available: money(row.availableAmountMinor, row.availableCurrency),
    reserved: money(row.reservedAmountMinor, row.reservedCurrency),
    payoutPending: money(row.payoutPendingAmountMinor, row.payoutPendingCurrency),
    negativeBalance: money(row.negativeBalanceAmountMinor, row.negativeBalanceCurrency),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toLedgerOperation(row: LedgerOperationListRow): LedgerOperation {
  const amountMinor = toSafeMinorUnit(row.amountMinor);
  const signedAmountMinor = toSafeSignedMinorUnit(row.signedAmountMinor);
  return {
    id: row.id,
    operationType: row.operationType,
    kind: kindForLedgerOperation(row.operationType),
    direction: directionForSignedAmount(signedAmountMinor),
    amount: money(amountMinor, "RUB"),
    signedAmountMinor,
    amountBreakdown: {
      grossAmountMinor: toNullableSafeSignedMinorUnit(row.grossAmountMinor),
      platformFeeAmountMinor: toNullableSafeSignedMinorUnit(row.platformFeeAmountMinor),
      netAmountMinor: toSafeSignedMinorUnit(row.netAmountMinor),
      currency: "RUB"
    },
    balanceBucket: row.balanceBucket,
    orderId: row.orderId,
    payoutRequestId: row.payoutRequestId,
    occurredAt: row.occurredAt.toISOString(),
    postedAt: row.postedAt.toISOString(),
    metadata: row.metadata
  };
}

function kindForLedgerOperation(
  operationType: LedgerOperation["operationType"]
): FinanceLedgerOperationKind {
  switch (operationType) {
    case "sale_captured":
    case "funds_released":
      return "sale";
    case "payout_reserved":
    case "payout_paid":
    case "payout_failed":
      return "payout";
    case "refund_recorded":
    case "chargeback_recorded":
      return "refund";
    case "platform_fee_recorded":
    case "provider_fee_recorded":
    case "hold_created":
    case "reserve_created":
    case "reserve_released":
    case "manual_adjustment":
      return "adjustment";
  }
}

function directionForSignedAmount(signedAmountMinor: number): FinanceOperationDirection {
  if (signedAmountMinor > 0) return "inflow";
  if (signedAmountMinor < 0) return "outflow";
  return "neutral";
}

function createLedgerOperationsCursor(input: {
  readonly postedAt: string;
  readonly id: string;
}): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function parseLedgerOperationsCursor(cursor: string): {
  readonly postedAt: string;
  readonly id: string;
} {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { postedAt?: unknown }).postedAt !== "string" ||
    typeof (parsed as { id?: unknown }).id !== "string"
  ) {
    throw new Error("Invalid ledger operations cursor");
  }
  return parsed as { readonly postedAt: string; readonly id: string };
}

function walletBucketForAccountType(accountType: LedgerAccountType): WalletBalanceBucket | null {
  switch (accountType) {
    case "astrologer_pending":
      return "pending";
    case "astrologer_available":
      return "available";
    case "astrologer_reserved":
      return "reserved";
    case "astrologer_payout_pending":
      return "payout_pending";
    case "astrologer_negative_balance":
      return "negative_balance";
    case "platform_clearing":
    case "platform_revenue":
    case "provider_fees":
    case "payout_clearing":
      return null;
  }
}

function toSafeMinorUnit(value: number | string): number {
  const amountMinor = Number(value);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("Ledger operation query produced an invalid amount");
  }
  return amountMinor;
}

function toSafeSignedMinorUnit(value: number | string): number {
  const amountMinor = Number(value);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("Ledger operation query produced an invalid signed amount");
  }
  return amountMinor;
}

function toNullableSafeSignedMinorUnit(value: number | string | null): number | null {
  if (value === null) return null;
  return toSafeSignedMinorUnit(value);
}

function toSafeCount(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Finance period summary query produced an invalid count");
  }
  return count;
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}
