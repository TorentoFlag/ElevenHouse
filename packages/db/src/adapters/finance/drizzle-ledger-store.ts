import { and, eq, sql } from "drizzle-orm";
import {
  LedgerAccountShapeError,
  LedgerUnbalancedTransactionError,
  type CreateLedgerEntryInput,
  type CreateLedgerTransactionInput,
  type LedgerAccountRef,
  type LedgerAccountType,
  type LedgerEntryRecord,
  type LedgerStore,
  type LedgerTransactionRecord,
  type Money,
  type WalletBalance,
  type WalletBalanceBucket
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  walletBalanceReadModels
} from "../../schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";

type LedgerAccountRow = typeof ledgerAccounts.$inferSelect;
type LedgerTransactionRow = typeof ledgerTransactions.$inferSelect;
type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
type WalletBalanceRow = typeof walletBalanceReadModels.$inferSelect;

type EntryRowWithAccount = {
  readonly entry: LedgerEntryRow;
  readonly account: LedgerAccountRow;
};

export function createDrizzleLedgerStore(database: ElevenHouseDatabase): LedgerStore {
  return {
    createTransaction: (input) =>
      database.transaction((transaction) => createLedgerTransaction(transaction, input)),
    findWalletBalance: (astrologerUserId) => findWalletBalance(database, astrologerUserId)
  };
}

export function createDrizzleLedgerTransactionStore(
  database: FinanceTransaction
): Pick<LedgerStore, "createTransaction" | "findWalletBalance"> {
  return {
    createTransaction: (input) => createLedgerTransaction(database, input),
    findWalletBalance: (astrologerUserId) => findWalletBalance(database, astrologerUserId)
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
        affectedAstrologerBuckets.get(account.astrologerUserId) ??
        new Set<WalletBalanceBucket>();
      buckets.add(account.balanceBucket as WalletBalanceBucket);
      affectedAstrologerBuckets.set(account.astrologerUserId, buckets);
    }
  }

  for (const [astrologerUserId, buckets] of affectedAstrologerBuckets) {
    await recomputeWalletBalanceBuckets(database, astrologerUserId, buckets, input.postedAt);
  }

  return toLedgerTransactionRecord(transactionRow, insertedEntries);
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
  const [row] = await database
    .select({
      amountMinor: sql<number>`coalesce(sum(case when ${ledgerEntries.side} = 'credit' then ${ledgerEntries.amountMinor} when ${ledgerEntries.side} = 'debit' then -${ledgerEntries.amountMinor} else 0 end), 0)`
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

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}
