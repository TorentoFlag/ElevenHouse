/* eslint-disable no-control-regex -- financial persistence boundary rejects control characters. */
import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  createFinanceJournalTransaction,
  digestFinanceCanonicalValueV1,
  hashFinanceCommandPayload,
  type BankCashMatchCommitReceipt,
  type BankCashMatchUnitOfWork,
  type FinanceDigest,
  type ResolvedFinanceOperationEnvelope
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeBankCashMatchReceipts,
  financeBankMatches,
  financeBankStatementIngestionReceipts,
  financeBankStatementRows
} from "../../schema/finance/bank-cash.schema";
import {
  financeBankExposures,
  financeBankExposureHistory,
  financeBankLiquidityHeads,
  financeBankLiquidityHistory
} from "../../schema/finance/bank-liquidity.schema";
import {
  financeAccounts,
  financeAllocationLinkProofEntries,
  financeAllocationLinkProofs,
  financeJournalEntries,
  financeJournalTransactions,
  financePersistenceCommitReceipts,
  financeSourceIdentities
} from "../../schema/finance/ledger.schema";
import { issueJournalPersistenceAuthority } from "./journal-transaction-writer";
import {
  financeOnlinePayoutPaidReceipts,
  financeOnlinePayoutRequests
} from "../../schema/finance/online-payouts.schema";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type BankCashMatchPersistenceReason =
  | "invalid_command"
  | "statement_ingestion_missing"
  | "payout_paid_receipt_missing"
  | "manual_payout_binding_invalid"
  | "bank_liquidity_revision_conflict"
  | "bank_match_conflict"
  | "bank_exposure_conflict"
  | "unsupported_amount"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class BankCashMatchPersistenceError extends Error {
  readonly code = "bank_cash_match_persistence_error";

  constructor(readonly reason: BankCashMatchPersistenceReason) {
    super("Bank cash match could not be committed atomically");
    this.name = "BankCashMatchPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  bankCashPoolId: string;
  currency: "RUB";
  expectedBankLiquidityRevision: string;
  statementIngestion: Readonly<{ receiptId: string; canonicalDigest: FinanceDigest }>;
  payoutPaid: Readonly<{ receiptId: string; canonicalDigest: FinanceDigest }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

/**
 * Settles one already-proven manual payout only after its exact bank debit is present in a sealed
 * statement import. The entire accounting fact (journal, match receipt, exposure state and
 * liquidity-head revision) shares one PostgreSQL transaction. It deliberately has no branch for
 * merchant settlement or suspense classification: those require their own authority contracts.
 */
export function createDrizzleBankCashMatchUnitOfWork<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): BankCashMatchUnitOfWork {
  return Object.freeze({
    async matchBankCash(command) {
      const normalized = normalizeBankCashMatchCommand(command);
      try {
        return await input.database.transaction((transaction) => matchManualPayout(transaction, normalized));
      } catch (error) {
        if (error instanceof BankCashMatchPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("bank_match_conflict");
        if (code === "23503") fail("statement_ingestion_missing");
        if (code === "23514" || code === "55000") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies BankCashMatchUnitOfWork);
}

export function normalizeBankCashMatchCommand(input: unknown): NormalizedCommand {
  return boundary(() => {
    exactRecord(input, [
      "bankCashPoolId",
      "currency",
      "expectedBankLiquidityRevision",
      "statementIngestion",
      "matchAuthority",
      "operationEnvelope"
    ]);
    if (input.currency !== "RUB") fail("invalid_command");
    const bankCashPoolId = identifier(input.bankCashPoolId, 160);
    const expectedBankLiquidityRevision = revision(input.expectedBankLiquidityRevision, true);
    exactRecord(input.statementIngestion, ["kind", "receiptId", "version", "canonicalDigest"]);
    if (
      input.statementIngestion.kind !== "bank_statement_ingestion_commit_receipt" ||
      input.statementIngestion.version !== 1
    ) fail("invalid_command");
    exactRecord(input.matchAuthority, ["kind", "payoutPaid"]);
    if (input.matchAuthority.kind !== "manual_payout") fail("invalid_command");
    exactRecord(input.matchAuthority.payoutPaid, ["kind", "receiptId", "version", "canonicalDigest"]);
    if (
      input.matchAuthority.payoutPaid.kind !== "online_wallet_payout_paid_receipt" ||
      input.matchAuthority.payoutPaid.version !== 1
    ) fail("invalid_command");
    return Object.freeze({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision,
      statementIngestion: Object.freeze({
        receiptId: identifier(input.statementIngestion.receiptId, 200),
        canonicalDigest: digest(input.statementIngestion.canonicalDigest)
      }),
      payoutPaid: Object.freeze({
        receiptId: identifier(input.matchAuthority.payoutPaid.receiptId, 200),
        canonicalDigest: digest(input.matchAuthority.payoutPaid.canonicalDigest)
      }),
      operationEnvelope: normalizeEnvelope(input.operationEnvelope)
    });
  });
}

async function matchManualPayout<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  command: NormalizedCommand
): Promise<BankCashMatchCommitReceipt> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${command.bankCashPoolId}:${command.currency}`}, 0))`
  );
  const [head] = await transaction
    .select()
    .from(financeBankLiquidityHeads)
    .where(and(eq(financeBankLiquidityHeads.bankCashPoolId, command.bankCashPoolId), eq(financeBankLiquidityHeads.currency, command.currency)))
    .limit(2)
    .for("update");

  const statement = await lockStatementIngestion(transaction, command);
  const paid = await lockPaidReceipt(transaction, command);
  const existing = await findExistingMatch(transaction, statement.receipt.bankStatementEntryId, paid.receipt.receiptId);
  if (existing) return replay(transaction, existing, command, statement.receipt.bankStatementEntryId);
  if (!head || head.revision !== command.expectedBankLiquidityRevision || head.snapshotState !== "adopted" || !head.currentSnapshotId || !head.currentSnapshotVersion || !head.currentSnapshotDigest || head.unrestrictedAvailableMinor === null || head.availableLiquidityMinor === null) {
    fail("bank_liquidity_revision_conflict");
  }

  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, paid.receipt.payoutRequestId))
    .limit(2)
    .for("share");
  if (!payout || payout.immutableAmountMinor !== statement.amountMinor || paid.receipt.bankReference !== statement.row.bankReference) {
    fail("manual_payout_binding_invalid");
  }
  const [exposure] = await transaction
    .select()
    .from(financeBankExposures)
    .where(eq(financeBankExposures.exposureId, paid.receipt.bankExposureId))
    .limit(2)
    .for("update");
  if (!exposure || exposure.payoutRequestId !== payout.id || exposure.bankCashPoolId !== command.bankCashPoolId || exposure.currency !== command.currency || exposure.amountMinor !== statement.amountMinor || exposure.version !== paid.receipt.bankExposureVersion || exposure.state !== "paid_unreflected") {
    fail("bank_exposure_conflict");
  }
  const [previousExposureHistory] = await transaction
    .select()
    .from(financeBankExposureHistory)
    .where(and(eq(financeBankExposureHistory.exposureId, exposure.exposureId), eq(financeBankExposureHistory.version, exposure.version)))
    .limit(2)
    .for("share");
  if (!previousExposureHistory) fail("bank_exposure_conflict");

  if (statement.amountMinor.length > command.operationEnvelope.maximumDecimalDigits) fail("invalid_command");
  const amount = safePositiveMinor(statement.amountMinor);
  const occurredAt = statement.row.occurredAt.toISOString();
  const postedAt = new Date(Math.max(Date.now(), statement.row.occurredAt.getTime())).toISOString();
  const matchId = deterministicId("bank-manual-payout-match", {
    bankCashPoolId: command.bankCashPoolId,
    bankStatementEntryId: statement.receipt.bankStatementEntryId,
    payoutPaidReceiptId: paid.receipt.receiptId,
    payoutPaidReceiptDigest: paid.receipt.canonicalDigest
  });
  const journal = createFinanceJournalTransaction({
    id: `bank-manual-payout-match:${matchId}`,
    sourceKey: { kind: "bank", sourceId: statement.receipt.bankStatementEntryId, operation: "payout_debit_matched" },
    occurredAt,
    postedAt,
    reversesTransactionId: null,
    entries: [
      { account: { code: "bank_outbound_clearing", bankCashPoolId: command.bankCashPoolId, currency: "RUB" }, side: "debit", amount: { amountMinor: amount, currency: "RUB" }, links: emptyLinks() },
      { account: { code: "bank_cash", bankCashPoolId: command.bankCashPoolId, currency: "RUB" }, side: "credit", amount: { amountMinor: amount, currency: "RUB" }, links: emptyLinks() }
    ]
  });
  const journalReceipt = await writeBankMatchJournal(transaction, journal, command.bankCashPoolId, {
    matchId,
    statementIngestionReceiptId: statement.receipt.receiptId,
    statementIngestionReceiptDigest: statement.receipt.canonicalDigest as FinanceDigest,
    payoutPaidReceiptId: paid.receipt.receiptId,
    payoutPaidReceiptDigest: paid.receipt.canonicalDigest as FinanceDigest
  });
  const nextLiquidityRevision = (BigInt(head.revision) + 1n).toString();
  const [match] = await transaction.insert(financeBankMatches).values({
    matchId,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    bankStatementEntryId: statement.receipt.bankStatementEntryId,
    statementIngestionReceiptId: statement.receipt.receiptId,
    statementIngestionReceiptVersion: statement.receipt.receiptVersion,
    statementIngestionReceiptDigest: statement.receipt.canonicalDigest,
    authorityKind: "manual_payout",
    merchantPayoutReceiptId: null, merchantPayoutReceiptVersion: null, merchantPayoutReceiptDigest: null,
    merchantProviderAccountSeriesId: null, merchantProviderAccountId: null, merchantProviderIdentityVersion: null,
    merchantPayoutId: null, merchantProviderBankPayoutId: null, merchantBankReference: null,
    payoutPaidReceiptId: paid.receipt.receiptId, payoutPaidReceiptVersion: paid.receipt.receiptVersion, payoutPaidReceiptDigest: paid.receipt.canonicalDigest,
    classificationRuleId: null, classificationRuleVersion: null, classificationRuleDigest: null,
    matchResult: "manual_payout",
    amountMinor: statement.amountMinor,
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    journalSourceIdentityId: journalReceipt.sourceIdentityId,
    expectedBankLiquidityRevision: head.revision,
    bankLiquidityRevision: nextLiquidityRevision,
    persistenceTransactionBoundaryRef: sql`'postgres-xid:' || pg_current_xact_id()::text`
  }).returning();
  if (!match) fail("persistence_write_incomplete");
  const [receipt] = await transaction.insert(financeBankCashMatchReceipts).values({
    matchId: match.matchId,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    bankStatementEntryId: statement.receipt.bankStatementEntryId,
    matchResult: "manual_payout",
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    bankLiquidityRevision: nextLiquidityRevision,
    persistenceTransactionBoundaryRef: sql`'postgres-xid:' || pg_current_xact_id()::text`
  }).returning();
  if (!receipt) fail("persistence_write_incomplete");
  const nextExposureVersion = (BigInt(exposure.version) + 1n).toString();
  const [updatedExposure] = await transaction.update(financeBankExposures).set({ state: "statement_reflected", version: nextExposureVersion, updatedAt: new Date(postedAt) }).where(and(eq(financeBankExposures.exposureId, exposure.exposureId), eq(financeBankExposures.version, exposure.version), eq(financeBankExposures.state, "paid_unreflected"))).returning({ exposureId: financeBankExposures.exposureId });
  if (!updatedExposure) fail("bank_exposure_conflict");
  await transaction.insert(financeBankExposureHistory).values({
    previousHistoryId: previousExposureHistory.historyId,
    exposureId: exposure.exposureId,
    payoutRequestId: payout.id,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    amountMinor: exposure.amountMinor,
    version: nextExposureVersion,
    previousState: "paid_unreflected",
    state: "statement_reflected",
    transitionKind: "statement_debit_reflected",
    transitionAuthorityKind: "bank_cash_match_commit_receipt",
    transitionAuthorityId: receipt.receiptId,
    transitionAuthorityVersion: receipt.receiptVersion,
    transitionAuthorityDigest: receipt.canonicalDigest,
    bankStatementEntryId: statement.receipt.bankStatementEntryId,
    occurredAt: new Date(postedAt)
  });
  const [history] = await transaction.insert(financeBankLiquidityHistory).values({
    previousHistoryId: head.lastHistoryId,
    bankCashPoolId: command.bankCashPoolId,
    currency: command.currency,
    expectedRevision: head.revision,
    revision: nextLiquidityRevision,
    mutationKind: "bank_statement_matched",
    mutationRefId: match.matchId,
    snapshotState: "adopted",
    currentSnapshotId: head.currentSnapshotId,
    currentSnapshotVersion: head.currentSnapshotVersion,
    currentSnapshotDigest: head.currentSnapshotDigest,
    unrestrictedAvailableMinor: head.unrestrictedAvailableMinor,
    openPayoutExposureMinor: head.openPayoutExposureMinor,
    unresolvedDebitExposureMinor: head.unresolvedDebitExposureMinor,
    safetyBufferMinor: head.safetyBufferMinor,
    availableLiquidityMinor: head.availableLiquidityMinor,
    adoptionReceiptId: null,
    adoptionReceiptVersion: null,
    adoptionReceiptDigest: null
  }).returning({ historyId: financeBankLiquidityHistory.historyId });
  if (!history) fail("persistence_write_incomplete");
  const [updatedHead] = await transaction.update(financeBankLiquidityHeads).set({ revision: nextLiquidityRevision, lastHistoryId: history.historyId }).where(and(eq(financeBankLiquidityHeads.id, head.id), eq(financeBankLiquidityHeads.revision, head.revision))).returning({ id: financeBankLiquidityHeads.id });
  if (!updatedHead) fail("bank_liquidity_revision_conflict");
  return mapReceipt(receipt);
}

async function lockStatementIngestion<TSchema extends Record<string, unknown>>(transaction: Transaction<TSchema>, command: NormalizedCommand) {
  const [receipt] = await transaction.select().from(financeBankStatementIngestionReceipts).where(and(eq(financeBankStatementIngestionReceipts.receiptId, command.statementIngestion.receiptId), eq(financeBankStatementIngestionReceipts.receiptVersion, 1), eq(financeBankStatementIngestionReceipts.canonicalDigest, command.statementIngestion.canonicalDigest))).limit(2).for("share");
  if (!receipt || receipt.bankCashPoolId !== command.bankCashPoolId || receipt.currency !== command.currency || receipt.journalTransactionId !== null) fail("statement_ingestion_missing");
  const [row] = await transaction.select().from(financeBankStatementRows).where(and(eq(financeBankStatementRows.bankStatementEntryId, receipt.bankStatementEntryId), eq(financeBankStatementRows.bankCashPoolId, command.bankCashPoolId), eq(financeBankStatementRows.currency, command.currency))).limit(2).for("share");
  if (!row || row.direction !== "debit" || !row.signedAmountMinor.startsWith("-") || row.signedAmountMinor === "-0") fail("manual_payout_binding_invalid");
  return { receipt, row, amountMinor: row.signedAmountMinor.slice(1) };
}

async function lockPaidReceipt<TSchema extends Record<string, unknown>>(transaction: Transaction<TSchema>, command: NormalizedCommand) {
  const [receipt] = await transaction.select().from(financeOnlinePayoutPaidReceipts).where(and(eq(financeOnlinePayoutPaidReceipts.receiptId, command.payoutPaid.receiptId), eq(financeOnlinePayoutPaidReceipts.receiptVersion, 1), eq(financeOnlinePayoutPaidReceipts.canonicalDigest, command.payoutPaid.canonicalDigest))).limit(2).for("share");
  if (!receipt || receipt.bankCashPoolId !== command.bankCashPoolId || receipt.currency !== command.currency) fail("payout_paid_receipt_missing");
  return { receipt };
}

async function findExistingMatch<TSchema extends Record<string, unknown>>(transaction: Transaction<TSchema>, bankStatementEntryId: string, payoutPaidReceiptId: string) {
  const rows = await transaction.select().from(financeBankMatches).where(sql`(${financeBankMatches.bankStatementEntryId} = ${bankStatementEntryId} or ${financeBankMatches.payoutPaidReceiptId} = ${payoutPaidReceiptId})`).limit(2).for("share");
  if (rows.length > 1) fail("bank_match_conflict");
  return rows[0] ?? null;
}

async function replay<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  row: typeof financeBankMatches.$inferSelect,
  command: NormalizedCommand,
  bankStatementEntryId: string
): Promise<BankCashMatchCommitReceipt> {
  if (row.authorityKind !== "manual_payout" || row.matchResult !== "manual_payout" || row.bankCashPoolId !== command.bankCashPoolId || row.currency !== command.currency || row.expectedBankLiquidityRevision !== command.expectedBankLiquidityRevision || row.bankStatementEntryId !== bankStatementEntryId || row.statementIngestionReceiptId !== command.statementIngestion.receiptId || row.statementIngestionReceiptDigest !== command.statementIngestion.canonicalDigest || row.payoutPaidReceiptId !== command.payoutPaid.receiptId || row.payoutPaidReceiptDigest !== command.payoutPaid.canonicalDigest) fail("bank_match_conflict");
  const [receipt] = await transaction.select().from(financeBankCashMatchReceipts)
    .where(and(eq(financeBankCashMatchReceipts.matchId, row.matchId), eq(financeBankCashMatchReceipts.bankLiquidityRevision, row.bankLiquidityRevision)))
    .limit(2)
    .for("share");
  if (!receipt || receipt.journalTransactionId !== row.journalTransactionId || receipt.journalTransactionDigest !== row.journalTransactionDigest) fail("persistence_write_incomplete");
  return mapReceipt(receipt);
}

async function writeBankMatchJournal<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  journal: ReturnType<typeof createFinanceJournalTransaction>,
  bankCashPoolId: string,
  binding: Readonly<{
    matchId: string;
    statementIngestionReceiptId: string;
    statementIngestionReceiptDigest: FinanceDigest;
    payoutPaidReceiptId: string;
    payoutPaidReceiptDigest: FinanceDigest;
  }>
) {
  const [source] = await transaction.insert(financeSourceIdentities).values({ sourceKind: "bank", sourceId: journal.sourceKey.sourceId, sourceOperationKey: "payout_debit_matched", sourceScopeKind: "bank_cash_pool", providerAccountVersionId: null, providerAccountSeriesId: null, providerAccountId: null, providerIdentityVersion: null, bankCashPoolId, astrologerUserId: null, refundId: null, payoutRequestId: null }).returning({ id: financeSourceIdentities.id });
  if (!source) fail("persistence_write_incomplete");
  await transaction.insert(financeJournalTransactions).values({ id: journal.id, sourceIdentityId: source.id, occurredAt: new Date(journal.occurredAt), postedAt: new Date(journal.postedAt), reversesJournalTransactionId: null, currency: "RUB" });
  const entryRows: Array<Readonly<{ id: string; accountId: string; entryIndex: number }>> = [];
  for (const [entryIndex, entry] of journal.entries.entries()) {
    if (!("bankCashPoolId" in entry.account) || entry.account.bankCashPoolId !== bankCashPoolId || (entry.account.code !== "bank_outbound_clearing" && entry.account.code !== "bank_cash")) fail("persistence_write_incomplete");
    const accountId = await resolveBankCashAccount(transaction, entry.account.code, bankCashPoolId);
    const [entryRow] = await transaction.insert(financeJournalEntries).values({ journalTransactionId: journal.id, occurredAt: new Date(journal.occurredAt), entryIndex, accountId, side: entry.side, amountMinor: String(entry.amount.amountMinor), currency: "RUB", originalSaleId: null, componentId: null, payableLotId: null, payoutAllocationId: null }).returning({ id: financeJournalEntries.id });
    if (!entryRow) fail("persistence_write_incomplete");
    entryRows.push(Object.freeze({ id: entryRow.id, accountId, entryIndex }));
  }
  const proofId = deterministicId("bank-manual-payout-match-proof", binding);
  const proofEdges = journal.entries.map((entry, entryIndex) => Object.freeze({
    entryIndex,
    account: entry.account,
    side: entry.side,
    amount: entry.amount,
    links: entry.links,
    semanticEdgeId: null,
    lotAllocationId: null
  }));
  const proofCore = Object.freeze({
    kind: "finance_allocation_link_proof" as const,
    proofId,
    version: 1 as const,
    allocationAuthorityRef: Object.freeze({ kind: "online_wallet_payout_paid_receipt", authorityId: binding.payoutPaidReceiptId, version: 1, canonicalDigest: binding.payoutPaidReceiptDigest }),
    sourceEvidenceRef: Object.freeze({ kind: "bank_statement_ingestion_commit_receipt", evidenceId: binding.statementIngestionReceiptId, canonicalDigest: binding.statementIngestionReceiptDigest }),
    journalTransactionId: journal.id,
    journalSourceKey: journal.sourceKey,
    operationId: binding.matchId,
    operationSnapshotRef: null,
    edges: Object.freeze(proofEdges)
  });
  const proofDigest = hashFinanceCommandPayload(proofCore);
  const [proof] = await transaction.insert(financeAllocationLinkProofs).values({
    proofId,
    version: 1,
    allocationAuthorityKind: proofCore.allocationAuthorityRef.kind,
    allocationAuthorityId: proofCore.allocationAuthorityRef.authorityId,
    allocationAuthorityVersion: proofCore.allocationAuthorityRef.version,
    allocationAuthorityDigest: proofCore.allocationAuthorityRef.canonicalDigest,
    sourceEvidenceKind: proofCore.sourceEvidenceRef.kind,
    sourceEvidenceId: proofCore.sourceEvidenceRef.evidenceId,
    sourceEvidenceDigest: proofCore.sourceEvidenceRef.canonicalDigest,
    journalTransactionId: journal.id,
    journalSourceKind: journal.sourceKey.kind,
    journalSourceId: journal.sourceKey.sourceId,
    journalSourceOperationKey: journal.sourceKey.operation,
    operationId: binding.matchId,
    operationSnapshotId: null,
    operationSnapshotOperationId: null,
    operationSnapshotPreviousWalletRevision: null,
    operationSnapshotNextWalletRevision: null,
    operationSnapshotPreviousLotStateDigest: null,
    operationSnapshotNextLotStateDigest: null,
    operationSnapshotHistoryRecordDigest: null,
    operationSnapshotDigest: null,
    proofDigest
  }).returning({ id: financeAllocationLinkProofs.id });
  if (!proof) fail("persistence_write_incomplete");
  await transaction.insert(financeAllocationLinkProofEntries).values(proofEdges.map((edge) => {
    const persisted = entryRows[edge.entryIndex];
    if (!persisted) fail("persistence_write_incomplete");
    return {
      proofRecordId: proof.id,
      journalEntryId: persisted.id,
      entryIndex: edge.entryIndex,
      accountId: persisted.accountId,
      side: edge.side,
      amountMinor: String(edge.amount.amountMinor),
      currency: "RUB" as const,
      originalSaleId: null,
      componentId: null,
      payableLotId: null,
      payoutAllocationId: null,
      semanticEdgeId: null,
      lotAllocationId: null
    };
  }));
  const expectedDigest = digestFinanceCanonicalValueV1(journal);
  const [sealed] = await transaction.update(financeJournalTransactions).set({ entryCount: journal.entries.length, totalDebitMinor: String(journal.totalDebitMinor), totalCreditMinor: String(journal.totalCreditMinor), sealedAt: sql`statement_timestamp()` }).where(and(eq(financeJournalTransactions.id, journal.id), isNull(financeJournalTransactions.sealedAt))).returning({ canonicalDigest: financeJournalTransactions.canonicalDigest });
  if (!sealed?.canonicalDigest || sealed.canonicalDigest !== expectedDigest) fail("persistence_write_incomplete");
  const authority = await issueJournalPersistenceAuthority(transaction);
  const preimage = sql<string>`finance_journal_receipt_preimage(
    ${authority.receiptId}, ${source.id}::uuid, ${journal.id}, ${proof.id}::uuid,
    ${proofDigest}, ${authority.persistenceTransactionBoundaryRef}
  )`;
  const [persistenceReceipt] = await transaction.insert(financePersistenceCommitReceipts).values({
    receiptId: authority.receiptId,
    receiptKind: "sealed_journal_transaction",
    sourceIdentityId: source.id,
    journalTransactionId: journal.id,
    proofRecordId: proof.id,
    canonicalPreimage: preimage,
    canonicalDigest: sql`'sha256:' || encode(digest(${preimage}, 'sha256'), 'hex')`,
    persistenceTransactionBoundaryRef: authority.persistenceTransactionBoundaryRef,
    issuedAt: sql`statement_timestamp()`
  }).returning({ receiptId: financePersistenceCommitReceipts.receiptId });
  if (!persistenceReceipt) fail("persistence_write_incomplete");
  return { journalTransactionId: journal.id, canonicalDigest: sealed.canonicalDigest, sourceIdentityId: source.id };
}

async function resolveBankCashAccount<TSchema extends Record<string, unknown>>(transaction: Transaction<TSchema>, code: "bank_outbound_clearing" | "bank_cash", bankCashPoolId: string): Promise<string> {
  const chart = code === "bank_cash" ? { accountClass: "asset" as const, normalSide: "debit" as const } : { accountClass: "control" as const, normalSide: "credit" as const };
  const [created] = await transaction.insert(financeAccounts).values({ code, ...chart, scopeKind: "bank_cash_pool", providerAccountVersionId: null, providerAccountSeriesId: null, providerAccountId: null, providerIdentityVersion: null, bankCashPoolId, astrologerUserId: null, refundId: null, payoutRequestId: null, currency: "RUB" }).onConflictDoNothing().returning({ id: financeAccounts.id });
  if (created) return created.id;
  const rows = await transaction.select({ id: financeAccounts.id }).from(financeAccounts).where(and(eq(financeAccounts.code, code), eq(financeAccounts.bankCashPoolId, bankCashPoolId), eq(financeAccounts.currency, "RUB"), isNull(financeAccounts.providerAccountVersionId), isNull(financeAccounts.astrologerUserId))).limit(2);
  if (rows.length !== 1 || !rows[0]) fail("persistence_write_incomplete");
  return rows[0].id;
}

function mapReceipt(row: typeof financeBankCashMatchReceipts.$inferSelect): BankCashMatchCommitReceipt {
  if (row.currency !== "RUB" || row.matchResult !== "manual_payout" || row.receiptVersion !== 1 || !digest(row.canonicalDigest) || !boundaryRef(row.persistenceTransactionBoundaryRef)) fail("persistence_write_incomplete");
  return Object.freeze({ ref: Object.freeze({ kind: "bank_cash_match_commit_receipt", receiptId: row.receiptId, version: 1, canonicalDigest: row.canonicalDigest as FinanceDigest }), bankCashPoolId: row.bankCashPoolId, bankStatementEntryId: row.bankStatementEntryId, matchResult: "manual_payout", journalTransactionId: row.journalTransactionId, bankLiquidityRevision: row.bankLiquidityRevision, persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef, committedAt: row.committedAt.toISOString() }) as unknown as BankCashMatchCommitReceipt;
}

function emptyLinks() { return Object.freeze({ originalSaleId: null, componentId: null, payableLotId: null, payoutAllocationId: null }); }
function deterministicId(prefix: string, value: unknown) { return `${prefix}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function exactRecord(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value) || nodeUtilTypes.isProxy(value) || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.prototype.propertyIsEnumerable.call(value, key))) fail("invalid_command"); }
function identifier(value: unknown, maximum: number): string { if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail("invalid_command"); return value; }
function revision(value: unknown, allowZero: boolean): string { if (typeof value !== "string" || !(allowZero ? /^(0|[1-9][0-9]*)$/.test(value) : /^[1-9][0-9]*$/.test(value))) fail("invalid_command"); return value; }
function positiveInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail("invalid_command"); return value; }
function nonNegativeInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("invalid_command"); return value; }
function digest(value: unknown): FinanceDigest { if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail("invalid_command"); return value as FinanceDigest; }
function safePositiveMinor(value: string): number { if (!/^[1-9][0-9]*$/.test(value)) fail("manual_payout_binding_invalid"); const parsed = BigInt(value); if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail("unsupported_amount"); return Number(parsed); }
function normalizeEnvelope(value: unknown): ResolvedFinanceOperationEnvelope { exactRecord(value, ["kind", "policyId", "policyVersion", "policyDigest", "maximumRows", "maximumDecimalDigits", "maximumArtifactBytes"]); if (value.kind !== "resolved_finance_operation_envelope") fail("invalid_command"); return Object.freeze({ kind: "resolved_finance_operation_envelope", policyId: identifier(value.policyId, 160), policyVersion: positiveInteger(value.policyVersion), policyDigest: digest(value.policyDigest), maximumRows: positiveInteger(value.maximumRows), maximumDecimalDigits: positiveInteger(value.maximumDecimalDigits), maximumArtifactBytes: nonNegativeInteger(value.maximumArtifactBytes) }) as ResolvedFinanceOperationEnvelope; }
function boundaryRef(value: unknown): value is string { return typeof value === "string" && /^postgres-xid:[0-9]+$/.test(value); }
function postgresCode(error: unknown) { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function boundary<T>(callback: () => T): T { try { return callback(); } catch (error) { if (error instanceof BankCashMatchPersistenceError) throw error; fail("invalid_command"); } }
function fail(reason: BankCashMatchPersistenceReason): never { throw new BankCashMatchPersistenceError(reason); }
