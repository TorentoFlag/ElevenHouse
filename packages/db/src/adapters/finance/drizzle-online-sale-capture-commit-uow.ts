import { randomUUID } from "node:crypto";

import {
  createOnlineSaleCapturePersistenceCommand,
  digestFinanceCanonicalValueV1,
  financeLedgerChart,
  type FinanceLedgerAccountRef,
  type OnlineSaleCapturePersistenceCommand,
  type OnlineSaleCaptureReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeOrderEconomicsSnapshots,
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "../../schema/finance/capture-authorities.schema";
import { financeCaptureFacts } from "../../schema/finance/economic-payments.schema";
import {
  financeAccounts,
  financeJournalEntries,
  financeJournalTransactions,
  financeSourceIdentities
} from "../../schema/finance/ledger.schema";
import {
  financeOnlineSaleCaptureAuthorityBindings,
  financeOnlineSaleCaptureJournalProofEntries,
  financeOnlineSaleCaptureJournalProofs,
  financeOnlineSaleCaptureReceipts,
  financeOnlineSaleCaptureRootLots,
  financeOnlineWalletCommitments,
  financeOnlineWalletHeads
} from "../../schema/finance/online-sale-capture.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";

export type OnlineSaleCaptureCommitPersistenceReason =
  | "invalid_command"
  | "wallet_identity_conflict"
  | "wallet_revision_conflict"
  | "capture_replay_conflict"
  | "capture_authority_mismatch"
  | "journal_source_scope_mismatch"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class OnlineSaleCaptureCommitPersistenceError extends Error {
  readonly code = "online_sale_capture_commit_persistence_error";

  constructor(readonly reason: OnlineSaleCaptureCommitPersistenceReason) {
    super("Online sale capture v2 could not be committed atomically");
    this.name = "OnlineSaleCaptureCommitPersistenceError";
  }
}

/** Public, database-issued replay-safe acknowledgement for the distinct v2 graph. */
export type OnlineSaleCaptureCommitReceipt = Readonly<{
  kind: "online_sale_capture_commit_receipt";
  effect: "applied_once" | "replayed";
  receiptId: string;
  walletId: string;
  walletRevision: string;
  journalTransactionId: string;
  journalTransactionDigest: string;
  commitmentId: string;
  commitmentDigest: string;
}>;

/**
 * Deliberately does not call `writeSealedJournalTransaction`: that writer emits v1
 * allocation-link and persistence-receipt evidence. The small journal writer below only
 * persists the generic double-entry graph and seals it; every binding after that is v2-only.
 */
export function createDrizzleOnlineSaleCaptureCommitUnitOfWork(
  input: Readonly<{
    database: ElevenHouseDatabase;
  }>
) {
  return Object.freeze({
    async commitOnlineSaleCapture(command: OnlineSaleCapturePersistenceCommand) {
      let admitted: OnlineSaleCapturePersistenceCommand;
      try {
        admitted = createOnlineSaleCapturePersistenceCommand(command);
      } catch {
        throw new OnlineSaleCaptureCommitPersistenceError("invalid_command");
      }
      try {
        return await input.database.transaction((transaction) =>
          commitOnlineSaleCaptureInTransaction(transaction, admitted)
        );
      } catch (error) {
        if (error instanceof OnlineSaleCaptureCommitPersistenceError) throw error;
        const classified = classifyOnlineSaleCapturePostgresFailure(error);
        if (classified) throw new OnlineSaleCaptureCommitPersistenceError(classified);
        throw error;
      }
    }
  });
}

/** Exported deterministic classification seam; the transaction code remains the only writer. */
export function classifyOnlineSaleCapturePostgresFailure(
  error: unknown
): OnlineSaleCaptureCommitPersistenceReason | null {
  const code = postgresCode(error);
  if (code === "40001" || code === "40P01") return "retryable_concurrency_conflict";
  if (code === "23505") return "capture_replay_conflict";
  if (code === "23503" || code === "23514" || code === "55000") {
    return "persistence_write_incomplete";
  }
  return null;
}

/**
 * Caller-owned transaction seam for the canonical webhook composite UoW. It neither starts a
 * transaction nor invokes a v1 writer. The advisory lock is scoped to the online wallet UUID,
 * so two sales for one astrologer serialize while unrelated wallets continue independently.
 */
export async function commitOnlineSaleCaptureInTransaction(
  transaction: FinanceTransaction,
  command: OnlineSaleCapturePersistenceCommand
): Promise<OnlineSaleCaptureCommitReceipt> {
  let admitted: OnlineSaleCapturePersistenceCommand;
  try {
    admitted = createOnlineSaleCapturePersistenceCommand(command);
  } catch {
    throw new OnlineSaleCaptureCommitPersistenceError("invalid_command");
  }
  const { receipt } = admitted;
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${receipt.walletId}, 0))`
  );

  const replay = await readReplay(transaction, admitted);
  if (replay) return replay;

  const head = await lockExactOnlineWalletHead(transaction, admitted);
  assertHeadMatchesReceipt(head, receipt);
  const authority = await resolveAuthority(transaction, admitted);
  const genericJournal = await writeV2GenericJournal(
    transaction,
    admitted,
    authority.providerVersionId
  );

  const proofId = randomUUID();
  const commitmentId = randomUUID();
  const boundaryRef = await issueBoundaryRef(transaction);
  const proofPreimage = canonical({
    kind: "online_sale_capture_journal_proof",
    version: 2,
    receiptId: receipt.receiptId,
    journalTransactionId: admitted.journal.id,
    journalTransactionDigest: genericJournal.digest,
    entryCount: genericJournal.entries.length,
    persistenceTransactionBoundaryRef: boundaryRef
  });
  const proofDigest = digestFinanceCanonicalValueV1(proofPreimage);
  const commitmentPreimage = canonical({
    kind: "online_wallet_commitment",
    version: 2,
    receiptId: receipt.receiptId,
    walletId: receipt.walletId,
    walletRevision: receipt.nextWalletRevision,
    previousCommitmentDigest: receipt.previousCommitmentDigest,
    journalProofId: proofId,
    journalProofDigest: proofDigest
  });
  const commitmentDigest = digestFinanceCanonicalValueV1(commitmentPreimage);

  // A receipt has an FK to its wallet. For revision zero the head is installed with the
  // already-calculated initial commitment: the head trigger correctly disallows a same-revision
  // post-insert patch, so this is the only atomic initial shape.
  if (!head) {
    const created = await transaction
      .insert(financeOnlineWalletHeads)
      .values({
        id: receipt.walletId,
        astrologerUserId: admitted.astrologerUserId,
        currency: "RUB",
        revision: receipt.nextWalletRevision,
        pendingMinor: String(receipt.rootLot.amount.amountMinor),
        availableMinor: "0",
        reservedMinor: "0",
        payoutPendingMinor: "0",
        refundPendingMinor: "0",
        recoveryReceivableMinor: "0",
        lastCommitmentId: commitmentId,
        lastCommitmentDigest: commitmentDigest
      })
      .returning({ id: financeOnlineWalletHeads.id });
    if (created.length !== 1 || created[0]?.id !== receipt.walletId) incomplete();
  }

  await transaction.insert(financeOnlineSaleCaptureReceipts).values({
    receiptId: receipt.receiptId,
    schemaVersion: 2,
    operationId: receipt.operationId,
    walletId: receipt.walletId,
    astrologerUserId: admitted.astrologerUserId,
    currency: "RUB",
    expectedWalletRevision: receipt.expectedWalletRevision,
    nextWalletRevision: receipt.nextWalletRevision,
    previousCommitmentId: head?.lastCommitmentId ?? null,
    previousCommitmentDigest: receipt.previousCommitmentDigest,
    orderId: receipt.orderEconomics.orderId,
    rootLotId: receipt.rootLot.lotId,
    occurredAt: instant(receipt.occurredAt),
    canonicalDigest: receipt.canonicalDigest
  });

  await transaction.insert(financeOnlineSaleCaptureAuthorityBindings).values({
    receiptId: receipt.receiptId,
    orderId: receipt.orderEconomics.orderId,
    captureFactId: authority.captureFactId,
    captureIntentId: authority.captureIntentId,
    captureSessionId: authority.captureSessionId,
    providerAccountSeriesId: authority.seriesId,
    providerAccountId: authority.providerAccountId,
    providerIdentityVersion: authority.identityVersion,
    providerPaymentId: authority.providerPaymentId,
    captureAmountMinor: authority.captureAmountMinor,
    captureCurrency: "RUB",
    captureEvidenceAuthorityKind: authority.evidenceAuthorityKind,
    captureEvidenceAuthorityId: authority.evidenceAuthorityId,
    captureEvidenceArtifactId: authority.evidenceArtifactId,
    captureEvidenceArtifactDigest: authority.evidenceArtifactDigest,
    economicsSnapshotDigest: authority.economicsDigest,
    riskPolicyId: receipt.riskPolicy.id,
    riskPolicyVersion: String(receipt.riskPolicy.policyVersion),
    riskPolicyDigest: authority.riskDigest,
    fulfillmentDecisionId: receipt.fulfillment.registryKey,
    fulfillmentDecisionVersion: String(receipt.fulfillment.registryRevision),
    fulfillmentDecisionDigest: authority.fulfillmentDigest,
    canonicalDigest: digestFinanceCanonicalValueV1(
      canonical({
        kind: "online_sale_capture_authority",
        receiptId: receipt.receiptId,
        orderId: receipt.orderEconomics.orderId,
        authority
      })
    )
  });

  await transaction.insert(financeOnlineSaleCaptureRootLots).values({
    lotId: receipt.rootLot.lotId,
    receiptId: receipt.receiptId,
    walletId: receipt.walletId,
    astrologerUserId: admitted.astrologerUserId,
    currency: "RUB",
    amountMinor: String(receipt.rootLot.amount.amountMinor),
    bucket: "pending",
    status: "active",
    capturedAt: instant(receipt.rootLot.capturedAt),
    createdAt: instant(receipt.rootLot.createdAt),
    createdByOperationId: receipt.operationId,
    authorityReceiptId: receipt.receiptId
  });

  const [proof] = await transaction
    .insert(financeOnlineSaleCaptureJournalProofs)
    .values({
      proofId,
      receiptId: receipt.receiptId,
      version: 2,
      journalTransactionId: admitted.journal.id,
      journalTransactionDigest: genericJournal.digest,
      proofCanonicalPreimage: JSON.stringify(proofPreimage),
      proofDigest,
      persistenceTransactionBoundaryRef: boundaryRef
    })
    .returning({ proofId: financeOnlineSaleCaptureJournalProofs.proofId });
  if (!proof || proof.proofId !== proofId) incomplete();
  await transaction.insert(financeOnlineSaleCaptureJournalProofEntries).values(
    genericJournal.entries.map((entry) => ({
      proofId,
      journalEntryId: entry.id,
      entryIndex: entry.entryIndex,
      canonicalDigest: digestFinanceCanonicalValueV1(
        canonical({
          kind: "online_sale_capture_journal_proof_entry",
          journalEntryId: entry.id,
          entryIndex: entry.entryIndex,
          journalTransactionId: admitted.journal.id
        })
      )
    }))
  );
  await transaction.insert(financeOnlineWalletCommitments).values({
    id: commitmentId,
    receiptId: receipt.receiptId,
    walletId: receipt.walletId,
    walletRevision: receipt.nextWalletRevision,
    previousCommitmentId: head?.lastCommitmentId ?? null,
    previousCommitmentDigest: receipt.previousCommitmentDigest,
    journalProofId: proofId,
    commitmentCanonicalPreimage: JSON.stringify(commitmentPreimage),
    commitmentDigest
  });

  if (head) {
    const updated = await transaction
      .update(financeOnlineWalletHeads)
      .set({
        revision: receipt.nextWalletRevision,
        pendingMinor: (
          BigInt(head.pendingMinor) + BigInt(receipt.rootLot.amount.amountMinor)
        ).toString(),
        lastCommitmentId: commitmentId,
        lastCommitmentDigest: commitmentDigest
      })
      .where(
        and(
          eq(financeOnlineWalletHeads.id, receipt.walletId),
          eq(financeOnlineWalletHeads.revision, receipt.expectedWalletRevision),
          eq(financeOnlineWalletHeads.lastCommitmentDigest, receipt.previousCommitmentDigest!)
        )
      )
      .returning({ id: financeOnlineWalletHeads.id });
    if (updated.length !== 1 || updated[0]?.id !== receipt.walletId)
      conflict("wallet_revision_conflict");
  }
  return Object.freeze({
    kind: "online_sale_capture_commit_receipt" as const,
    effect: "applied_once" as const,
    receiptId: receipt.receiptId,
    walletId: receipt.walletId,
    walletRevision: receipt.nextWalletRevision,
    journalTransactionId: admitted.journal.id,
    journalTransactionDigest: genericJournal.digest,
    commitmentId,
    commitmentDigest
  });
}

type OnlineHead = {
  id: string;
  astrologerUserId: string;
  currency: string;
  revision: string;
  pendingMinor: string;
  lastCommitmentId: string | null;
  lastCommitmentDigest: string | null;
};

async function lockExactOnlineWalletHead(
  transaction: FinanceTransaction,
  command: OnlineSaleCapturePersistenceCommand
): Promise<OnlineHead | null> {
  const rows = await transaction
    .select({
      id: financeOnlineWalletHeads.id,
      astrologerUserId: financeOnlineWalletHeads.astrologerUserId,
      currency: financeOnlineWalletHeads.currency,
      revision: financeOnlineWalletHeads.revision,
      pendingMinor: financeOnlineWalletHeads.pendingMinor,
      lastCommitmentId: financeOnlineWalletHeads.lastCommitmentId,
      lastCommitmentDigest: financeOnlineWalletHeads.lastCommitmentDigest
    })
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, command.receipt.walletId))
    .limit(2)
    .for("update");
  if (rows.length > 1) conflict("wallet_identity_conflict");
  const head = rows[0] ?? null;
  if (head && (head.astrologerUserId !== command.astrologerUserId || head.currency !== "RUB")) {
    conflict("wallet_identity_conflict");
  }
  return head;
}

function assertHeadMatchesReceipt(
  head: OnlineHead | null,
  receipt: OnlineSaleCaptureReceipt
): void {
  if (!head) {
    if (receipt.expectedWalletRevision !== "0" || receipt.previousCommitmentDigest !== null) {
      conflict("wallet_revision_conflict");
    }
    return;
  }
  if (
    head.revision !== receipt.expectedWalletRevision ||
    head.lastCommitmentDigest !== receipt.previousCommitmentDigest ||
    !head.lastCommitmentId
  ) {
    conflict("wallet_revision_conflict");
  }
}

type ResolvedAuthority = {
  captureFactId: string;
  captureIntentId: string;
  captureSessionId: string;
  seriesId: string;
  providerAccountId: string;
  identityVersion: number;
  providerVersionId: string;
  providerPaymentId: string;
  captureAmountMinor: string;
  evidenceAuthorityKind: string;
  evidenceAuthorityId: string;
  evidenceArtifactId: string;
  evidenceArtifactDigest: string;
  economicsDigest: string;
  riskDigest: string;
  fulfillmentDigest: string;
};

async function resolveAuthority(
  transaction: FinanceTransaction,
  command: OnlineSaleCapturePersistenceCommand
): Promise<ResolvedAuthority> {
  const { receipt } = command;
  const [capture] = await transaction
    .select()
    .from(financeCaptureFacts)
    .where(eq(financeCaptureFacts.id, receipt.captureAuthority.canonicalEvidenceId))
    .limit(2)
    .for("share");
  const provider = receipt.rootLot.captureSource.paymentIntent.providerAccount;
  if (
    !capture ||
    capture.economicPaymentIntentId !== receipt.captureAuthority.intentId ||
    capture.providerAccountId !== provider.providerAccountId ||
    capture.seriesId !== provider.seriesId ||
    capture.providerIdentityVersion !== provider.identityVersion ||
    capture.providerPaymentId !== receipt.captureAuthority.providerPaymentId ||
    capture.amountMinor !== String(receipt.orderEconomics.gross.amountMinor) ||
    receipt.rootLot.amount.amountMinor !== receipt.orderEconomics.payable.amountMinor
  ) {
    conflict("capture_authority_mismatch");
  }
  const [providerRow] = await transaction
    .select({ id: financeProviderAccounts.id })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, capture.seriesId),
        eq(financeProviderAccounts.providerAccountId, capture.providerAccountId),
        eq(financeProviderAccounts.identityVersion, capture.providerIdentityVersion)
      )
    )
    .limit(2)
    .for("share");
  const [economics] = await transaction
    .select({
      astrologerUserId: financeOrderEconomicsSnapshots.astrologerUserId,
      grossAmountMinor: financeOrderEconomicsSnapshots.grossAmountMinor,
      commissionAmountMinor: financeOrderEconomicsSnapshots.commissionAmountMinor,
      payableAmountMinor: financeOrderEconomicsSnapshots.payableAmountMinor,
      commissionBps: financeOrderEconomicsSnapshots.commissionBps,
      canonicalDigest: financeOrderEconomicsSnapshots.canonicalDigest
    })
    .from(financeOrderEconomicsSnapshots)
    .where(eq(financeOrderEconomicsSnapshots.orderId, receipt.orderEconomics.orderId))
    .limit(2)
    .for("share");
  const [risk] = await transaction
    .select({
      effectiveRiskTier: financeRiskPolicyVersions.effectiveRiskTier,
      holdAnchor: financeRiskPolicyVersions.holdAnchor,
      holdDurationHours: financeRiskPolicyVersions.holdDurationHours,
      reserveBps: financeRiskPolicyVersions.reserveBps,
      reserveReleaseDelayDays: financeRiskPolicyVersions.reserveReleaseDelayDays,
      providerSettlementRequired: financeRiskPolicyVersions.providerSettlementRequired,
      payoutMinimumAmountMinor: financeRiskPolicyVersions.payoutMinimumAmountMinor,
      exceptionAuthorityId: financeRiskPolicyVersions.exceptionAuthorityId,
      exceptionAuthorityVersion: financeRiskPolicyVersions.exceptionAuthorityVersion,
      effectiveAt: financeRiskPolicyVersions.effectiveAt,
      canonicalDigest: financeRiskPolicyVersions.canonicalDigest
    })
    .from(financeRiskPolicyVersions)
    .where(
      and(
        eq(financeRiskPolicyVersions.policyId, receipt.riskPolicy.id),
        eq(financeRiskPolicyVersions.policyVersion, String(receipt.riskPolicy.policyVersion))
      )
    )
    .limit(2)
    .for("share");
  const [fulfillment] = await transaction
    .select({
      holdAnchor: financePaidProductFulfillmentDecisions.holdAnchor,
      terminalEvidenceOwner: financePaidProductFulfillmentDecisions.terminalEvidenceOwner,
      terminalEvidenceStatus: financePaidProductFulfillmentDecisions.terminalEvidenceStatus,
      terminalEvidenceContractVersion:
        financePaidProductFulfillmentDecisions.terminalEvidenceContractVersion,
      cancellationAllocatorOwner: financePaidProductFulfillmentDecisions.cancellationAllocatorOwner,
      cancellationAllocatorPort: financePaidProductFulfillmentDecisions.cancellationAllocatorPort,
      cancellationAllocatorPolicyVersion:
        financePaidProductFulfillmentDecisions.cancellationAllocatorPolicyVersion,
      canonicalDigest: financePaidProductFulfillmentDecisions.canonicalDigest
    })
    .from(financePaidProductFulfillmentDecisions)
    .where(
      and(
        eq(financePaidProductFulfillmentDecisions.registryKey, receipt.fulfillment.registryKey),
        eq(
          financePaidProductFulfillmentDecisions.registryRevision,
          String(receipt.fulfillment.registryRevision)
        )
      )
    )
    .limit(2)
    .for("share");
  if (
    !providerRow ||
    !economics ||
    !risk ||
    !fulfillment ||
    economics.astrologerUserId !== command.astrologerUserId ||
    economics.grossAmountMinor !== String(receipt.orderEconomics.gross.amountMinor) ||
    economics.commissionAmountMinor !== String(receipt.orderEconomics.commission.amountMinor) ||
    economics.payableAmountMinor !== String(receipt.orderEconomics.payable.amountMinor) ||
    economics.commissionBps !== receipt.orderEconomics.commissionBps ||
    risk.effectiveRiskTier !== receipt.riskPolicy.effectiveRiskTier ||
    risk.holdAnchor !== receipt.riskPolicy.holdAnchor ||
    risk.holdDurationHours !== receipt.riskPolicy.holdDurationHours ||
    risk.reserveBps !== receipt.riskPolicy.reserveBps ||
    risk.reserveReleaseDelayDays !== receipt.riskPolicy.reserveReleaseDelayDays ||
    risk.providerSettlementRequired !== receipt.riskPolicy.providerSettlementRequired ||
    risk.payoutMinimumAmountMinor !== String(receipt.riskPolicy.payoutMinimum.amountMinor) ||
    risk.exceptionAuthorityId !== (receipt.riskPolicy.exceptionAuthority?.id ?? null) ||
    risk.exceptionAuthorityVersion !==
      (receipt.riskPolicy.exceptionAuthority
        ? String(receipt.riskPolicy.exceptionAuthority.version)
        : null) ||
    risk.effectiveAt !== receipt.riskPolicy.effectiveAt ||
    fulfillment.holdAnchor !== receipt.fulfillment.holdAnchor ||
    fulfillment.terminalEvidenceOwner !== receipt.fulfillment.terminalEvidence.owner ||
    fulfillment.terminalEvidenceStatus !== receipt.fulfillment.terminalEvidence.status ||
    fulfillment.terminalEvidenceContractVersion !==
      String(receipt.fulfillment.terminalEvidence.contractVersion) ||
    fulfillment.cancellationAllocatorOwner !== receipt.fulfillment.cancellationAllocator.owner ||
    fulfillment.cancellationAllocatorPort !== receipt.fulfillment.cancellationAllocator.port ||
    fulfillment.cancellationAllocatorPolicyVersion !==
      String(receipt.fulfillment.cancellationAllocator.policyVersion)
  ) {
    conflict("capture_authority_mismatch");
  }
  return {
    captureFactId: capture.id,
    captureIntentId: capture.economicPaymentIntentId,
    captureSessionId: capture.economicPaymentSessionId,
    seriesId: capture.seriesId,
    providerAccountId: capture.providerAccountId,
    identityVersion: capture.providerIdentityVersion,
    providerVersionId: providerRow.id,
    providerPaymentId: capture.providerPaymentId,
    captureAmountMinor: capture.amountMinor,
    evidenceAuthorityKind: capture.evidenceAuthorityKind,
    evidenceAuthorityId: capture.evidenceAuthorityId,
    evidenceArtifactId: capture.evidenceArtifactId,
    evidenceArtifactDigest: capture.evidenceArtifactDigest,
    economicsDigest: economics.canonicalDigest,
    riskDigest: risk.canonicalDigest,
    fulfillmentDigest: fulfillment.canonicalDigest
  };
}

async function writeV2GenericJournal(
  transaction: FinanceTransaction,
  command: OnlineSaleCapturePersistenceCommand,
  providerVersionId: string
): Promise<{ digest: string; entries: readonly { id: string; entryIndex: number }[] }> {
  const journal = command.journal;
  const expectedDigest = digestFinanceCanonicalValueV1(journal);
  const [source] = await transaction
    .insert(financeSourceIdentities)
    .values({
      sourceKind: journal.sourceKey.kind,
      sourceId: journal.sourceKey.sourceId,
      sourceOperationKey: journal.sourceKey.operation,
      sourceScopeKind: "provider_account_and_astrologer",
      providerAccountVersionId: providerVersionId,
      providerAccountSeriesId:
        command.receipt.rootLot.captureSource.paymentIntent.providerAccount.seriesId,
      providerAccountId: command.receipt.rootLot.captureSource.providerAccountId,
      providerIdentityVersion:
        command.receipt.rootLot.captureSource.paymentIntent.providerAccount.identityVersion,
      bankCashPoolId: null,
      astrologerUserId: command.astrologerUserId,
      refundId: null,
      payoutRequestId: null
    })
    .returning({ id: financeSourceIdentities.id });
  if (!source) incomplete();
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
    assertV2AccountScope(entry.account, command);
    const key = JSON.stringify(entry.account);
    let accountId = accounts.get(key);
    if (!accountId) {
      accountId = await resolveAccount(transaction, entry.account, providerVersionId, command);
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
    if (!row) incomplete();
    entries.push(row);
  }
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
  if (!sealed?.canonicalDigest || sealed.canonicalDigest !== expectedDigest) incomplete();
  return { digest: sealed.canonicalDigest, entries };
}

function assertV2AccountScope(
  account: FinanceLedgerAccountRef,
  command: OnlineSaleCapturePersistenceCommand
): void {
  if ("bankCashPoolId" in account || "refundId" in account)
    conflict("journal_source_scope_mismatch");
  if ("astrologerUserId" in account && account.astrologerUserId !== command.astrologerUserId) {
    conflict("journal_source_scope_mismatch");
  }
  if (
    "arcProviderAccountId" in account &&
    account.arcProviderAccountId !== command.receipt.captureAuthority.providerAccountId
  ) {
    conflict("journal_source_scope_mismatch");
  }
}

async function resolveAccount(
  transaction: FinanceTransaction,
  account: FinanceLedgerAccountRef,
  providerVersionId: string,
  command: OnlineSaleCapturePersistenceCommand
): Promise<string> {
  const chart = financeLedgerChart[account.code];
  const providerAccount = "arcProviderAccountId" in account ? account.arcProviderAccountId : null;
  const astrologerUserId = "astrologerUserId" in account ? account.astrologerUserId : null;
  const values = {
    code: account.code,
    accountClass: chart.accountClass,
    normalSide: chart.normalSide,
    scopeKind: chart.scopeKind,
    providerAccountVersionId: providerAccount ? providerVersionId : null,
    providerAccountSeriesId: providerAccount
      ? command.receipt.rootLot.captureSource.paymentIntent.providerAccount.seriesId
      : null,
    providerAccountId: providerAccount,
    providerIdentityVersion: providerAccount
      ? command.receipt.rootLot.captureSource.paymentIntent.providerAccount.identityVersion
      : null,
    bankCashPoolId: null,
    astrologerUserId,
    refundId: null,
    payoutRequestId: null,
    currency: "RUB" as const
  };
  // The provider identity columns are a composite FK; use the identity embedded in the account
  // scope only through its resolved version row. The account's remaining identity is populated
  // below from the canonical source, avoiding a mutable provider lookup.
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
        providerAccount
          ? eq(financeAccounts.providerAccountVersionId, providerVersionId)
          : isNull(financeAccounts.providerAccountVersionId),
        astrologerUserId
          ? eq(financeAccounts.astrologerUserId, astrologerUserId)
          : isNull(financeAccounts.astrologerUserId)
      )
    )
    .limit(2);
  if (rows.length !== 1 || !rows[0]) incomplete();
  return rows[0].id;
}

async function readReplay(
  transaction: FinanceTransaction,
  command: OnlineSaleCapturePersistenceCommand
): Promise<OnlineSaleCaptureCommitReceipt | null> {
  const [row] = await transaction
    .select({
      receiptId: financeOnlineSaleCaptureReceipts.receiptId,
      walletId: financeOnlineSaleCaptureReceipts.walletId,
      walletRevision: financeOnlineSaleCaptureReceipts.nextWalletRevision,
      astrologerUserId: financeOnlineSaleCaptureReceipts.astrologerUserId,
      rootLotId: financeOnlineSaleCaptureReceipts.rootLotId,
      digest: financeOnlineSaleCaptureReceipts.canonicalDigest,
      commitmentId: financeOnlineWalletCommitments.id,
      commitmentDigest: financeOnlineWalletCommitments.commitmentDigest,
      captureFactId: financeOnlineSaleCaptureAuthorityBindings.captureFactId,
      rootLotRecordId: financeOnlineSaleCaptureRootLots.lotId,
      journalTransactionId: financeOnlineSaleCaptureJournalProofs.journalTransactionId,
      journalTransactionDigest: financeOnlineSaleCaptureJournalProofs.journalTransactionDigest
    })
    .from(financeOnlineSaleCaptureReceipts)
    .innerJoin(
      financeOnlineWalletCommitments,
      eq(financeOnlineWalletCommitments.receiptId, financeOnlineSaleCaptureReceipts.receiptId)
    )
    .innerJoin(
      financeOnlineSaleCaptureJournalProofs,
      eq(
        financeOnlineSaleCaptureJournalProofs.receiptId,
        financeOnlineSaleCaptureReceipts.receiptId
      )
    )
    .innerJoin(
      financeOnlineSaleCaptureAuthorityBindings,
      eq(
        financeOnlineSaleCaptureAuthorityBindings.receiptId,
        financeOnlineSaleCaptureReceipts.receiptId
      )
    )
    .innerJoin(
      financeOnlineSaleCaptureRootLots,
      eq(financeOnlineSaleCaptureRootLots.receiptId, financeOnlineSaleCaptureReceipts.receiptId)
    )
    .where(eq(financeOnlineSaleCaptureReceipts.receiptId, command.receipt.receiptId))
    .limit(2)
    .for("share");
  if (!row) return null;
  if (
    row.digest !== command.receipt.canonicalDigest ||
    row.walletId !== command.receipt.walletId ||
    row.walletRevision !== command.receipt.nextWalletRevision ||
    row.astrologerUserId !== command.astrologerUserId ||
    row.rootLotId !== command.receipt.rootLot.lotId ||
    row.rootLotRecordId !== command.receipt.rootLot.lotId ||
    row.captureFactId !== command.receipt.captureAuthority.canonicalEvidenceId ||
    row.journalTransactionId !== command.journal.id ||
    row.journalTransactionDigest !== digestFinanceCanonicalValueV1(command.journal)
  ) {
    conflict("capture_replay_conflict");
  }
  return Object.freeze({
    kind: "online_sale_capture_commit_receipt" as const,
    effect: "replayed" as const,
    receiptId: row.receiptId,
    walletId: row.walletId,
    walletRevision: row.walletRevision,
    journalTransactionId: row.journalTransactionId,
    journalTransactionDigest: row.journalTransactionDigest,
    commitmentId: row.commitmentId,
    commitmentDigest: row.commitmentDigest
  });
}

async function issueBoundaryRef(transaction: FinanceTransaction): Promise<string> {
  const result = await transaction.execute<{ boundary: string }>(
    sql`select 'postgres-xid:' || txid_current()::text as boundary`
  );
  const boundary = result.rows[0]?.boundary;
  if (!boundary || !/^postgres-xid:[0-9]+$/.test(boundary)) incomplete();
  return boundary;
}

function canonical(value: Record<string, unknown>): Record<string, unknown> {
  return Object.freeze(value);
}

function instant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) conflict("invalid_command");
  return date;
}

function conflict(reason: OnlineSaleCaptureCommitPersistenceReason): never {
  throw new OnlineSaleCaptureCommitPersistenceError(reason);
}

function incomplete(): never {
  throw new OnlineSaleCaptureCommitPersistenceError("persistence_write_incomplete");
}

function postgresCode(error: unknown): string | null {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}
