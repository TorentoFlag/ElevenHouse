import { randomUUID } from "node:crypto";

import {
  createOnlineWalletRefundApprovalJournal,
  createOnlineWalletRefundApprovalPlan,
  deriveOnlineWalletRefundProviderDispatchAuthorization,
  digestFinanceCanonicalValueV1,
  type ApproveOnlineWalletRefundCommand,
  type OnlineWalletRefundApprovalCommitReceipt,
  type OnlineWalletRefundApprovalUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeRefundCandidateReviews, financeRefundCandidates } from "../../schema/finance/refund-candidates.schema";
import { financeOnlineSaleCaptureRootLots, financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletMutations
} from "../../schema/finance/online-wallet-mutations.schema";
import {
  financeOnlineWalletRefundCaseAllocations,
  financeOnlineWalletRefundCases,
  financeOnlineWalletRefundCaseTransitions
} from "../../schema/finance/online-wallet-refund-cases.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletProviderAstrologerJournal } from "./drizzle-online-wallet-journal-writer";
import { persistProviderOperationBeforeIoInTransaction } from "./drizzle-provider-operation-intent-creation-uow";
import { issuePersistenceTransactionBoundaryRef } from "./drizzle-sealed-wallet-journal-commit-uow";

export class OnlineWalletRefundApprovalPersistenceError extends Error {
  readonly code = "online_wallet_refund_approval_persistence_error";
  constructor(readonly reason: "invalid_command" | "candidate_conflict" | "capture_conflict" | "wallet_conflict" | "insufficient_refundable_payable" | "provider_dispatch_conflict" | "persistence_write_incomplete" | "retryable_concurrency_conflict") {
    super("Online wallet refund approval could not be persisted atomically");
    this.name = "OnlineWalletRefundApprovalPersistenceError";
  }
}

type Context = Readonly<{
  captureApplicationId: string; rootLotId: string; walletId: string; orderId: string;
  astrologerUserId: string; grossMinor: number; commissionBps: number;
  provider: { versionId: string; seriesId: string; providerAccountId: string; identityVersion: number };
}>;
type Source = Readonly<{ sourceKind: "root" | "allocation"; sourceId: string; rootLotId: string; bucket: "pending" | "available" | "reserved" | "payout_pending"; amountMinor: number; orderId: string }>;

/**
 * The only V2 path that makes a refund dispatchable. It reserves exact immutable payable
 * positions before creating the generic provider-operation outbox record; ArcPay never sees a
 * request until the candidate, wallet mutation, sealed journal and V2 case have all committed.
 */
export function createDrizzleOnlineWalletRefundApprovalUnitOfWork(input: Readonly<{ database: ElevenHouseDatabase }>): OnlineWalletRefundApprovalUnitOfWork {
  return Object.freeze({
    async approveOnlineWalletRefund(command) {
      return input.database.transaction((transaction) =>
        approveOnlineWalletRefundInTransaction(transaction, command)
      );
    }
  } satisfies OnlineWalletRefundApprovalUnitOfWork);
}

/**
 * Composes the V2 refund mutation with the WebAuthn-grant transaction.  A caller that has
 * already opened a finance-authorization transaction must use this entry point so an approval
 * failure rolls the one-time grant consumption back together with every wallet/provider write.
 */
export async function approveOnlineWalletRefundInTransaction(
  transaction: FinanceTransaction,
  command: ApproveOnlineWalletRefundCommand
): Promise<OnlineWalletRefundApprovalCommitReceipt> {
  assertCommand(command);
  try {
    return await persist(transaction, command);
  } catch (error) {
    if (error instanceof OnlineWalletRefundApprovalPersistenceError) throw error;
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
    if (code === "23505" || code === "23503" || code === "23514" || code === "55000") {
      fail("persistence_write_incomplete");
    }
    throw error;
  }
}

async function persist(transaction: FinanceTransaction, command: ApproveOnlineWalletRefundCommand): Promise<OnlineWalletRefundApprovalCommitReceipt> {
  const authority = command.authority;
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${authority.walletId}, 0))`);
  const [candidate] = await transaction.select().from(financeRefundCandidates).where(eq(financeRefundCandidates.id, authority.refundCandidateId)).limit(2).for("update");
  if (!candidate || candidate.status !== "under_review" || candidate.version !== String(authority.refundCandidateVersion) || candidate.orderId !== authority.orderId) fail("candidate_conflict");
  const [head] = await transaction.select().from(financeOnlineWalletHeads).where(eq(financeOnlineWalletHeads.id, authority.walletId)).limit(2).for("update");
  if (!head || head.revision !== command.expectedWalletRevision || !head.lastCommitmentDigest) fail("wallet_conflict");
  const replay = await transaction.select().from(financeOnlineWalletRefundCases).where(eq(financeOnlineWalletRefundCases.refundCaseId, authority.refundCaseId)).limit(2).for("share");
  if (replay.length === 1 && replay[0]) return replayReceipt(transaction, replay[0], authority, head.id);
  if (replay.length > 1) fail("persistence_write_incomplete");

  const context = await lockContext(transaction, authority);
  if (context.walletId !== head.id || context.orderId !== authority.orderId) fail("capture_conflict");
  const sources = await lockSources(transaction, context);
  let plan;
  try {
    plan = createOnlineWalletRefundApprovalPlan({
      refundCaseId: authority.refundCaseId,
      grossAmountMinor: minor(authority.approvedCumulativeRefundedMinor) - minor(authority.previousCumulativeRefundedMinor),
      originalGrossAmountMinor: context.grossMinor, commissionBps: context.commissionBps,
      previousRefundedGrossMinor: minor(authority.previousCumulativeRefundedMinor),
      cumulativeRefundedGrossMinor: minor(authority.approvedCumulativeRefundedMinor), sources
    });
  } catch { fail("invalid_command"); }
  if (plan.blockedPayoutOutcomeMinor !== 0 || plan.consumptions.length === 0) fail("insufficient_refundable_payable");
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const journal = createOnlineWalletRefundApprovalJournal({
    refundCaseId: authority.refundCaseId, astrologerUserId: context.astrologerUserId,
    occurredAt: authority.approvedAt, postedAt: authority.approvedAt,
    consumptions: plan.consumptions.map((item) => ({ ...item, orderId: sourceById.get(item.sourceId)?.orderId ?? fail("capture_conflict") }))
  });
  const journalReceipt = await writeOnlineWalletProviderAstrologerJournal(transaction, { journal, astrologerUserId: context.astrologerUserId, providerAccount: context.provider });
  const mutationId = randomUUID(); const nextRevision = (BigInt(head.revision) + 1n).toString();
  const digest = digestFinanceCanonicalValueV1({ kind: "online_wallet_refund_approval", version: 1, refundCaseId: authority.refundCaseId, walletId: head.id, expectedWalletRevision: head.revision, nextWalletRevision: nextRevision, previousCommitmentDigest: head.lastCommitmentDigest, journalTransactionId: journalReceipt.journalTransactionId, allocationIds: plan.consumptions.map((item) => item.refundPendingAllocationId) });
  await transaction.insert(financeOnlineWalletMutations).values({ mutationId, walletId: head.id, expectedWalletRevision: head.revision, nextWalletRevision: nextRevision, operationKind: "refund_approved", previousCommitmentDigest: head.lastCommitmentDigest, commitmentDigest: digest, journalTransactionId: journalReceipt.journalTransactionId, occurredAt: instant(authority.approvedAt), committedAt: instant(authority.approvedAt) });
  const consumptions = plan.consumptions.map((item) => ({ consumptionId: randomUUID(), mutationId, rootLotId: item.rootLotId, walletId: head.id, sourceKind: item.sourceKind, sourceAllocationId: item.sourceKind === "allocation" ? item.sourceId : null, disposedMinor: "0", dispositionKind: "none" as const }));
  await transaction.insert(financeOnlinePayableSourceConsumptions).values(consumptions);
  const allocations = plan.consumptions.flatMap((item, ordinal) => {
    const consumption = consumptions[ordinal]; if (!consumption) fail("persistence_write_incomplete");
    return [{ allocationId: item.refundPendingAllocationId, rootLotId: item.rootLotId, walletId: head.id, amountMinor: String(item.reservedMinor), bucket: "refund_pending" as const, returnBucket: item.bucket, sourceConsumptionId: consumption.consumptionId }, ...(item.remainderMinor > 0 ? [{ allocationId: `online-wallet-refund-remainder:${randomUUID()}`, rootLotId: item.rootLotId, walletId: head.id, amountMinor: String(item.remainderMinor), bucket: item.bucket, returnBucket: null, sourceConsumptionId: consumption.consumptionId }] : [])];
  });
  await transaction.insert(financeOnlinePayableSourceAllocations).values(allocations);
  const moved = plan.consumptions.reduce((total, item) => ({ ...total, [item.bucket]: total[item.bucket] + item.reservedMinor }), { pending: 0, available: 0, reserved: 0 });
  const [updated] = await transaction.update(financeOnlineWalletHeads).set({ revision: nextRevision, pendingMinor: (BigInt(head.pendingMinor) - BigInt(moved.pending)).toString(), availableMinor: (BigInt(head.availableMinor) - BigInt(moved.available)).toString(), reservedMinor: (BigInt(head.reservedMinor) - BigInt(moved.reserved)).toString(), refundPendingMinor: (BigInt(head.refundPendingMinor) + BigInt(plan.payableReservationMinor)).toString(), lastCommitmentId: mutationId, lastCommitmentDigest: digest }).where(and(eq(financeOnlineWalletHeads.id, head.id), eq(financeOnlineWalletHeads.revision, head.revision), eq(financeOnlineWalletHeads.lastCommitmentDigest, head.lastCommitmentDigest))).returning({ id: financeOnlineWalletHeads.id });
  if (!updated) fail("wallet_conflict");
  const providerDispatch = await persistProviderOperationBeforeIoInTransaction(transaction, { ...command.providerDispatch, dispatchAuthorization: deriveOnlineWalletRefundProviderDispatchAuthorization(authority) });
  if (providerDispatch.providerOperationIntentId !== command.providerDispatch.providerOperationIntentId) fail("provider_dispatch_conflict");
  await transaction.insert(financeOnlineWalletRefundCases).values({ refundCaseId: authority.refundCaseId, refundCandidateId: authority.refundCandidateId, captureApplicationId: context.captureApplicationId, rootLotId: context.rootLotId, walletId: head.id, economicPaymentIntentId: authority.economicPaymentIntentId, providerAccountSeriesId: context.provider.seriesId, providerAccountId: context.provider.providerAccountId, providerIdentityVersion: context.provider.identityVersion, providerPaymentId: authority.providerPaymentId, previousCumulativeRefundedMinor: authority.previousCumulativeRefundedMinor, approvedCumulativeRefundedMinor: authority.approvedCumulativeRefundedMinor, refundDeltaMinor: String(minor(authority.approvedCumulativeRefundedMinor) - minor(authority.previousCumulativeRefundedMinor)), commissionReversalMinor: String(plan.commissionReversalMinor), payableReservationMinor: String(plan.payableReservationMinor), approvalWalletMutationId: mutationId, approvalJournalTransactionId: journalReceipt.journalTransactionId, providerOperationIntentId: providerDispatch.providerOperationIntentId, status: "approved", version: "1", approvalAuthorityId: authority.approvalAuthorityId, approvalAuthorityVersion: authority.approvalAuthorityVersion, approvalAuthorityDigest: authority.approvalAuthorityDigest, providerRefundId: null, terminalApplicationId: null, approvedAt: instant(authority.approvedAt), terminalAt: null, createdAt: instant(authority.approvedAt), updatedAt: instant(authority.approvedAt) });
  await transaction.insert(financeOnlineWalletRefundCaseAllocations).values(plan.consumptions.map((item, ordinal) => ({ refundCaseId: authority.refundCaseId, ordinal, rootLotId: item.rootLotId, sourceKind: item.sourceKind, sourceAllocationId: item.sourceKind === "allocation" ? item.sourceId : null, sourceBucket: item.bucket, refundPendingAllocationId: item.refundPendingAllocationId, amountMinor: String(item.reservedMinor) })));
  await transaction.insert(financeOnlineWalletRefundCaseTransitions).values({ refundCaseId: authority.refundCaseId, version: "1", status: "approved", transitionKind: "approved", authorityDigest: authority.approvalAuthorityDigest, occurredAt: instant(authority.approvedAt), createdAt: instant(authority.approvedAt) });
  const [resolved] = await transaction.update(financeRefundCandidates).set({ status: "resolved", version: String(authority.refundCandidateVersion + 1), resolvedRefundCaseId: authority.refundCaseId, resolvedAt: instant(authority.approvedAt), updatedAt: instant(authority.approvedAt) }).where(and(eq(financeRefundCandidates.id, authority.refundCandidateId), eq(financeRefundCandidates.status, "under_review"), eq(financeRefundCandidates.version, String(authority.refundCandidateVersion)))).returning({ id: financeRefundCandidates.id });
  if (!resolved) fail("candidate_conflict");
  await transaction.insert(financeRefundCandidateReviews).values({ candidateId: authority.refundCandidateId, candidateVersion: String(authority.refundCandidateVersion + 1), actorUserId: authority.approvedByActorId, action: "refund_decision_recorded", note: "V2 refund decision recorded", refundCaseId: authority.refundCaseId, reviewedAt: instant(authority.approvedAt), createdAt: instant(authority.approvedAt) });
  const boundary = await issuePersistenceTransactionBoundaryRef(transaction);
  return Object.freeze({ kind: "online_wallet_refund_approval_commit_receipt", effect: "approved_once", refundCaseId: authority.refundCaseId, walletId: head.id, walletRevision: nextRevision, approvalMutationId: mutationId, approvalJournalTransactionId: journalReceipt.journalTransactionId, providerOperationIntentId: providerDispatch.providerOperationIntentId, allocationDigest: digest, persistenceTransactionBoundaryRef: boundary }) as OnlineWalletRefundApprovalCommitReceipt;
}

async function lockContext(transaction: FinanceTransaction, authority: ApproveOnlineWalletRefundCommand["authority"]): Promise<Context> {
  const result = await transaction.execute<Record<string, unknown>>(sql`select application.id as "captureApplicationId", receipt.root_lot_id as "rootLotId", application.online_wallet_id as "walletId", receipt.order_id as "orderId", economics.astrologer_user_id as "astrologerUserId", economics.gross_amount_minor::text as "grossMinor", economics.commission_bps as "commissionBps", provider.id as "versionId", provider.series_id as "seriesId", provider.provider_account_id as "providerAccountId", provider.identity_version as "identityVersion" from finance_online_sale_capture_applications application join finance_online_sale_capture_receipts receipt on receipt.receipt_id = application.online_sale_receipt_id join finance_order_economics_snapshots economics on economics.order_id = receipt.order_id join finance_provider_accounts provider on provider.series_id = application.provider_account_series_id and provider.provider_account_id = application.provider_account_id and provider.identity_version = application.provider_identity_version where application.id = ${authority.captureApplicationId} and application.economic_payment_intent_id = ${authority.economicPaymentIntentId} and application.provider_account_series_id = ${authority.providerAccount.seriesId} and application.provider_account_id = ${authority.providerAccount.providerAccountId} and application.provider_identity_version = ${authority.providerAccount.identityVersion} and application.provider_payment_id = ${authority.providerPaymentId} for update of application, receipt, economics, provider`);
  const row = result.rows[0]; if (result.rows.length !== 1 || !row) fail("capture_conflict");
  return { captureApplicationId: id(row.captureApplicationId), rootLotId: id(row.rootLotId), walletId: id(row.walletId), orderId: id(row.orderId), astrologerUserId: id(row.astrologerUserId), grossMinor: minor(row.grossMinor), commissionBps: minor(row.commissionBps), provider: { versionId: id(row.versionId), seriesId: id(row.seriesId), providerAccountId: id(row.providerAccountId), identityVersion: minor(row.identityVersion) } };
}

async function lockSources(transaction: FinanceTransaction, context: Context): Promise<readonly Source[]> {
  const [root] = await transaction.select().from(financeOnlineSaleCaptureRootLots).where(eq(financeOnlineSaleCaptureRootLots.lotId, context.rootLotId)).limit(2).for("update"); if (!root || root.walletId !== context.walletId) fail("capture_conflict");
  const rootConsumed = await transaction.select({ id: financeOnlinePayableSourceConsumptions.consumptionId }).from(financeOnlinePayableSourceConsumptions).where(and(eq(financeOnlinePayableSourceConsumptions.rootLotId, context.rootLotId), eq(financeOnlinePayableSourceConsumptions.sourceKind, "root"))).limit(2).for("share");
  const rows = await transaction.select().from(financeOnlinePayableSourceAllocations).leftJoin(financeOnlinePayableSourceConsumptions, and(eq(financeOnlinePayableSourceConsumptions.sourceAllocationId, financeOnlinePayableSourceAllocations.allocationId), eq(financeOnlinePayableSourceConsumptions.sourceKind, "allocation"))).where(and(eq(financeOnlinePayableSourceAllocations.walletId, context.walletId), eq(financeOnlinePayableSourceAllocations.rootLotId, context.rootLotId), isNull(financeOnlinePayableSourceConsumptions.consumptionId))).orderBy(asc(financeOnlinePayableSourceAllocations.allocationId)).for("update", { of: financeOnlinePayableSourceAllocations });
  const sources: Source[] = rootConsumed.length === 0 ? [{ sourceKind: "root", sourceId: root.lotId, rootLotId: root.lotId, bucket: "pending", amountMinor: minor(root.amountMinor), orderId: context.orderId }] : [];
  for (const row of rows) { const allocation = row.finance_online_payable_source_allocations; if (!allocation || !["pending", "available", "reserved", "payout_pending"].includes(allocation.bucket)) fail("capture_conflict"); sources.push({ sourceKind: "allocation", sourceId: allocation.allocationId, rootLotId: allocation.rootLotId, bucket: allocation.bucket as Source["bucket"], amountMinor: minor(allocation.amountMinor), orderId: context.orderId }); }
  return sources;
}

async function replayReceipt(transaction: FinanceTransaction, row: typeof financeOnlineWalletRefundCases.$inferSelect, authority: ApproveOnlineWalletRefundCommand["authority"], walletId: string): Promise<OnlineWalletRefundApprovalCommitReceipt> { if (row.refundCandidateId !== authority.refundCandidateId || row.walletId !== walletId || row.approvedCumulativeRefundedMinor !== authority.approvedCumulativeRefundedMinor || row.approvalAuthorityDigest !== authority.approvalAuthorityDigest) fail("candidate_conflict"); const [mutation] = await transaction.select({ nextWalletRevision: financeOnlineWalletMutations.nextWalletRevision, commitmentDigest: financeOnlineWalletMutations.commitmentDigest }).from(financeOnlineWalletMutations).where(eq(financeOnlineWalletMutations.mutationId, row.approvalWalletMutationId)).limit(2).for("share"); if (!mutation) fail("persistence_write_incomplete"); return Object.freeze({ kind: "online_wallet_refund_approval_commit_receipt", effect: "replayed", refundCaseId: row.refundCaseId, walletId, walletRevision: mutation.nextWalletRevision, approvalMutationId: row.approvalWalletMutationId, approvalJournalTransactionId: row.approvalJournalTransactionId, providerOperationIntentId: row.providerOperationIntentId, allocationDigest: mutation.commitmentDigest, persistenceTransactionBoundaryRef: "replayed" }) as OnlineWalletRefundApprovalCommitReceipt; }
function assertCommand(command: ApproveOnlineWalletRefundCommand): void { const a = command.authority; if (a.kind !== "verified_online_wallet_refund_approval_authority" || !id(command.expectedWalletRevision) || minor(a.approvedCumulativeRefundedMinor) <= minor(a.previousCumulativeRefundedMinor) || command.providerDispatch.operationKind !== "refund" || command.providerDispatch.economicPaymentIntentId !== a.economicPaymentIntentId || command.providerDispatch.providerAccount.providerAccountId !== a.providerAccount.providerAccountId || command.providerDispatch.providerAccount.identityVersion !== a.providerAccount.identityVersion) fail("invalid_command"); }
function id(value: unknown): string { if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > 200) fail("invalid_command"); return value; }
function minor(value: unknown): number { const n = typeof value === "number" ? value : typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value) ? Number(value) : NaN; if (!Number.isSafeInteger(n) || n < 0) fail("invalid_command"); return n; }
function instant(value: string): Date { const result = new Date(value); if (!Number.isFinite(result.getTime())) fail("invalid_command"); return result; }
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: ConstructorParameters<typeof OnlineWalletRefundApprovalPersistenceError>[0]): never { throw new OnlineWalletRefundApprovalPersistenceError(reason); }
