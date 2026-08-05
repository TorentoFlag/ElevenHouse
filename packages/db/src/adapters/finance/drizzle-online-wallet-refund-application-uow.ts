import { randomUUID } from "node:crypto";

import {
  createOnlineWalletRefundConfirmedJournal,
  createOnlineWalletRefundPlan,
  digestFinanceCanonicalValueV1,
  type ApplyCanonicalOnlineWalletRefundCommand,
  type OnlineWalletRefundApplicationCommitReceipt,
  type OnlineWalletRefundApplicationUnitOfWork,
  type WebhookSemanticCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeOnlineSaleCaptureRootLots,
  financeOnlineWalletHeads
} from "../../schema/finance/online-sale-capture.schema";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletMutations
} from "../../schema/finance/online-wallet-mutations.schema";
import { financeOnlineWalletRefundApplications } from "../../schema/finance/online-wallet-refund-applications.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletProviderAstrologerJournal } from "./drizzle-online-wallet-journal-writer";
import { issuePersistenceTransactionBoundaryRef } from "./drizzle-sealed-wallet-journal-commit-uow";
import {
  applyVerifiedWebhookSemanticFactInTransaction,
  WebhookInboxProcessingPersistenceError
} from "./drizzle-webhook-inbox-processing-uow";

export type OnlineWalletRefundApplicationPersistenceReason =
  | "invalid_command"
  | "semantic_refund_conflict"
  | "capture_not_found"
  | "capture_identity_conflict"
  | "wallet_commit_conflict"
  | "refund_replay_conflict"
  | "persistence_write_incomplete"
  | "retryable_concurrency_conflict";

export class OnlineWalletRefundApplicationPersistenceError extends Error {
  readonly code = "online_wallet_refund_application_persistence_error";

  constructor(readonly reason: OnlineWalletRefundApplicationPersistenceReason) {
    super("Canonical online-wallet refund could not be applied atomically");
    this.name = "OnlineWalletRefundApplicationPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  semanticFact: ApplyCanonicalOnlineWalletRefundCommand["semanticFact"];
  refund: Readonly<{
    providerPaymentId: string;
    providerRefundId: string;
    refundDeltaMinor: number;
    previousCumulativeRefundedMinor: number;
    cumulativeRefundedMinor: number;
    occurredAt: string;
  }>;
}>;

type RefundContext = Readonly<{
  captureApplicationId: string;
  rootLotId: string;
  walletId: string;
  orderId: string;
  astrologerUserId: string;
  originalGrossAmountMinor: number;
  commissionBps: number;
  providerAccount: Readonly<{
    versionId: string;
    seriesId: string;
    providerAccountId: string;
    identityVersion: number;
  }>;
}>;

type RefundContextRow = Readonly<{
  captureApplicationId: unknown;
  rootLotId: unknown;
  walletId: unknown;
  orderId: unknown;
  astrologerUserId: unknown;
  originalGrossAmountMinor: unknown;
  commissionBps: unknown;
  versionId: unknown;
  seriesId: unknown;
  providerAccountId: unknown;
  identityVersion: unknown;
}>;

type OpenSource = Readonly<{
  sourceKind: "root" | "allocation";
  sourceId: string;
  rootLotId: string;
  bucket: "pending" | "available" | "reserved" | "payout_pending";
  amountMinor: number;
}>;

/**
 * The refund is posted only after the caller-owned semantic-fact transaction has proved the
 * canonical ArcPay operation identity and cumulative amount. It never consults legacy v1 lots,
 * recovery receivables or raw webhook payloads.
 */
export function createDrizzleOnlineWalletRefundApplicationUnitOfWork(input: Readonly<{
  database: ElevenHouseDatabase;
  workerId: string;
}>): OnlineWalletRefundApplicationUnitOfWork {
  const workerId = identifier(input.workerId);
  return Object.freeze({
    async applyCanonicalOnlineWalletRefund(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          persistRefund(transaction, workerId, normalized)
        );
      } catch (error) {
        if (
          error instanceof OnlineWalletRefundApplicationPersistenceError ||
          error instanceof WebhookInboxProcessingPersistenceError
        ) {
          throw error;
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("refund_replay_conflict");
        if (code === "23503" || code === "23514" || code === "55000") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletRefundApplicationUnitOfWork);
}

function normalizeCommand(command: ApplyCanonicalOnlineWalletRefundCommand): NormalizedCommand {
  const refund = command.refund;
  const providerPaymentId = identifier(refund.providerPaymentId);
  const providerRefundId = identifier(refund.providerRefundId);
  const refundDeltaMinor = positiveMinor(refund.refundDeltaMinor);
  const previousCumulativeRefundedMinor = nonNegativeMinor(refund.previousCumulativeRefundedMinor);
  const cumulativeRefundedMinor = positiveMinor(refund.cumulativeRefundedMinor);
  if (cumulativeRefundedMinor - previousCumulativeRefundedMinor !== refundDeltaMinor) {
    fail("invalid_command");
  }
  const occurredAt = instant(refund.occurredAt).toISOString();
  const evidence = command.semanticFact.semanticEvidence;
  if (
    evidence.semanticSourceKind !== "refund" ||
    evidence.semanticSourceId !== providerRefundId ||
    evidence.purpose !== "client_order" ||
    evidence.economicPaymentSessionId !== null ||
    evidence.providerPaymentId !== null ||
    evidence.amountMinor !== null ||
    evidence.currency !== null
  ) {
    fail("invalid_command");
  }
  return Object.freeze({
    semanticFact: command.semanticFact,
    refund: Object.freeze({
      providerPaymentId,
      providerRefundId,
      refundDeltaMinor,
      previousCumulativeRefundedMinor,
      cumulativeRefundedMinor,
      occurredAt
    })
  });
}

async function persistRefund(
  transaction: FinanceTransaction,
  workerId: string,
  command: NormalizedCommand
): Promise<OnlineWalletRefundApplicationCommitReceipt> {
  const semanticReceipt = await applyVerifiedWebhookSemanticFactInTransaction(
    transaction,
    workerId,
    command.semanticFact
  );
  assertSemanticReceipt(semanticReceipt, command);

  const existing = await readExistingApplication(transaction, semanticReceipt.receiptId);
  if (existing) return mapReplay(existing, command);

  const context = await lockRefundContext(transaction, semanticReceipt, command);
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${context.walletId}, 0))`
  );
  const [head] = await transaction
    .select()
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, context.walletId))
    .limit(2)
    .for("update");
  if (
    !head ||
    head.astrologerUserId !== context.astrologerUserId ||
    head.currency !== "RUB" ||
    !head.lastCommitmentDigest
  ) {
    fail("capture_identity_conflict");
  }

  const sources = await lockOpenSources(transaction, context);
  const plan = createOnlineWalletRefundPlan({
    refundId: command.refund.providerRefundId,
    grossAmountMinor: command.refund.refundDeltaMinor,
    originalGrossAmountMinor: context.originalGrossAmountMinor,
    commissionBps: context.commissionBps,
    previousRefundedGrossMinor: command.refund.previousCumulativeRefundedMinor,
    cumulativeRefundedGrossMinor: command.refund.cumulativeRefundedMinor,
    sources
  });
  const boundary = await issuePersistenceTransactionBoundaryRef(transaction);
  if (plan.blockedPayoutOutcomeMinor > 0) {
    await insertApplication(transaction, {
      semanticReceipt,
      context,
      command,
      outcome: "blocked_payout_outcome",
      walletRevision: head.revision,
      mutationId: null,
      journalTransactionId: null,
      commissionReversalMinor: null,
      payableReversalMinor: null,
      blockedPayoutOutcomeMinor: plan.blockedPayoutOutcomeMinor,
      boundary
    });
    return Object.freeze({
      kind: "online_wallet_refund_application_commit_receipt",
      effect: "blocked_payout_outcome",
      providerRefundId: command.refund.providerRefundId,
      walletId: context.walletId,
      walletRevision: head.revision,
      walletMutationId: null,
      journalTransactionId: null,
      blockedPayoutOutcomeMinor: String(plan.blockedPayoutOutcomeMinor)
    });
  }

  const journal = createOnlineWalletRefundConfirmedJournal({
    refundId: command.refund.providerRefundId,
    orderId: context.orderId,
    providerAccountId: context.providerAccount.providerAccountId,
    astrologerUserId: context.astrologerUserId,
    occurredAt: command.refund.occurredAt,
    postedAt: command.refund.occurredAt,
    commissionReversalMinor: plan.commissionReversalMinor,
    grossAmountMinor: command.refund.refundDeltaMinor,
    consumptions: plan.consumptions.map((consumption) => ({
      sourceId: consumption.sourceId,
      rootLotId: consumption.rootLotId,
      bucket: consumption.bucket,
      consumedMinor: consumption.consumedMinor
    })),
    blockedPayoutOutcomeMinor: plan.blockedPayoutOutcomeMinor
  });
  const journalReceipt = await writeOnlineWalletProviderAstrologerJournal(transaction, {
    journal,
    astrologerUserId: context.astrologerUserId,
    providerAccount: context.providerAccount
  });
  const mutationId = randomUUID();
  const nextWalletRevision = (BigInt(head.revision) + 1n).toString();
  const commitmentDigest = digestFinanceCanonicalValueV1({
    kind: "online_wallet_refund_mutation",
    version: 2,
    mutationId,
    walletId: context.walletId,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    previousCommitmentDigest: head.lastCommitmentDigest,
    providerRefundId: command.refund.providerRefundId,
    providerPaymentId: command.refund.providerPaymentId,
    refundDeltaMinor: String(command.refund.refundDeltaMinor),
    previousCumulativeRefundedMinor: String(command.refund.previousCumulativeRefundedMinor),
    cumulativeRefundedMinor: String(command.refund.cumulativeRefundedMinor),
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    consumptions: plan.consumptions.map((consumption) => ({
      sourceKind: consumption.sourceKind,
      sourceId: consumption.sourceId,
      rootLotId: consumption.rootLotId,
      bucket: consumption.bucket,
      consumedMinor: consumption.consumedMinor,
      remainderMinor: consumption.remainderMinor
    }))
  });
  await transaction.insert(financeOnlineWalletMutations).values({
    mutationId,
    walletId: context.walletId,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    operationKind: "refund_confirmed",
    previousCommitmentDigest: head.lastCommitmentDigest,
    commitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: instant(command.refund.occurredAt),
    committedAt: instant(command.refund.occurredAt)
  });
  const consumptionRows = plan.consumptions.map((consumption) => ({
    consumptionId: randomUUID(),
    mutationId,
    rootLotId: consumption.rootLotId,
    walletId: context.walletId,
    sourceKind: consumption.sourceKind,
    sourceAllocationId: consumption.sourceKind === "allocation" ? consumption.sourceId : null,
    disposedMinor: String(consumption.consumedMinor),
    dispositionKind: "refund_confirmed" as const
  }));
  await transaction.insert(financeOnlinePayableSourceConsumptions).values(consumptionRows);
  const outputs = plan.consumptions.flatMap((consumption, ordinal) => {
    if (consumption.remainderMinor === 0) return [];
    const row = consumptionRows[ordinal];
    if (!row) fail("persistence_write_incomplete");
    return [{
      allocationId: `online-wallet-refund-remainder:${randomUUID()}`,
      rootLotId: consumption.rootLotId,
      walletId: context.walletId,
      amountMinor: String(consumption.remainderMinor),
      bucket: consumption.bucket,
      returnBucket: null,
      sourceConsumptionId: row.consumptionId
    }];
  });
  if (outputs.length > 0) await transaction.insert(financeOnlinePayableSourceAllocations).values(outputs);
  const consumedByBucket = plan.consumptions.reduce(
    (totals, consumption) => ({ ...totals, [consumption.bucket]: totals[consumption.bucket] + consumption.consumedMinor }),
    { pending: 0, available: 0, reserved: 0, payout_pending: 0 }
  );
  const [updated] = await transaction
    .update(financeOnlineWalletHeads)
    .set({
      revision: nextWalletRevision,
      pendingMinor: (BigInt(head.pendingMinor) - BigInt(consumedByBucket.pending)).toString(),
      availableMinor: (BigInt(head.availableMinor) - BigInt(consumedByBucket.available)).toString(),
      reservedMinor: (BigInt(head.reservedMinor) - BigInt(consumedByBucket.reserved)).toString(),
      payoutPendingMinor: (
        BigInt(head.payoutPendingMinor) - BigInt(consumedByBucket.payout_pending)
      ).toString(),
      lastCommitmentId: mutationId,
      lastCommitmentDigest: commitmentDigest
    })
    .where(
      and(
        eq(financeOnlineWalletHeads.id, context.walletId),
        eq(financeOnlineWalletHeads.revision, head.revision),
        eq(financeOnlineWalletHeads.lastCommitmentDigest, head.lastCommitmentDigest)
      )
    )
    .returning({ id: financeOnlineWalletHeads.id });
  if (!updated) fail("wallet_commit_conflict");
  await insertApplication(transaction, {
    semanticReceipt,
    context,
    command,
    outcome: "applied",
    walletRevision: nextWalletRevision,
    mutationId,
    journalTransactionId: journalReceipt.journalTransactionId,
    commissionReversalMinor: plan.commissionReversalMinor,
    payableReversalMinor: plan.payableReversalMinor,
    blockedPayoutOutcomeMinor: 0,
    boundary
  });
  return Object.freeze({
    kind: "online_wallet_refund_application_commit_receipt",
    effect: "applied_once",
    providerRefundId: command.refund.providerRefundId,
    walletId: context.walletId,
    walletRevision: nextWalletRevision,
    walletMutationId: mutationId,
    journalTransactionId: journalReceipt.journalTransactionId,
    blockedPayoutOutcomeMinor: "0"
  });
}

function assertSemanticReceipt(
  receipt: WebhookSemanticCommitReceipt,
  command: NormalizedCommand
): void {
  if (
    (receipt.businessEffect !== "applied_once" && receipt.businessEffect !== "semantic_replay") ||
    receipt.semanticSourceKind !== "refund" ||
    receipt.semanticSourceId !== command.refund.providerRefundId ||
    receipt.purpose !== "client_order" ||
    receipt.economicPaymentSessionId !== null ||
    receipt.providerPaymentId !== null ||
    receipt.amountMinor !== null ||
    receipt.currency !== null
  ) {
    fail("semantic_refund_conflict");
  }
}

async function readExistingApplication(transaction: FinanceTransaction, semanticCommitReceiptId: string) {
  const [row] = await transaction
    .select()
    .from(financeOnlineWalletRefundApplications)
    .where(eq(financeOnlineWalletRefundApplications.semanticCommitReceiptId, semanticCommitReceiptId))
    .limit(2)
    .for("share");
  return row ?? null;
}

function mapReplay(
  row: typeof financeOnlineWalletRefundApplications.$inferSelect,
  command: NormalizedCommand
): OnlineWalletRefundApplicationCommitReceipt {
  if (
    row.providerRefundId !== command.refund.providerRefundId ||
    row.providerPaymentId !== command.refund.providerPaymentId ||
    row.previousRefundedMinor !== String(command.refund.previousCumulativeRefundedMinor) ||
    row.cumulativeRefundedMinor !== String(command.refund.cumulativeRefundedMinor) ||
    row.refundDeltaMinor !== String(command.refund.refundDeltaMinor)
  ) {
    fail("refund_replay_conflict");
  }
  return Object.freeze({
    kind: "online_wallet_refund_application_commit_receipt",
    effect: row.outcome === "applied" ? "semantic_replay" : "blocked_payout_outcome",
    providerRefundId: row.providerRefundId,
    walletId: row.walletId,
    walletRevision: row.walletRevision,
    walletMutationId: row.walletMutationId,
    journalTransactionId: row.journalTransactionId,
    blockedPayoutOutcomeMinor: row.blockedPayoutOutcomeMinor
  });
}

async function lockRefundContext(
  transaction: FinanceTransaction,
  semanticReceipt: WebhookSemanticCommitReceipt,
  command: NormalizedCommand
): Promise<RefundContext> {
  const rows = await transaction.execute<RefundContextRow>(sql`
    select application.id as "captureApplicationId",
           receipt.root_lot_id as "rootLotId",
           application.online_wallet_id as "walletId",
           receipt.order_id as "orderId",
           economics.astrologer_user_id as "astrologerUserId",
           economics.gross_amount_minor::text as "originalGrossAmountMinor",
           economics.commission_bps as "commissionBps",
           provider.id as "versionId",
           provider.series_id as "seriesId",
           provider.provider_account_id as "providerAccountId",
           provider.identity_version as "identityVersion"
      from finance_online_sale_capture_applications application
      join finance_online_sale_capture_receipts receipt
        on receipt.receipt_id = application.online_sale_receipt_id
      join finance_order_economics_snapshots economics
        on economics.order_id = receipt.order_id
      join finance_provider_accounts provider
        on provider.series_id = application.provider_account_series_id
       and provider.provider_account_id = application.provider_account_id
       and provider.identity_version = application.provider_identity_version
     where application.economic_payment_intent_id = ${semanticReceipt.economicPaymentIntentId}
       and application.provider_account_series_id = ${semanticReceipt.providerAccount.seriesId}
       and application.provider_account_id = ${semanticReceipt.providerAccount.providerAccountId}
       and application.provider_identity_version = ${semanticReceipt.providerAccount.identityVersion}
       and application.provider_payment_id = ${command.refund.providerPaymentId}
     for update of application, receipt, economics, provider
  `);
  if (rows.rows.length !== 1 || !rows.rows[0]) fail("capture_not_found");
  const row = rows.rows[0];
  const providerAccount = Object.freeze({
    versionId: identifier(row.versionId),
    seriesId: identifier(row.seriesId),
    providerAccountId: identifier(row.providerAccountId),
    identityVersion: positiveInteger(row.identityVersion)
  });
  return Object.freeze({
    captureApplicationId: identifier(row.captureApplicationId),
    rootLotId: identifier(row.rootLotId),
    walletId: uuid(row.walletId),
    orderId: identifier(row.orderId),
    astrologerUserId: uuid(row.astrologerUserId),
    originalGrossAmountMinor: positiveMinor(row.originalGrossAmountMinor),
    commissionBps: bps(row.commissionBps),
    providerAccount
  });
}

async function lockOpenSources(
  transaction: FinanceTransaction,
  context: RefundContext
): Promise<readonly OpenSource[]> {
  const [root] = await transaction
    .select({
      lotId: financeOnlineSaleCaptureRootLots.lotId,
      walletId: financeOnlineSaleCaptureRootLots.walletId,
      amountMinor: financeOnlineSaleCaptureRootLots.amountMinor
    })
    .from(financeOnlineSaleCaptureRootLots)
    .where(eq(financeOnlineSaleCaptureRootLots.lotId, context.rootLotId))
    .limit(2)
    .for("update");
  if (!root || root.walletId !== context.walletId) fail("capture_identity_conflict");
  const rootConsumed = await transaction
    .select({ id: financeOnlinePayableSourceConsumptions.consumptionId })
    .from(financeOnlinePayableSourceConsumptions)
    .where(
      and(
        eq(financeOnlinePayableSourceConsumptions.rootLotId, context.rootLotId),
        eq(financeOnlinePayableSourceConsumptions.sourceKind, "root")
      )
    )
    .limit(2)
    .for("share");
  const allocations = await transaction
    .select()
    .from(financeOnlinePayableSourceAllocations)
    .leftJoin(
      financeOnlinePayableSourceConsumptions,
      and(
        eq(
          financeOnlinePayableSourceConsumptions.sourceAllocationId,
          financeOnlinePayableSourceAllocations.allocationId
        ),
        eq(financeOnlinePayableSourceConsumptions.sourceKind, "allocation")
      )
    )
    .where(
      and(
        eq(financeOnlinePayableSourceAllocations.rootLotId, context.rootLotId),
        eq(financeOnlinePayableSourceAllocations.walletId, context.walletId),
        isNull(financeOnlinePayableSourceConsumptions.consumptionId)
      )
    )
    .orderBy(asc(financeOnlinePayableSourceAllocations.allocationId))
    .for("update", { of: financeOnlinePayableSourceAllocations });
  const sources: OpenSource[] = [];
  if (rootConsumed.length === 0) {
    sources.push({
      sourceKind: "root",
      sourceId: root.lotId,
      rootLotId: root.lotId,
      bucket: "pending",
      amountMinor: positiveMinor(root.amountMinor)
    });
  }
  for (const row of allocations) {
    const allocation = row.finance_online_payable_source_allocations;
    if (
      allocation.bucket !== "pending" &&
      allocation.bucket !== "available" &&
      allocation.bucket !== "reserved" &&
      allocation.bucket !== "payout_pending"
    ) {
      fail("capture_identity_conflict");
    }
    sources.push({
      sourceKind: "allocation",
      sourceId: allocation.allocationId,
      rootLotId: allocation.rootLotId,
      bucket: allocation.bucket,
      amountMinor: positiveMinor(allocation.amountMinor)
    });
  }
  return Object.freeze(sources);
}

async function insertApplication(
  transaction: FinanceTransaction,
  input: Readonly<{
    semanticReceipt: WebhookSemanticCommitReceipt;
    context: RefundContext;
    command: NormalizedCommand;
    outcome: "applied" | "blocked_payout_outcome";
    walletRevision: string;
    mutationId: string | null;
    journalTransactionId: string | null;
    commissionReversalMinor: number | null;
    payableReversalMinor: number | null;
    blockedPayoutOutcomeMinor: number;
    boundary: string;
  }>
): Promise<void> {
  const canonical = {
    kind: "online_wallet_refund_application",
    version: 2,
    semanticCommitReceiptId: input.semanticReceipt.receiptId,
    semanticFactId: input.semanticReceipt.semanticFactId,
    providerAccount: input.context.providerAccount,
    providerRefundId: input.command.refund.providerRefundId,
    providerPaymentId: input.command.refund.providerPaymentId,
    captureApplicationId: input.context.captureApplicationId,
    rootLotId: input.context.rootLotId,
    walletId: input.context.walletId,
    walletRevision: input.walletRevision,
    outcome: input.outcome,
    mutationId: input.mutationId,
    journalTransactionId: input.journalTransactionId,
    previousRefundedMinor: String(input.command.refund.previousCumulativeRefundedMinor),
    cumulativeRefundedMinor: String(input.command.refund.cumulativeRefundedMinor),
    refundDeltaMinor: String(input.command.refund.refundDeltaMinor),
    commissionReversalMinor:
      input.commissionReversalMinor === null ? null : String(input.commissionReversalMinor),
    payableReversalMinor: input.payableReversalMinor === null ? null : String(input.payableReversalMinor),
    blockedPayoutOutcomeMinor: String(input.blockedPayoutOutcomeMinor),
    occurredAt: input.command.refund.occurredAt,
    persistenceTransactionBoundaryRef: input.boundary
  };
  const [created] = await transaction
    .insert(financeOnlineWalletRefundApplications)
    .values({
      semanticCommitReceiptId: input.semanticReceipt.receiptId,
      semanticFactId: input.semanticReceipt.semanticFactId,
      providerAccountSeriesId: input.context.providerAccount.seriesId,
      providerAccountId: input.context.providerAccount.providerAccountId,
      providerIdentityVersion: input.context.providerAccount.identityVersion,
      providerRefundId: input.command.refund.providerRefundId,
      providerPaymentId: input.command.refund.providerPaymentId,
      captureApplicationId: input.context.captureApplicationId,
      rootLotId: input.context.rootLotId,
      walletId: input.context.walletId,
      walletRevision: input.walletRevision,
      outcome: input.outcome,
      walletMutationId: input.mutationId,
      journalTransactionId: input.journalTransactionId,
      previousRefundedMinor: String(input.command.refund.previousCumulativeRefundedMinor),
      cumulativeRefundedMinor: String(input.command.refund.cumulativeRefundedMinor),
      refundDeltaMinor: String(input.command.refund.refundDeltaMinor),
      commissionReversalMinor:
        input.commissionReversalMinor === null ? null : String(input.commissionReversalMinor),
      payableReversalMinor: input.payableReversalMinor === null ? null : String(input.payableReversalMinor),
      blockedPayoutOutcomeMinor: String(input.blockedPayoutOutcomeMinor),
      canonicalPreimage: JSON.stringify(canonical),
      canonicalDigest: digestFinanceCanonicalValueV1(canonical),
      persistenceTransactionBoundaryRef: input.boundary,
      occurredAt: instant(input.command.refund.occurredAt),
      committedAt: instant(input.command.refund.occurredAt)
    })
    .returning({ id: financeOnlineWalletRefundApplications.id });
  if (!created) fail("persistence_write_incomplete");
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    fail("invalid_command");
  }
  return value;
}

function uuid(value: unknown): string {
  const parsed = identifier(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed)) {
    fail("capture_identity_conflict");
  }
  return parsed;
}

function positiveMinor(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail("invalid_command");
  return parsed;
}

function nonNegativeMinor(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail("invalid_command");
  return parsed;
}

function positiveInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail("capture_identity_conflict");
  return parsed;
}

function bps(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 10_000) {
    fail("capture_identity_conflict");
  }
  return parsed;
}

function instant(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail("invalid_command");
  return parsed;
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: OnlineWalletRefundApplicationPersistenceReason): never {
  throw new OnlineWalletRefundApplicationPersistenceError(reason);
}
