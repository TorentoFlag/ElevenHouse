import { randomUUID } from "node:crypto";

import {
  createOnlineWalletHoldReleaseJournal,
  createOnlineWalletHoldReleasePlan,
  digestFinanceCanonicalValueV1,
  type OnlineWalletHoldReleaseCommitReceipt,
  type OnlineWalletHoldReleaseUnitOfWork,
  type ReleaseDueOnlineWalletHoldsCommand,
  type ReleaseDueOnlineWalletHoldsResult
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeMerchantPayoutPaymentInclusions,
  financeRiskPolicyVersions
} from "../../schema/finance";
import { reconciliationRecords } from "../../schema/finance/reconciliation.schema";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletHoldReleaseEvidence,
  financeOnlineWalletMutations
} from "../../schema/finance/online-wallet-mutations.schema";
import {
  financeOnlineSaleCaptureAuthorityBindings,
  financeOnlineSaleCaptureReceipts,
  financeOnlineSaleCaptureRootLots,
  financeOnlineWalletHeads
} from "../../schema/finance/online-sale-capture.schema";
import { orders } from "../../schema/finance/orders.schema";
import { bookingLifecycleEvents } from "../../schema/scheduling/booking-lifecycle-events.schema";
import { bookings } from "../../schema/scheduling/bookings.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletAstrologerJournal } from "./drizzle-online-wallet-journal-writer";

export class OnlineWalletHoldReleasePersistenceError extends Error {
  readonly code = "online_wallet_hold_release_persistence_error";

  constructor() {
    super("Online wallet hold release could not be persisted");
    this.name = "OnlineWalletHoldReleasePersistenceError";
  }
}

export function createDrizzleOnlineWalletHoldReleaseUnitOfWork(input: Readonly<{
  database: ElevenHouseDatabase;
}>): OnlineWalletHoldReleaseUnitOfWork {
  return Object.freeze({
    async releaseDueOnlineWalletHolds(
      command: ReleaseDueOnlineWalletHoldsCommand
    ): Promise<ReleaseDueOnlineWalletHoldsResult> {
      const now = instant(command.now);
      if (!Number.isSafeInteger(command.limit) || command.limit <= 0 || command.limit > 1_000) {
        throw new OnlineWalletHoldReleasePersistenceError();
      }
      const roots = await findEligibleRootLots(input.database, now, command.limit);
      const receipts: OnlineWalletHoldReleaseCommitReceipt[] = [];
      for (const rootLotId of roots) {
        receipts.push(
          await input.database.transaction((transaction) =>
            releaseOneRoot(transaction, rootLotId, now.toISOString())
          )
        );
      }
      return Object.freeze({
        scanned: roots.length,
        released: receipts.filter((receipt) => receipt.effect === "applied_once").length,
        replayed: receipts.filter((receipt) => receipt.effect === "replayed").length,
        ineligible: receipts.filter((receipt) => receipt.effect === "ineligible").length,
        receipts: Object.freeze(receipts)
      });
    }
  });
}

async function findEligibleRootLots(
  database: ElevenHouseDatabase,
  now: Date,
  limit: number
): Promise<readonly string[]> {
  const rows = await database.execute<{ rootLotId: string }>(sql`
    select root.lot_id as "rootLotId"
      from finance_online_sale_capture_root_lots root
      join finance_online_sale_capture_receipts receipt
        on receipt.receipt_id = root.receipt_id
      join finance_online_sale_capture_authority_bindings authority
        on authority.receipt_id = receipt.receipt_id
      join finance_risk_policy_versions risk
        on risk.policy_id = authority.risk_policy_id
       and risk.policy_version = authority.risk_policy_version
       and risk.canonical_digest = authority.risk_policy_digest
      join orders order_row on order_row.id::text = receipt.order_id
      join bookings booking on booking.id = order_row.booking_id
      join booking_lifecycle_events completion
        on completion.booking_id = booking.id
       and completion.owner_user_id = booking.owner_user_id
       and completion.revision = booking.lifecycle_revision
       and completion.event_kind = 'completed'
     where root.bucket = 'pending'
       and root.status = 'active'
       and booking.state = 'completed'
       and completion.occurred_at + make_interval(hours => risk.hold_duration_hours) <= ${now}
       and not exists (
         select 1 from finance_online_payable_source_consumptions consumed
          where consumed.root_lot_id = root.lot_id and consumed.source_kind = 'root'
       )
       and not exists (
         select 1 from reconciliation_records exception_row
          where exception_row.provider_payment_id = authority.provider_payment_id
            and exception_row.status = 'exception'
            and exception_row.resolved_at is null
       )
       and (
         risk.provider_settlement_required = false
         or exists (
           select 1 from finance_merchant_payout_payment_inclusions inclusion
            where inclusion.capture_fact_id = authority.capture_fact_id
         )
       )
     order by completion.occurred_at, root.lot_id
     limit ${limit}
  `);
  return Object.freeze(rows.rows.map((row) => row.rootLotId));
}

async function releaseOneRoot(
  transaction: FinanceTransaction,
  rootLotId: string,
  now: string
): Promise<OnlineWalletHoldReleaseCommitReceipt> {
  const [identity] = await transaction
    .select({ walletId: financeOnlineSaleCaptureRootLots.walletId })
    .from(financeOnlineSaleCaptureRootLots)
    .where(eq(financeOnlineSaleCaptureRootLots.lotId, rootLotId))
    .limit(2);
  if (!identity) throw new OnlineWalletHoldReleasePersistenceError();

  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${identity.walletId}, 0))`
  );
  const [head] = await transaction
    .select()
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, identity.walletId))
    .limit(2)
    .for("update");
  const [root] = await transaction
    .select()
    .from(financeOnlineSaleCaptureRootLots)
    .where(eq(financeOnlineSaleCaptureRootLots.lotId, rootLotId))
    .limit(2)
    .for("update");
  if (!head || !root || root.walletId !== identity.walletId || !head.lastCommitmentDigest) {
    throw new OnlineWalletHoldReleasePersistenceError();
  }

  const replay = await readConsumedRoot(transaction, rootLotId);
  if (replay) return replay;
  const [context] = await transaction
    .select({
      orderId: financeOnlineSaleCaptureReceipts.orderId,
      captureFactId: financeOnlineSaleCaptureAuthorityBindings.captureFactId,
      providerPaymentId: financeOnlineSaleCaptureAuthorityBindings.providerPaymentId,
      astrologerUserId: financeOnlineSaleCaptureRootLots.astrologerUserId,
      rootAmountMinor: financeOnlineSaleCaptureRootLots.amountMinor,
      rootCurrency: financeOnlineSaleCaptureRootLots.currency,
      rootBucket: financeOnlineSaleCaptureRootLots.bucket,
      rootStatus: financeOnlineSaleCaptureRootLots.status,
      bookingId: bookings.id,
      bookingOwnerUserId: bookings.ownerUserId,
      bookingState: bookings.state,
      bookingRevision: bookings.lifecycleRevision,
      completionEventId: bookingLifecycleEvents.id,
      completionEventKind: bookingLifecycleEvents.eventKind,
      completionRevision: bookingLifecycleEvents.revision,
      completionOccurredAt: bookingLifecycleEvents.occurredAt,
      completionDigest: bookingLifecycleEvents.canonicalDigest,
      reserveBps: financeRiskPolicyVersions.reserveBps,
      holdDurationHours: financeRiskPolicyVersions.holdDurationHours,
      settlementRequired: financeRiskPolicyVersions.providerSettlementRequired
    })
    .from(financeOnlineSaleCaptureRootLots)
    .innerJoin(
      financeOnlineSaleCaptureReceipts,
      eq(financeOnlineSaleCaptureReceipts.receiptId, financeOnlineSaleCaptureRootLots.receiptId)
    )
    .innerJoin(
      financeOnlineSaleCaptureAuthorityBindings,
      eq(
        financeOnlineSaleCaptureAuthorityBindings.receiptId,
        financeOnlineSaleCaptureReceipts.receiptId
      )
    )
    .innerJoin(
      financeRiskPolicyVersions,
      and(
        eq(
          financeRiskPolicyVersions.policyId,
          financeOnlineSaleCaptureAuthorityBindings.riskPolicyId
        ),
        eq(
          financeRiskPolicyVersions.policyVersion,
          financeOnlineSaleCaptureAuthorityBindings.riskPolicyVersion
        ),
        eq(
          financeRiskPolicyVersions.canonicalDigest,
          financeOnlineSaleCaptureAuthorityBindings.riskPolicyDigest
        )
      )
    )
    .innerJoin(orders, sql`${orders.id}::text = ${financeOnlineSaleCaptureReceipts.orderId}`)
    .innerJoin(bookings, eq(bookings.id, orders.bookingId))
    .innerJoin(
      bookingLifecycleEvents,
      and(
        eq(bookingLifecycleEvents.bookingId, bookings.id),
        eq(bookingLifecycleEvents.ownerUserId, bookings.ownerUserId),
        eq(bookingLifecycleEvents.revision, bookings.lifecycleRevision)
      )
    )
    .where(eq(financeOnlineSaleCaptureRootLots.lotId, rootLotId))
    .limit(2)
    .for("share");
  if (!context || !isEligibleContext(context, head, now)) return ineligible(rootLotId, head);

  const exception = await transaction
    .select({ id: reconciliationRecords.id })
    .from(reconciliationRecords)
    .where(
      and(
        eq(reconciliationRecords.providerPaymentId, context.providerPaymentId),
        eq(reconciliationRecords.status, "exception"),
        isNull(reconciliationRecords.resolvedAt)
      )
    )
    .limit(1)
    .for("share");
  if (exception.length > 0) return ineligible(rootLotId, head);
  const [settlement] = await transaction
    .select({ receiptId: financeMerchantPayoutPaymentInclusions.receiptId })
    .from(financeMerchantPayoutPaymentInclusions)
    .where(eq(financeMerchantPayoutPaymentInclusions.captureFactId, context.captureFactId))
    .limit(2)
    .for("share");
  if (context.settlementRequired && !settlement) return ineligible(rootLotId, head);

  const amountMinor = numericMinor(context.rootAmountMinor);
  const journal = createOnlineWalletHoldReleaseJournal({
    rootLotId,
    orderId: context.orderId,
    astrologerUserId: context.astrologerUserId,
    payableAmountMinor: amountMinor,
    reserveBps: context.reserveBps,
    occurredAt: now,
    postedAt: now
  });
  const journalReceipt = await writeOnlineWalletAstrologerJournal(transaction, {
    journal,
    astrologerUserId: context.astrologerUserId
  });
  const mutationId = randomUUID();
  const consumptionId = randomUUID();
  const nextWalletRevision = (BigInt(head.revision) + 1n).toString();
  const commitmentDigest = digestFinanceCanonicalValueV1({
    kind: "online_wallet_mutation",
    version: 2,
    mutationId,
    operationKind: "hold_release",
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    previousCommitmentDigest: head.lastCommitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    rootLotId,
    bookingLifecycleEventId: context.completionEventId,
    bookingCompletionDigest: context.completionDigest,
    merchantPayoutInclusionReceiptId: settlement?.receiptId ?? null
  });
  await transaction.insert(financeOnlineWalletMutations).values({
    mutationId,
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    operationKind: "hold_release",
    previousCommitmentDigest: head.lastCommitmentDigest,
    commitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: instant(now),
    committedAt: instant(now)
  });
  await transaction.insert(financeOnlinePayableSourceConsumptions).values({
    consumptionId,
    mutationId,
    rootLotId,
    walletId: head.id,
    sourceKind: "root",
    sourceAllocationId: null,
    disposedMinor: "0",
    dispositionKind: "none"
  });
  const releasePlan = createOnlineWalletHoldReleasePlan({
    payableAmountMinor: amountMinor,
    reserveBps: context.reserveBps
  });
  const outputs = [
    ...(releasePlan.availableMinor > 0
      ? [{ allocationId: `online-wallet-available:${randomUUID()}`, amountMinor: releasePlan.availableMinor, bucket: "available" as const }]
      : []),
    ...(releasePlan.reservedMinor > 0
      ? [{ allocationId: `online-wallet-reserved:${randomUUID()}`, amountMinor: releasePlan.reservedMinor, bucket: "reserved" as const }]
      : [])
  ];
  await transaction.insert(financeOnlinePayableSourceAllocations).values(
    outputs.map((output) => ({
      allocationId: output.allocationId,
      rootLotId,
      walletId: head.id,
      amountMinor: String(output.amountMinor),
      bucket: output.bucket,
      returnBucket: null,
      sourceConsumptionId: consumptionId
    }))
  );
  await transaction.insert(financeOnlineWalletHoldReleaseEvidence).values({
    mutationId,
    rootLotId,
    orderId: context.orderId,
    bookingId: context.bookingId,
    astrologerUserId: context.astrologerUserId,
    bookingLifecycleEventId: context.completionEventId,
    bookingLifecycleRevision: String(context.completionRevision),
    completedAt: context.completionOccurredAt,
    bookingCompletionDigest: context.completionDigest,
    merchantPayoutInclusionReceiptId: settlement?.receiptId ?? null
  });
  const [updated] = await transaction
    .update(financeOnlineWalletHeads)
    .set({
      revision: nextWalletRevision,
      pendingMinor: (BigInt(head.pendingMinor) - BigInt(amountMinor)).toString(),
      availableMinor: (BigInt(head.availableMinor) + BigInt(releasePlan.availableMinor)).toString(),
      reservedMinor: (BigInt(head.reservedMinor) + BigInt(releasePlan.reservedMinor)).toString(),
      lastCommitmentId: mutationId,
      lastCommitmentDigest: commitmentDigest
    })
    .where(
      and(
        eq(financeOnlineWalletHeads.id, head.id),
        eq(financeOnlineWalletHeads.revision, head.revision),
        eq(financeOnlineWalletHeads.lastCommitmentDigest, head.lastCommitmentDigest)
      )
    )
    .returning({ id: financeOnlineWalletHeads.id });
  if (!updated) throw new OnlineWalletHoldReleasePersistenceError();
  return Object.freeze({
    kind: "online_wallet_hold_release_commit_receipt",
    effect: "applied_once",
    rootLotId,
    walletId: head.id,
    walletRevision: nextWalletRevision,
    mutationId,
    journalTransactionId: journalReceipt.journalTransactionId
  });
}

async function readConsumedRoot(
  transaction: FinanceTransaction,
  rootLotId: string
): Promise<OnlineWalletHoldReleaseCommitReceipt | null> {
  const [row] = await transaction
    .select({
      rootLotId: financeOnlinePayableSourceConsumptions.rootLotId,
      walletId: financeOnlineWalletMutations.walletId,
      walletRevision: financeOnlineWalletMutations.nextWalletRevision,
      mutationId: financeOnlineWalletMutations.mutationId,
      journalTransactionId: financeOnlineWalletMutations.journalTransactionId,
      operationKind: financeOnlineWalletMutations.operationKind
    })
    .from(financeOnlinePayableSourceConsumptions)
    .innerJoin(
      financeOnlineWalletMutations,
      eq(financeOnlineWalletMutations.mutationId, financeOnlinePayableSourceConsumptions.mutationId)
    )
    .where(
      and(
        eq(financeOnlinePayableSourceConsumptions.rootLotId, rootLotId),
        eq(financeOnlinePayableSourceConsumptions.sourceKind, "root")
      )
    )
    .limit(2)
    .for("share");
  if (!row) return null;
  if (row.operationKind !== "hold_release") {
    return ineligible(rootLotId, { id: row.walletId, revision: row.walletRevision });
  }
  return Object.freeze({
    kind: "online_wallet_hold_release_commit_receipt",
    effect: "replayed",
    rootLotId: row.rootLotId,
    walletId: row.walletId,
    walletRevision: row.walletRevision,
    mutationId: row.mutationId,
    journalTransactionId: row.journalTransactionId
  });
}

function isEligibleContext(
  context: {
    astrologerUserId: string;
    rootCurrency: string;
    rootBucket: string;
    rootStatus: string;
    bookingOwnerUserId: string;
    bookingState: string;
    bookingRevision: number;
    completionEventKind: string;
    completionRevision: number;
    completionOccurredAt: Date;
    holdDurationHours: number;
  },
  head: typeof financeOnlineWalletHeads.$inferSelect,
  now: string
): boolean {
  if (
    context.astrologerUserId !== head.astrologerUserId ||
    context.rootCurrency !== "RUB" ||
    context.rootBucket !== "pending" ||
    context.rootStatus !== "active" ||
    context.bookingOwnerUserId !== context.astrologerUserId ||
    context.bookingState !== "completed" ||
    context.completionEventKind !== "completed" ||
    context.bookingRevision !== context.completionRevision
  ) {
    return false;
  }
  const holdEndsAt = context.completionOccurredAt.getTime() + context.holdDurationHours * 3_600_000;
  return Number.isFinite(holdEndsAt) && instant(now).getTime() >= holdEndsAt;
}

function ineligible(
  rootLotId: string,
  head: Readonly<{ id: string; revision: string }>
): OnlineWalletHoldReleaseCommitReceipt {
  return Object.freeze({
    kind: "online_wallet_hold_release_commit_receipt",
    effect: "ineligible",
    rootLotId,
    walletId: head.id,
    walletRevision: head.revision,
    mutationId: null,
    journalTransactionId: null
  });
}

function instant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new OnlineWalletHoldReleasePersistenceError();
  return date;
}

function numericMinor(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new OnlineWalletHoldReleasePersistenceError();
  return result;
}
