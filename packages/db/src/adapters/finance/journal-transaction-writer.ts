import {
  assertFinanceJournalLinkProofMatchesTransaction,
  createFinanceJournalTransaction,
  digestFinanceCanonicalValueV1,
  financeLedgerChart,
  rehydrateFinanceJournalLinkProof,
  type FinanceJournalLinkProof,
  type FinanceJournalTransaction,
  type FinanceLedgerAccountRef,
  type FinancePostingDecoderEnvelope,
  type VerifiedFinanceJournalCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  financeAccounts,
  financeAllocationLinkProofEntries,
  financeAllocationLinkProofs,
  financeJournalEntries,
  financeJournalTransactions,
  financePersistenceCommitReceipts,
  financeSourceIdentities
} from "../../schema/finance/ledger.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";

type JournalTransactionExecutor = Pick<
  FinanceTransaction,
  "execute" | "insert" | "select" | "update"
>;

export type ResolvedProviderAccountIdentity = Readonly<{
  versionId: string;
  seriesId: string;
  providerAccountId: string;
  identityVersion: number;
}>;

/**
 * Persistence-only evidence resolution. Bank-bearing variants are intentionally absent: Task 8
 * must introduce a settlement-evidence capability before any adapter may post bank-cash scope.
 */
export type ResolvedJournalSourceScope =
  | Readonly<{ kind: "internal" }>
  | Readonly<{
      kind: "provider_account";
      providerAccount: ResolvedProviderAccountIdentity;
    }>
  | Readonly<{ kind: "astrologer"; astrologerUserId: string }>
  | Readonly<{ kind: "refund_and_payout"; refundId: string; payoutRequestId: string }>
  | Readonly<{
      kind: "provider_account_and_astrologer";
      providerAccount: ResolvedProviderAccountIdentity;
      astrologerUserId: string;
    }>
  | Readonly<{
      kind: "provider_account_astrologer_refund_and_payout";
      providerAccount: ResolvedProviderAccountIdentity;
      astrologerUserId: string;
      refundId: string;
      payoutRequestId: string;
    }>;

type NormalizedScope = Readonly<{
  kind: ResolvedJournalSourceScope["kind"];
  providerAccount: ResolvedProviderAccountIdentity | null;
  bankCashPoolId: null;
  astrologerUserId: string | null;
  refundId: string | null;
  payoutRequestId: string | null;
}>;

export class JournalTransactionWriterIntegrityError extends Error {
  readonly code = "journal_transaction_writer_integrity_error";

  constructor(
    message = "Finance journal write input does not match resolved persistence evidence"
  ) {
    super(message);
    this.name = "JournalTransactionWriterIntegrityError";
  }
}

export async function writeSealedJournalTransaction(
  database: JournalTransactionExecutor,
  input: Readonly<{
    transaction: FinanceJournalTransaction;
    proof: FinanceJournalLinkProof;
    resolvedSourceScope: ResolvedJournalSourceScope;
    decoderEnvelope: FinancePostingDecoderEnvelope;
  }>
): Promise<VerifiedFinanceJournalCommitReceipt> {
  const transaction = canonicalTransaction(input.transaction);
  const occurredAt = databaseInstant(transaction.occurredAt);
  const postedAt = databaseInstant(transaction.postedAt);
  const expectedTransactionDigest = digestFinanceCanonicalValueV1(transaction);
  const proof = rehydrateFinanceJournalLinkProof(input.proof, input.decoderEnvelope);
  assertFinanceJournalLinkProofMatchesTransaction({ transaction, proof }, input.decoderEnvelope);
  const scope = normalizeScope(input.resolvedSourceScope);
  assertScopeAllowed(transaction, scope);
  for (const entry of transaction.entries) assertAccountCovered(entry.account, scope);
  await assertCorrectionSource(database, transaction, scope);

  const [sourceIdentity] = await database
    .insert(financeSourceIdentities)
    .values({
      sourceKind: transaction.sourceKey.kind,
      sourceId: transaction.sourceKey.sourceId,
      sourceOperationKey: transaction.sourceKey.operation,
      sourceScopeKind: scope.kind,
      providerAccountVersionId: scope.providerAccount?.versionId ?? null,
      providerAccountSeriesId: scope.providerAccount?.seriesId ?? null,
      providerAccountId: scope.providerAccount?.providerAccountId ?? null,
      providerIdentityVersion: scope.providerAccount?.identityVersion ?? null,
      bankCashPoolId: null,
      astrologerUserId: scope.astrologerUserId,
      refundId: scope.refundId,
      payoutRequestId: scope.payoutRequestId
    })
    .returning({ id: financeSourceIdentities.id });
  if (!sourceIdentity) fail("Finance source identity insert returned no row");

  await database.insert(financeJournalTransactions).values({
    id: transaction.id,
    sourceIdentityId: sourceIdentity.id,
    occurredAt,
    postedAt,
    reversesJournalTransactionId: transaction.reversesTransactionId,
    currency: "RUB"
  });

  const accountIds = new Map<string, string>();
  const journalEntryRows: { id: string; entryIndex: number }[] = [];
  for (let entryIndex = 0; entryIndex < transaction.entries.length; entryIndex += 1) {
    const entry = transaction.entries[entryIndex];
    if (!entry) fail();
    const accountKey = JSON.stringify(entry.account);
    let accountId = accountIds.get(accountKey);
    if (!accountId) {
      accountId = await resolveAccountId(database, entry.account, scope);
      accountIds.set(accountKey, accountId);
    }
    const [journalEntry] = await database
      .insert(financeJournalEntries)
      .values({
        journalTransactionId: transaction.id,
        occurredAt,
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
    if (!journalEntry) fail("Finance journal entry insert returned no row");
    journalEntryRows.push(journalEntry);
  }

  const snapshot = proof.operationSnapshotRef;
  const [proofRecord] = await database
    .insert(financeAllocationLinkProofs)
    .values({
      proofId: proof.proofId,
      version: proof.version,
      allocationAuthorityKind: proof.allocationAuthorityRef.kind,
      allocationAuthorityId: proof.allocationAuthorityRef.authorityId,
      allocationAuthorityVersion: proof.allocationAuthorityRef.version,
      allocationAuthorityDigest: proof.allocationAuthorityRef.canonicalDigest,
      sourceEvidenceKind: proof.sourceEvidenceRef.kind,
      sourceEvidenceId: proof.sourceEvidenceRef.evidenceId,
      sourceEvidenceDigest: proof.sourceEvidenceRef.canonicalDigest,
      journalTransactionId: transaction.id,
      journalSourceKind: transaction.sourceKey.kind,
      journalSourceId: transaction.sourceKey.sourceId,
      journalSourceOperationKey: transaction.sourceKey.operation,
      operationId: proof.operationId,
      operationSnapshotId: snapshot?.snapshotId ?? null,
      operationSnapshotOperationId: snapshot?.operationId ?? null,
      operationSnapshotPreviousWalletRevision: snapshot?.previousWalletRevision ?? null,
      operationSnapshotNextWalletRevision: snapshot?.nextWalletRevision ?? null,
      operationSnapshotPreviousLotStateDigest: snapshot?.previousLotStateDigest ?? null,
      operationSnapshotNextLotStateDigest: snapshot?.nextLotStateDigest ?? null,
      operationSnapshotHistoryRecordDigest: snapshot?.historyRecordDigest ?? null,
      operationSnapshotDigest: snapshot?.snapshotDigest ?? null,
      proofDigest: proof.proofDigest
    })
    .returning({ id: financeAllocationLinkProofs.id });
  if (!proofRecord) fail("Finance proof insert returned no row");

  for (let entryIndex = 0; entryIndex < proof.edges.length; entryIndex += 1) {
    const edge = proof.edges[entryIndex];
    const journalEntry = journalEntryRows[entryIndex];
    if (!edge || !journalEntry || journalEntry.entryIndex !== entryIndex) fail();
    const accountId = accountIds.get(JSON.stringify(edge.account));
    if (!accountId) fail("Finance proof edge account was not persisted");
    await database.insert(financeAllocationLinkProofEntries).values({
      proofRecordId: proofRecord.id,
      journalEntryId: journalEntry.id,
      entryIndex,
      accountId,
      side: edge.side,
      amountMinor: String(edge.amount.amountMinor),
      currency: "RUB",
      originalSaleId: edge.links.originalSaleId,
      componentId: edge.links.componentId,
      payableLotId: edge.links.payableLotId,
      payoutAllocationId: edge.links.payoutAllocationId,
      semanticEdgeId: edge.semanticEdgeId,
      lotAllocationId: edge.lotAllocationId
    });
  }

  const [sealed] = await database
    .update(financeJournalTransactions)
    .set({
      entryCount: transaction.entries.length,
      totalDebitMinor: transaction.totalDebitMinor,
      totalCreditMinor: transaction.totalCreditMinor,
      sealedAt: sql`statement_timestamp()`
    })
    .where(
      and(
        eq(financeJournalTransactions.id, transaction.id),
        isNull(financeJournalTransactions.sealedAt)
      )
    )
    .returning({
      sealedAt: financeJournalTransactions.sealedAt,
      canonicalDigest: financeJournalTransactions.canonicalDigest
    });
  if (
    !sealed?.sealedAt ||
    !sealed.canonicalDigest ||
    sealed.canonicalDigest !== expectedTransactionDigest
  ) {
    fail("Finance journal transaction did not seal exactly once");
  }

  const { receiptId, persistenceTransactionBoundaryRef } =
    await issueJournalPersistenceAuthority(database);
  const preimage = sql<string>`finance_journal_receipt_preimage(
    ${receiptId},
    ${sourceIdentity.id}::uuid,
    ${transaction.id},
    ${proofRecord.id}::uuid,
    ${proof.proofDigest},
    ${persistenceTransactionBoundaryRef}
  )`;
  const [receipt] = await database
    .insert(financePersistenceCommitReceipts)
    .values({
      receiptId,
      receiptKind: "sealed_journal_transaction",
      sourceIdentityId: sourceIdentity.id,
      journalTransactionId: transaction.id,
      proofRecordId: proofRecord.id,
      canonicalPreimage: preimage,
      canonicalDigest: sql`'sha256:' || encode(digest(${preimage}, 'sha256'), 'hex')`,
      persistenceTransactionBoundaryRef,
      issuedAt: sql`statement_timestamp()`
    })
    .returning({
      receiptId: financePersistenceCommitReceipts.receiptId,
      canonicalDigest: financePersistenceCommitReceipts.canonicalDigest,
      persistenceTransactionBoundaryRef:
        financePersistenceCommitReceipts.persistenceTransactionBoundaryRef,
      issuedAt: financePersistenceCommitReceipts.issuedAt
    });
  if (!receipt) fail("Finance persistence receipt insert returned no row");

  return mapDatabaseIssuedJournalCommitReceipt({
    receiptId: receipt.receiptId,
    receiptVersion: 1,
    canonicalDigest: receipt.canonicalDigest,
    journalTransactionId: transaction.id,
    journalTransactionDigest: sealed.canonicalDigest,
    journalLinkProofId: proof.proofId,
    journalLinkProofVersion: proof.version,
    journalLinkProofDigest: proof.proofDigest,
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef,
    issuedAt: receipt.issuedAt
  });
}

function canonicalTransaction(input: FinanceJournalTransaction): FinanceJournalTransaction {
  const transaction = createFinanceJournalTransaction({
    id: input.id,
    sourceKey: input.sourceKey,
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: input.reversesTransactionId,
    entries: input.entries
  });
  if (
    input.currency !== transaction.currency ||
    input.totalDebitMinor !== transaction.totalDebitMinor ||
    input.totalCreditMinor !== transaction.totalCreditMinor
  ) {
    fail();
  }
  return transaction;
}

async function resolveAccountId(
  database: JournalTransactionExecutor,
  account: FinanceLedgerAccountRef,
  scope: NormalizedScope
): Promise<string> {
  const chart = financeLedgerChart[account.code];
  const provider = "arcProviderAccountId" in account ? scope.providerAccount : null;
  const bankCashPoolId = "bankCashPoolId" in account ? account.bankCashPoolId : null;
  const astrologerUserId = "astrologerUserId" in account ? account.astrologerUserId : null;
  const refundId = "refundId" in account ? account.refundId : null;
  const payoutRequestId = "payoutRequestId" in account ? account.payoutRequestId : null;
  const values = {
    code: account.code,
    accountClass: chart.accountClass,
    normalSide: chart.normalSide,
    scopeKind: chart.scopeKind,
    providerAccountVersionId: provider?.versionId ?? null,
    providerAccountSeriesId: provider?.seriesId ?? null,
    providerAccountId: provider?.providerAccountId ?? null,
    providerIdentityVersion: provider?.identityVersion ?? null,
    bankCashPoolId,
    astrologerUserId,
    refundId,
    payoutRequestId,
    currency: "RUB"
  } as const;
  const [created] = await database
    .insert(financeAccounts)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: financeAccounts.id });
  if (created) return created.id;

  const matches = await database
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.code, account.code),
        eq(financeAccounts.currency, "RUB"),
        nullableEquals(financeAccounts.providerAccountVersionId, values.providerAccountVersionId),
        nullableEquals(financeAccounts.providerAccountSeriesId, values.providerAccountSeriesId),
        nullableEquals(financeAccounts.providerAccountId, values.providerAccountId),
        nullableEquals(financeAccounts.providerIdentityVersion, values.providerIdentityVersion),
        nullableEquals(financeAccounts.bankCashPoolId, values.bankCashPoolId),
        nullableEquals(financeAccounts.astrologerUserId, values.astrologerUserId),
        nullableEquals(financeAccounts.refundId, values.refundId),
        nullableEquals(financeAccounts.payoutRequestId, values.payoutRequestId)
      )
    )
    .limit(2);
  if (matches.length !== 1 || !matches[0]) fail("Finance account identity is ambiguous");
  return matches[0].id;
}

function nullableEquals(column: Parameters<typeof isNull>[0], value: unknown) {
  return value === null ? isNull(column) : eq(column, value as never);
}

function normalizeScope(scope: ResolvedJournalSourceScope): NormalizedScope {
  const kind = ownDataKind(scope);
  switch (kind) {
    case "internal": {
      assertExactOwnDataRecord(scope, ["kind"]);
      return freezeScope(kind, null, null, null, null);
    }
    case "provider_account": {
      assertExactOwnDataRecord(scope, ["kind", "providerAccount"]);
      const candidate = scope as Extract<ResolvedJournalSourceScope, { kind: typeof kind }>;
      return freezeScope(kind, providerIdentity(candidate.providerAccount), null, null, null);
    }
    case "astrologer": {
      assertExactOwnDataRecord(scope, ["kind", "astrologerUserId"]);
      const candidate = scope as Extract<ResolvedJournalSourceScope, { kind: typeof kind }>;
      return freezeScope(kind, null, uuid(candidate.astrologerUserId), null, null);
    }
    case "refund_and_payout": {
      assertExactOwnDataRecord(scope, ["kind", "refundId", "payoutRequestId"]);
      const candidate = scope as Extract<ResolvedJournalSourceScope, { kind: typeof kind }>;
      return freezeScope(
        kind,
        null,
        null,
        identifier(candidate.refundId),
        identifier(candidate.payoutRequestId)
      );
    }
    case "provider_account_and_astrologer": {
      assertExactOwnDataRecord(scope, ["kind", "providerAccount", "astrologerUserId"]);
      const candidate = scope as Extract<ResolvedJournalSourceScope, { kind: typeof kind }>;
      return freezeScope(
        kind,
        providerIdentity(candidate.providerAccount),
        uuid(candidate.astrologerUserId),
        null,
        null
      );
    }
    case "provider_account_astrologer_refund_and_payout": {
      assertExactOwnDataRecord(scope, [
        "kind",
        "providerAccount",
        "astrologerUserId",
        "refundId",
        "payoutRequestId"
      ]);
      const candidate = scope as Extract<ResolvedJournalSourceScope, { kind: typeof kind }>;
      return freezeScope(
        kind,
        providerIdentity(candidate.providerAccount),
        uuid(candidate.astrologerUserId),
        identifier(candidate.refundId),
        identifier(candidate.payoutRequestId)
      );
    }
    default:
      fail("Bank-cash journal posting requires Task 8 settlement evidence capability");
  }
}

function freezeScope(
  kind: NormalizedScope["kind"],
  providerAccount: ResolvedProviderAccountIdentity | null,
  astrologerUserId: string | null,
  refundId: string | null,
  payoutRequestId: string | null
): NormalizedScope {
  return Object.freeze({
    kind,
    providerAccount,
    bankCashPoolId: null,
    astrologerUserId,
    refundId,
    payoutRequestId
  });
}

function providerIdentity(value: ResolvedProviderAccountIdentity): ResolvedProviderAccountIdentity {
  assertExactOwnDataRecord(value, [
    "versionId",
    "seriesId",
    "providerAccountId",
    "identityVersion"
  ]);
  const versionId = uuid(value.versionId);
  const seriesId = identifier(value.seriesId);
  const providerAccountId = identifier(value.providerAccountId);
  if (!Number.isSafeInteger(value.identityVersion) || value.identityVersion < 1) {
    fail();
  }
  return Object.freeze({
    versionId,
    seriesId,
    providerAccountId,
    identityVersion: value.identityVersion
  });
}

function assertScopeAllowed(transaction: FinanceJournalTransaction, scope: NormalizedScope): void {
  const source = transaction.sourceKey;
  const allowed = (() => {
    if (source.kind === "platform_invoice" || source.kind === "provider_fee") {
      return ["provider_account"];
    }
    if (source.kind === "order" || source.kind === "chargeback") {
      return ["provider_account_and_astrologer"];
    }
    if (source.kind === "reserve") return ["astrologer"];
    if (source.kind === "payout") {
      return source.operation === "requested" || source.operation === "released"
        ? ["astrologer"]
        : [];
    }
    if (source.kind === "refund") {
      if (source.operation === "confirmed") return ["provider_account_and_astrologer"];
      if (source.operation === "approved" || source.operation === "failed") {
        return ["astrologer", "provider_account_and_astrologer"];
      }
      return ["provider_account_astrologer_refund_and_payout"];
    }
    if (source.kind === "correction") {
      return [
        "internal",
        "provider_account",
        "astrologer",
        "refund_and_payout",
        "provider_account_and_astrologer",
        "provider_account_astrologer_refund_and_payout"
      ];
    }
    return [];
  })();
  if (!allowed.includes(scope.kind)) {
    fail("This journal source requires a capability-specific persistence adapter");
  }
}

function assertAccountCovered(account: FinanceLedgerAccountRef, scope: NormalizedScope): void {
  if ("arcProviderAccountId" in account) {
    if (
      !scope.providerAccount ||
      scope.providerAccount.providerAccountId !== account.arcProviderAccountId
    ) {
      fail();
    }
  }
  if ("bankCashPoolId" in account) {
    fail("Bank-cash journal posting requires Task 8 settlement evidence capability");
  }
  if ("astrologerUserId" in account && scope.astrologerUserId !== account.astrologerUserId) {
    fail();
  }
  if (
    "refundId" in account &&
    (scope.refundId !== account.refundId || scope.payoutRequestId !== account.payoutRequestId)
  ) {
    fail();
  }
}

async function assertCorrectionSource(
  database: JournalTransactionExecutor,
  transaction: FinanceJournalTransaction,
  scope: NormalizedScope
): Promise<void> {
  if (transaction.sourceKey.kind !== "correction") return;
  const rows = await database
    .select({
      sealedAt: financeJournalTransactions.sealedAt,
      sourceScopeKind: financeSourceIdentities.sourceScopeKind,
      providerAccountVersionId: financeSourceIdentities.providerAccountVersionId,
      providerAccountSeriesId: financeSourceIdentities.providerAccountSeriesId,
      providerAccountId: financeSourceIdentities.providerAccountId,
      providerIdentityVersion: financeSourceIdentities.providerIdentityVersion,
      bankCashPoolId: financeSourceIdentities.bankCashPoolId,
      astrologerUserId: financeSourceIdentities.astrologerUserId,
      refundId: financeSourceIdentities.refundId,
      payoutRequestId: financeSourceIdentities.payoutRequestId
    })
    .from(financeJournalTransactions)
    .innerJoin(
      financeSourceIdentities,
      eq(financeSourceIdentities.id, financeJournalTransactions.sourceIdentityId)
    )
    .where(eq(financeJournalTransactions.id, transaction.sourceKey.sourceId))
    .limit(2);
  if (rows.length !== 1 || !rows[0]?.sealedAt) fail("Correction source is not one sealed original");
  if (transaction.sourceKey.operation === "reversal" && !scopeMatchesRow(scope, rows[0])) {
    fail("Correction reversal scope differs from the original journal scope");
  }
}

function scopeMatchesRow(
  scope: NormalizedScope,
  row: {
    sourceScopeKind: string;
    providerAccountVersionId: string | null;
    providerAccountSeriesId: string | null;
    providerAccountId: string | null;
    providerIdentityVersion: number | null;
    bankCashPoolId: string | null;
    astrologerUserId: string | null;
    refundId: string | null;
    payoutRequestId: string | null;
  }
): boolean {
  return (
    scope.kind === row.sourceScopeKind &&
    scope.providerAccount?.versionId === (row.providerAccountVersionId ?? undefined) &&
    scope.providerAccount?.seriesId === (row.providerAccountSeriesId ?? undefined) &&
    scope.providerAccount?.providerAccountId === (row.providerAccountId ?? undefined) &&
    scope.providerAccount?.identityVersion === (row.providerIdentityVersion ?? undefined) &&
    scope.bankCashPoolId === row.bankCashPoolId &&
    scope.astrologerUserId === row.astrologerUserId &&
    scope.refundId === row.refundId &&
    scope.payoutRequestId === row.payoutRequestId
  );
}

function identifier(value: string): string {
  if (!boundedIdentifier(value, 160)) fail();
  return value;
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail();
  }
  return value;
}

function boundedIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength
  );
}

function ownDataKind(value: unknown): string {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
    if (
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      typeof descriptor.value !== "string"
    ) {
      fail();
    }
    return descriptor.value;
  } catch (error) {
    if (error instanceof JournalTransactionWriterIntegrityError) throw error;
    fail();
  }
}

function assertExactOwnDataRecord(value: unknown, expectedKeys: readonly string[]): void {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
    ) {
      fail();
    }
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
    }
  } catch (error) {
    if (error instanceof JournalTransactionWriterIntegrityError) throw error;
    fail();
  }
}

function databaseInstant(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    fail("Finance journal instant exceeds the persistence timestamp precision");
  }
  const roundTripped = parsed
    .toISOString()
    .replace(/\.000Z$/, "Z")
    .replace(/(\.\d*?[1-9])0+Z$/, "$1Z");
  if (roundTripped !== value) {
    fail("Finance journal instant exceeds the persistence timestamp precision");
  }
  return parsed;
}

type DatabaseIssuedJournalCommitRow = Readonly<{
  receiptId: string;
  receiptVersion: number;
  canonicalDigest: string;
  journalTransactionId: string;
  journalTransactionDigest: string;
  journalLinkProofId: string;
  journalLinkProofVersion: number;
  journalLinkProofDigest: string;
  persistenceTransactionBoundaryRef: string;
  issuedAt: Date;
}>;

export function mapDatabaseIssuedJournalCommitReceipt(
  row: DatabaseIssuedJournalCommitRow
): VerifiedFinanceJournalCommitReceipt {
  const digest = (value: unknown): `sha256:${string}` => {
    if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail();
    return value as `sha256:${string}`;
  };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      row.receiptId
    ) ||
    row.receiptVersion !== 1 ||
    !boundedIdentifier(row.journalTransactionId, 200) ||
    !boundedIdentifier(row.journalLinkProofId, 200) ||
    row.journalLinkProofVersion !== 1 ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !(row.issuedAt instanceof Date) ||
    !Number.isFinite(row.issuedAt.getTime())
  ) {
    fail();
  }
  const canonicalDigest = digest(row.canonicalDigest);
  const receipt = {
    ref: Object.freeze({
      kind: "verified_finance_journal_commit_receipt" as const,
      receiptId: row.receiptId,
      version: 1 as const,
      canonicalDigest
    }),
    kind: "verified_finance_journal_commit_receipt" as const,
    journalTransactionId: row.journalTransactionId,
    journalTransactionDigest: digest(row.journalTransactionDigest),
    journalLinkProofId: row.journalLinkProofId,
    journalLinkProofVersion: 1 as const,
    journalLinkProofDigest: digest(row.journalLinkProofDigest),
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
    issuedAt: row.issuedAt.toISOString()
  };
  return Object.freeze(receipt) as VerifiedFinanceJournalCommitReceipt;
}

export async function issueJournalPersistenceAuthority(
  transaction: Pick<FinanceTransaction, "execute">
): Promise<Readonly<{ receiptId: string; persistenceTransactionBoundaryRef: string }>> {
  const result = await transaction.execute<{
    receiptId: string;
    persistenceTransactionBoundaryRef: string;
  }>(sql`select
    gen_random_uuid()::text as "receiptId",
    'postgres-xid:' || txid_current()::text as "persistenceTransactionBoundaryRef"`);
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    !row ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      row.receiptId
    ) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef)
  ) {
    fail();
  }
  return Object.freeze({ ...row });
}

function fail(message?: string): never {
  throw new JournalTransactionWriterIntegrityError(message);
}
