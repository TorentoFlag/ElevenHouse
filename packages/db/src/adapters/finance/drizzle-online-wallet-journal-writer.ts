import {
  digestFinanceCanonicalValueV1,
  financeLedgerChart,
  type FinanceJournalTransaction,
  type FinanceLedgerAccountRef
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  financeAccounts,
  financeJournalEntries,
  financeJournalTransactions,
  financeSourceIdentities
} from "../../schema/finance/ledger.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";

export class OnlineWalletJournalWriteError extends Error {
  readonly code = "online_wallet_journal_write_error";

  constructor() {
    super("Online wallet journal could not be written as a sealed v2 transaction");
    this.name = "OnlineWalletJournalWriteError";
  }
}

export type OnlineWalletJournalWriteReceipt = Readonly<{
  journalTransactionId: string;
  canonicalDigest: string;
  entries: readonly Readonly<{ id: string; entryIndex: number }>[];
}>;

export type OnlineWalletProviderAccountIdentity = Readonly<{
  versionId: string;
  seriesId: string;
  providerAccountId: string;
  identityVersion: number;
}>;

/**
 * The v2 capture writer deliberately cannot be reused here: it requires the capture's provider
 * source scope. Subsequent payable mutations are astrologer-scoped, still seal the same generic
 * double-entry journal, and never emit legacy wallet/link proof records.
 */
export async function writeOnlineWalletAstrologerJournal(
  transaction: FinanceTransaction,
  input: Readonly<{
    journal: FinanceJournalTransaction;
    astrologerUserId: string;
  }>
): Promise<OnlineWalletJournalWriteReceipt> {
  const { journal, astrologerUserId } = input;
  const isHoldRelease =
    journal.sourceKey.kind === "reserve" && journal.sourceKey.operation === "hold_released";
  const isPayoutRequest =
    journal.sourceKey.kind === "payout" && journal.sourceKey.operation === "requested";
  const isPayoutRelease =
    journal.sourceKey.kind === "payout" && journal.sourceKey.operation === "released";
  if ((!isHoldRelease && !isPayoutRequest && !isPayoutRelease) || !isIdentifier(astrologerUserId)) {
    throw new OnlineWalletJournalWriteError();
  }

  const [source] = await transaction
    .insert(financeSourceIdentities)
    .values({
      sourceKind: journal.sourceKey.kind,
      sourceId: journal.sourceKey.sourceId,
      sourceOperationKey: journal.sourceKey.operation,
      sourceScopeKind: "astrologer",
      providerAccountVersionId: null,
      providerAccountSeriesId: null,
      providerAccountId: null,
      providerIdentityVersion: null,
      bankCashPoolId: null,
      astrologerUserId,
      refundId: null,
      payoutRequestId: null
    })
    .returning({ id: financeSourceIdentities.id });
  if (!source) throw new OnlineWalletJournalWriteError();

  await transaction.insert(financeJournalTransactions).values({
    id: journal.id,
    sourceIdentityId: source.id,
    occurredAt: instant(journal.occurredAt),
    postedAt: instant(journal.postedAt),
    reversesJournalTransactionId: journal.reversesTransactionId,
    currency: "RUB"
  });

  const accounts = new Map<string, string>();
  const entries: { id: string; entryIndex: number }[] = [];
  for (const [entryIndex, entry] of journal.entries.entries()) {
    assertAstrologerAccount(entry.account, astrologerUserId);
    const key = JSON.stringify(entry.account);
    let accountId = accounts.get(key);
    if (!accountId) {
      accountId = await resolveAstrologerAccount(transaction, entry.account, astrologerUserId);
      accounts.set(key, accountId);
    }
    const [row] = await transaction
      .insert(financeJournalEntries)
      .values({
        journalTransactionId: journal.id,
        occurredAt: instant(journal.occurredAt),
        entryIndex,
        accountId,
        side: entry.side,
        amountMinor: String(entry.amount.amountMinor),
        currency: "RUB",
        originalSaleId: entry.links.originalSaleId,
        componentId: entry.links.componentId,
        payableLotId: entry.links.payableLotId,
        payoutAllocationId: entry.links.payoutAllocationId
      })
      .returning({ id: financeJournalEntries.id, entryIndex: financeJournalEntries.entryIndex });
    if (!row) throw new OnlineWalletJournalWriteError();
    entries.push(row);
  }

  const expectedDigest = digestFinanceCanonicalValueV1(journal);
  const [sealed] = await transaction
    .update(financeJournalTransactions)
    .set({
      entryCount: journal.entries.length,
      totalDebitMinor: journal.totalDebitMinor,
      totalCreditMinor: journal.totalCreditMinor,
      sealedAt: sql`statement_timestamp()`
    })
    .where(
      and(
        eq(financeJournalTransactions.id, journal.id),
        isNull(financeJournalTransactions.sealedAt)
      )
    )
    .returning({ canonicalDigest: financeJournalTransactions.canonicalDigest });
  if (!sealed?.canonicalDigest || sealed.canonicalDigest !== expectedDigest) {
    throw new OnlineWalletJournalWriteError();
  }
  return Object.freeze({
    journalTransactionId: journal.id,
    canonicalDigest: sealed.canonicalDigest,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry)))
  });
}

/**
 * Writes a provider-confirmed online reversal/dispute journal. Unlike a hold or payout
 * reclassification, these source operations are scoped to both the provider account and the
 * original astrologer, even when a provisional chargeback posting has not yet allocated any
 * amount to that astrologer. This remains a v2 mutation journal and deliberately emits no v1
 * link proof.
 */
export async function writeOnlineWalletProviderAstrologerJournal(
  transaction: FinanceTransaction,
  input: Readonly<{
    journal: FinanceJournalTransaction;
    astrologerUserId: string;
    providerAccount: OnlineWalletProviderAccountIdentity;
  }>
): Promise<OnlineWalletJournalWriteReceipt> {
  const { journal, astrologerUserId, providerAccount } = input;
  if (
    !(
      (journal.sourceKey.kind === "refund" && journal.sourceKey.operation === "confirmed") ||
      (journal.sourceKey.kind === "chargeback" && journal.sourceKey.operation === "confirmed")
    ) ||
    !isIdentifier(astrologerUserId) ||
    !isProviderAccount(providerAccount)
  ) {
    throw new OnlineWalletJournalWriteError();
  }
  const [source] = await transaction
    .insert(financeSourceIdentities)
    .values({
      sourceKind: journal.sourceKey.kind,
      sourceId: journal.sourceKey.sourceId,
      sourceOperationKey: journal.sourceKey.operation,
      sourceScopeKind: "provider_account_and_astrologer",
      providerAccountVersionId: providerAccount.versionId,
      providerAccountSeriesId: providerAccount.seriesId,
      providerAccountId: providerAccount.providerAccountId,
      providerIdentityVersion: providerAccount.identityVersion,
      bankCashPoolId: null,
      astrologerUserId,
      refundId: null,
      payoutRequestId: null
    })
    .returning({ id: financeSourceIdentities.id });
  if (!source) throw new OnlineWalletJournalWriteError();
  await transaction.insert(financeJournalTransactions).values({
    id: journal.id,
    sourceIdentityId: source.id,
    occurredAt: instant(journal.occurredAt),
    postedAt: instant(journal.postedAt),
    reversesJournalTransactionId: journal.reversesTransactionId,
    currency: "RUB"
  });
  const accounts = new Map<string, string>();
  const entries: { id: string; entryIndex: number }[] = [];
  for (const [entryIndex, entry] of journal.entries.entries()) {
    assertProviderAstrologerAccount(entry.account, astrologerUserId, providerAccount);
    const key = JSON.stringify(entry.account);
    let accountId = accounts.get(key);
    if (!accountId) {
      accountId = await resolveProviderAstrologerAccount(
        transaction,
        entry.account,
        astrologerUserId,
        providerAccount
      );
      accounts.set(key, accountId);
    }
    const [row] = await transaction
      .insert(financeJournalEntries)
      .values({
        journalTransactionId: journal.id,
        occurredAt: instant(journal.occurredAt),
        entryIndex,
        accountId,
        side: entry.side,
        amountMinor: String(entry.amount.amountMinor),
        currency: "RUB",
        originalSaleId: entry.links.originalSaleId,
        componentId: entry.links.componentId,
        payableLotId: entry.links.payableLotId,
        payoutAllocationId: entry.links.payoutAllocationId
      })
      .returning({ id: financeJournalEntries.id, entryIndex: financeJournalEntries.entryIndex });
    if (!row) throw new OnlineWalletJournalWriteError();
    entries.push(row);
  }
  return sealOnlineWalletJournal(transaction, journal, entries);
}

function assertAstrologerAccount(account: FinanceLedgerAccountRef, astrologerUserId: string): void {
  if (
    !("astrologerUserId" in account) ||
    account.astrologerUserId !== astrologerUserId ||
    financeLedgerChart[account.code].scopeKind !== "astrologer"
  ) {
    throw new OnlineWalletJournalWriteError();
  }
}

async function resolveAstrologerAccount(
  transaction: FinanceTransaction,
  account: FinanceLedgerAccountRef,
  astrologerUserId: string
): Promise<string> {
  assertAstrologerAccount(account, astrologerUserId);
  const chart = financeLedgerChart[account.code];
  const [created] = await transaction
    .insert(financeAccounts)
    .values({
      code: account.code,
      accountClass: chart.accountClass,
      normalSide: chart.normalSide,
      scopeKind: chart.scopeKind,
      providerAccountVersionId: null,
      providerAccountSeriesId: null,
      providerAccountId: null,
      providerIdentityVersion: null,
      bankCashPoolId: null,
      astrologerUserId,
      refundId: null,
      payoutRequestId: null,
      currency: "RUB"
    })
    .onConflictDoNothing()
    .returning({ id: financeAccounts.id });
  if (created) return created.id;
  const rows = await transaction
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.code, account.code),
        eq(financeAccounts.currency, "RUB"),
        eq(financeAccounts.astrologerUserId, astrologerUserId)
      )
    )
    .limit(2);
  if (rows.length !== 1 || !rows[0]) throw new OnlineWalletJournalWriteError();
  return rows[0].id;
}

function assertProviderAstrologerAccount(
  account: FinanceLedgerAccountRef,
  astrologerUserId: string,
  providerAccount: OnlineWalletProviderAccountIdentity
): void {
  const scope = financeLedgerChart[account.code].scopeKind;
  if (
    ("astrologerUserId" in account && account.astrologerUserId !== astrologerUserId) ||
    ("arcProviderAccountId" in account &&
      account.arcProviderAccountId !== providerAccount.providerAccountId) ||
    (scope !== "astrologer" && scope !== "arc_provider_account" && scope !== "platform")
  ) {
    throw new OnlineWalletJournalWriteError();
  }
}

async function resolveProviderAstrologerAccount(
  transaction: FinanceTransaction,
  account: FinanceLedgerAccountRef,
  astrologerUserId: string,
  providerAccount: OnlineWalletProviderAccountIdentity
): Promise<string> {
  assertProviderAstrologerAccount(account, astrologerUserId, providerAccount);
  const chart = financeLedgerChart[account.code];
  const providerBound = "arcProviderAccountId" in account;
  const astrologerBound = "astrologerUserId" in account;
  const values = {
    code: account.code,
    accountClass: chart.accountClass,
    normalSide: chart.normalSide,
    scopeKind: chart.scopeKind,
    providerAccountVersionId: providerBound ? providerAccount.versionId : null,
    providerAccountSeriesId: providerBound ? providerAccount.seriesId : null,
    providerAccountId: providerBound ? providerAccount.providerAccountId : null,
    providerIdentityVersion: providerBound ? providerAccount.identityVersion : null,
    bankCashPoolId: null,
    astrologerUserId: astrologerBound ? astrologerUserId : null,
    refundId: null,
    payoutRequestId: null,
    currency: "RUB" as const
  };
  const [created] = await transaction
    .insert(financeAccounts)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: financeAccounts.id });
  if (created) return created.id;
  const rows = await transaction
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.code, account.code),
        eq(financeAccounts.currency, "RUB"),
        providerBound
          ? eq(financeAccounts.providerAccountVersionId, providerAccount.versionId)
          : isNull(financeAccounts.providerAccountVersionId),
        astrologerBound
          ? eq(financeAccounts.astrologerUserId, astrologerUserId)
          : isNull(financeAccounts.astrologerUserId)
      )
    )
    .limit(2);
  if (rows.length !== 1 || !rows[0]) throw new OnlineWalletJournalWriteError();
  return rows[0].id;
}

async function sealOnlineWalletJournal(
  transaction: FinanceTransaction,
  journal: FinanceJournalTransaction,
  entries: { id: string; entryIndex: number }[]
): Promise<OnlineWalletJournalWriteReceipt> {
  const expectedDigest = digestFinanceCanonicalValueV1(journal);
  const [sealed] = await transaction
    .update(financeJournalTransactions)
    .set({
      entryCount: journal.entries.length,
      totalDebitMinor: journal.totalDebitMinor,
      totalCreditMinor: journal.totalCreditMinor,
      sealedAt: sql`statement_timestamp()`
    })
    .where(
      and(
        eq(financeJournalTransactions.id, journal.id),
        isNull(financeJournalTransactions.sealedAt)
      )
    )
    .returning({ canonicalDigest: financeJournalTransactions.canonicalDigest });
  if (!sealed?.canonicalDigest || sealed.canonicalDigest !== expectedDigest) {
    throw new OnlineWalletJournalWriteError();
  }
  return Object.freeze({
    journalTransactionId: journal.id,
    canonicalDigest: sealed.canonicalDigest,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry)))
  });
}

function instant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new OnlineWalletJournalWriteError();
  return date;
}

function isIdentifier(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 200;
}

function isProviderAccount(value: OnlineWalletProviderAccountIdentity): boolean {
  return (
    isIdentifier(value.versionId) &&
    isIdentifier(value.seriesId) &&
    isIdentifier(value.providerAccountId) &&
    Number.isSafeInteger(value.identityVersion) &&
    value.identityVersion > 0
  );
}
