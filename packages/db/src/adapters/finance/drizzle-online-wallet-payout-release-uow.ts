import { randomUUID } from "node:crypto";

import {
  createOnlineWalletPayoutReleaseJournal,
  createOnlineWalletPayoutStateTransitionPlan,
  digestFinanceCanonicalValueV1,
  type OnlineWalletPayoutReleaseCommitReceipt,
  type OnlineWalletPayoutReleaseUnitOfWork,
  type ReleaseOnlineWalletPayoutCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import {
  financeOnlinePayoutRequests,
  financeOnlinePayoutStateTransitions
} from "../../schema/finance/online-payouts.schema";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlinePayableSourceConsumptions,
  financeOnlineWalletMutations
} from "../../schema/finance/online-wallet-mutations.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletAstrologerJournal } from "./drizzle-online-wallet-journal-writer";

export class OnlineWalletPayoutReleasePersistenceError extends Error {
  readonly code = "online_wallet_payout_release_persistence_error";

  constructor(
    readonly reason:
      | "invalid_command"
      | "payout_not_found"
      | "payout_version_conflict"
      | "payout_transition_invalid"
      | "payout_release_sources_invalid"
      | "authority_replay_conflict"
      | "wallet_commit_conflict"
      | "persistence_write_incomplete"
      | "retryable_concurrency_conflict"
  ) {
    super("Online wallet payout release could not be persisted atomically");
    this.name = "OnlineWalletPayoutReleasePersistenceError";
  }
}

type NormalizedCommand = ReleaseOnlineWalletPayoutCommand &
  Readonly<{ actorKind: "user" | "system" }>;
type PendingSource = Readonly<{
  payoutPendingAllocationId: string;
  rootLotId: string;
  amountMinor: string;
  orderId: string;
}>;

/**
 * Records only a confirmed no-transfer result. It atomically moves every exact payout-pending
 * source position back to available, seals the generic journal, advances the wallet commitment,
 * and appends the terminal payout transition. It intentionally does not model a bank debit.
 */
export function createDrizzleOnlineWalletPayoutReleaseUnitOfWork(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutReleaseUnitOfWork {
  return Object.freeze({
    async releaseOnlineWalletPayout(command) {
      try {
        return await input.database.transaction((transaction) =>
          releaseOnlineWalletPayoutInTransaction(transaction, command)
        );
      } catch (error) {
        if (error instanceof OnlineWalletPayoutReleasePersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletPayoutReleaseUnitOfWork);
}

/** Composition hook for a provider-authoritative transaction that has already locked its case. */
export async function releaseOnlineWalletPayoutInTransaction(
  transaction: FinanceTransaction,
  command: ReleaseOnlineWalletPayoutCommand
): Promise<OnlineWalletPayoutReleaseCommitReceipt> {
  return persist(transaction, normalize(command));
}

function normalize(command: ReleaseOnlineWalletPayoutCommand): NormalizedCommand {
  const actorKind = command.actorKind ?? "user";
  if (
    !identifier(command.payoutRequestId, 160) ||
    !positiveRevision(command.expectedPayoutVersion) ||
    !(
      (actorKind === "user" && command.actorUserId !== null && uuid(command.actorUserId)) ||
      (actorKind === "system" && command.actorUserId === null)
    ) ||
    !identifier(command.authority.authorityId, 200) ||
    !positiveRevision(command.authority.authorityVersion) ||
    !digest(command.authority.authorityDigest) ||
    !instant(command.occurredAt)
  ) {
    fail("invalid_command");
  }
  if (command.nextStatus !== "rejected" && command.nextStatus !== "cancelled" && command.nextStatus !== "failed") {
    fail("invalid_command");
  }
  if (
    (command.nextStatus === "rejected" || command.nextStatus === "failed") &&
    !boundedText(command.failureReason, 1, 2000)
  ) {
    fail("invalid_command");
  }
  if (command.nextStatus === "cancelled" && command.failureReason !== null) fail("invalid_command");
  if (command.adminNote !== null && !boundedText(command.adminNote, 1, 2000)) fail("invalid_command");
  return Object.freeze({ ...command, actorKind });
}

async function persist(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<OnlineWalletPayoutReleaseCommitReceipt> {
  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("update");
  if (!payout) fail("payout_not_found");
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${payout.walletId}, 0))`);
  const [head] = await transaction
    .select()
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, payout.walletId))
    .limit(2)
    .for("update");
  if (
    !head ||
    head.astrologerUserId !== payout.astrologerUserId ||
    head.currency !== "RUB" ||
    !head.lastCommitmentDigest
  ) {
    fail("payout_release_sources_invalid");
  }

  const replay = await readReplay(transaction, command, payout, head);
  if (replay) return replay;
  if (payout.version !== command.expectedPayoutVersion) fail("payout_version_conflict");
  let statePlan: ReturnType<typeof createOnlineWalletPayoutStateTransitionPlan>;
  try {
    statePlan = createOnlineWalletPayoutStateTransitionPlan({
      payoutRequestId: payout.id,
      previousStatus: payout.status as Parameters<typeof createOnlineWalletPayoutStateTransitionPlan>[0]["previousStatus"],
      expectedVersion: payout.version,
      nextStatus: command.nextStatus
    });
  } catch {
    fail("payout_transition_invalid");
  }

  const sources = await readPendingSources(transaction, payout.id, payout.walletId);
  const total = sources.reduce((sum, source) => sum + BigInt(source.amountMinor), 0n);
  if (total !== BigInt(payout.immutableAmountMinor) || total <= 0n) fail("payout_release_sources_invalid");
  const journal = createOnlineWalletPayoutReleaseJournal({
    payoutRequestId: payout.id,
    astrologerUserId: payout.astrologerUserId,
    occurredAt: command.occurredAt,
    postedAt: command.occurredAt,
    pendingSources: sources.map((source) => ({
      ...source,
      amountMinor: safePositiveMinor(source.amountMinor)
    }))
  });
  const journalReceipt = await writeOnlineWalletAstrologerJournal(transaction, {
    journal,
    astrologerUserId: payout.astrologerUserId
  });
  const mutationId = randomUUID();
  const nextWalletRevision = (BigInt(head.revision) + 1n).toString();
  const commitmentDigest = digestFinanceCanonicalValueV1({
    kind: "online_wallet_mutation",
    version: 2,
    mutationId,
    operationKind: "payout_returned_reserved",
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    previousCommitmentDigest: head.lastCommitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    payoutRequestId: payout.id,
    sourceAllocationIds: sources.map((source) => source.payoutPendingAllocationId)
  });
  await transaction.insert(financeOnlineWalletMutations).values({
    mutationId,
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    operationKind: "payout_returned_reserved",
    previousCommitmentDigest: head.lastCommitmentDigest,
    commitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: instant(command.occurredAt),
    committedAt: instant(command.occurredAt)
  });
  const consumptionRows = sources.map((source) => ({
    consumptionId: randomUUID(),
    mutationId,
    rootLotId: source.rootLotId,
    walletId: head.id,
    sourceKind: "allocation" as const,
    sourceAllocationId: source.payoutPendingAllocationId,
    disposedMinor: "0",
    dispositionKind: "none" as const
  }));
  await transaction.insert(financeOnlinePayableSourceConsumptions).values(consumptionRows);
  await transaction.insert(financeOnlinePayableSourceAllocations).values(
    sources.map((source, index) => ({
      allocationId: `online-wallet-available:${randomUUID()}`,
      rootLotId: source.rootLotId,
      walletId: head.id,
      amountMinor: source.amountMinor,
      bucket: "available" as const,
      returnBucket: null,
      sourceConsumptionId: consumptionRows[index]!.consumptionId
    }))
  );
  await transaction.insert(financeOnlinePayoutStateTransitions).values({
    payoutRequestId: payout.id,
    payoutVersion: statePlan.nextVersion,
    previousStatus: statePlan.previousStatus,
    status: command.nextStatus,
    transitionKind: statePlan.transitionKind,
    actorKind: command.actorKind,
    actorUserId: command.actorUserId,
    authorityId: command.authority.authorityId,
    authorityVersion: command.authority.authorityVersion,
    authorityDigest: command.authority.authorityDigest,
    adminNote: command.adminNote,
    failureReason: command.failureReason,
    occurredAt: instant(command.occurredAt),
    createdAt: instant(command.occurredAt)
  });
  const [updatedPayout] = await transaction
    .update(financeOnlinePayoutRequests)
    .set({ status: command.nextStatus, version: statePlan.nextVersion, updatedAt: instant(command.occurredAt) })
    .where(
      and(
        eq(financeOnlinePayoutRequests.id, payout.id),
        eq(financeOnlinePayoutRequests.status, statePlan.previousStatus),
        eq(financeOnlinePayoutRequests.version, statePlan.expectedVersion)
      )
    )
    .returning({ id: financeOnlinePayoutRequests.id });
  if (!updatedPayout) fail("payout_version_conflict");
  const [updatedHead] = await transaction
    .update(financeOnlineWalletHeads)
    .set({
      revision: nextWalletRevision,
      availableMinor: (BigInt(head.availableMinor) + total).toString(),
      payoutPendingMinor: (BigInt(head.payoutPendingMinor) - total).toString(),
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
  if (!updatedHead) fail("wallet_commit_conflict");
  return Object.freeze({
    kind: "online_wallet_payout_release_commit_receipt",
    effect: "applied_once",
    payoutRequestId: payout.id,
    previousStatus: statePlan.previousStatus,
    status: command.nextStatus,
    payoutVersion: statePlan.nextVersion,
    walletId: head.id,
    walletRevision: nextWalletRevision,
    mutationId,
    journalTransactionId: journalReceipt.journalTransactionId
  });
}

async function readPendingSources(
  transaction: FinanceTransaction,
  payoutRequestId: string,
  walletId: string
): Promise<readonly PendingSource[]> {
  const rows = await transaction.execute<PendingSource>(sql`
    select mapping.payout_pending_allocation_id as "payoutPendingAllocationId",
           mapping.root_lot_id as "rootLotId", pending.amount_minor::text as "amountMinor",
           receipt.order_id as "orderId"
      from finance_online_payout_request_allocations mapping
      join finance_online_payable_source_allocations pending
        on pending.allocation_id = mapping.payout_pending_allocation_id
      join finance_online_sale_capture_root_lots root on root.lot_id = mapping.root_lot_id
      join finance_online_sale_capture_receipts receipt on receipt.receipt_id = root.receipt_id
     where mapping.payout_request_id = ${payoutRequestId}
       and pending.wallet_id = ${walletId}
       and pending.bucket = 'payout_pending'
       and pending.return_bucket = 'available'
       and not exists (
         select 1 from finance_online_payable_source_consumptions consumption
          where consumption.source_kind = 'allocation'
            and consumption.source_allocation_id = pending.allocation_id
       )
     order by mapping.ordinal
     for update of pending
  `);
  return Object.freeze(rows.rows.map((row) => Object.freeze(row)));
}

async function readReplay(
  transaction: FinanceTransaction,
  command: NormalizedCommand,
  payout: typeof financeOnlinePayoutRequests.$inferSelect,
  head: typeof financeOnlineWalletHeads.$inferSelect
): Promise<OnlineWalletPayoutReleaseCommitReceipt | null> {
  const [transition] = await transaction
    .select()
    .from(financeOnlinePayoutStateTransitions)
    .where(
      and(
        eq(financeOnlinePayoutStateTransitions.authorityId, command.authority.authorityId),
        eq(financeOnlinePayoutStateTransitions.authorityVersion, command.authority.authorityVersion),
        eq(financeOnlinePayoutStateTransitions.authorityDigest, command.authority.authorityDigest)
      )
    )
    .limit(2)
    .for("share");
  if (!transition) return null;
  if (
    transition.payoutRequestId !== payout.id ||
    transition.status !== command.nextStatus ||
    transition.actorKind !== command.actorKind ||
    transition.actorUserId !== command.actorUserId ||
    transition.failureReason !== command.failureReason ||
    transition.adminNote !== command.adminNote ||
    transition.previousStatus === null
  ) {
    fail("authority_replay_conflict");
  }
  const [mutation] = await transaction
    .select()
    .from(financeOnlineWalletMutations)
    .where(
      and(
        eq(financeOnlineWalletMutations.walletId, head.id),
        eq(financeOnlineWalletMutations.operationKind, "payout_returned_reserved"),
        eq(financeOnlineWalletMutations.nextWalletRevision, head.revision)
      )
    )
    .limit(2)
    .for("share");
  if (!mutation) fail("authority_replay_conflict");
  return Object.freeze({
    kind: "online_wallet_payout_release_commit_receipt",
    effect: "replayed",
    payoutRequestId: payout.id,
    previousStatus: transition.previousStatus as OnlineWalletPayoutReleaseCommitReceipt["previousStatus"],
    status: command.nextStatus,
    payoutVersion: transition.payoutVersion,
    walletId: head.id,
    walletRevision: mutation.nextWalletRevision,
    mutationId: mutation.mutationId,
    journalTransactionId: mutation.journalTransactionId
  });
}

function identifier(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maximum;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function positiveRevision(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function digest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function boundedText(value: string | null, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length >= minimum && value.length <= maximum;
}

function safePositiveMinor(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) fail("payout_release_sources_invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail("payout_release_sources_invalid");
  return parsed;
}

function instant(value: string): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) fail("invalid_command");
  return result;
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: ConstructorParameters<typeof OnlineWalletPayoutReleasePersistenceError>[0]): never {
  throw new OnlineWalletPayoutReleasePersistenceError(reason);
}
