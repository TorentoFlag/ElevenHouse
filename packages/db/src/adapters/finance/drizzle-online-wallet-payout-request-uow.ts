import { randomUUID } from "node:crypto";

import {
  createOnlineWalletPayoutRequestJournal,
  createOnlineWalletPayoutRequestPlan,
  digestFinanceCanonicalValueV1,
  type CreateOnlineWalletPayoutRequestCommand,
  type OnlineWalletPayoutRequestCommitReceipt,
  type OnlineWalletPayoutRequestUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import {
  financeOnlinePayoutRequestAllocations,
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

export class OnlineWalletPayoutRequestPersistenceError extends Error {
  readonly code = "online_wallet_payout_request_persistence_error";

  constructor(
    readonly reason:
      | "invalid_command"
      | "wallet_scope_mismatch"
      | "payout_method_mismatch"
      | "insufficient_available_balance"
      | "payout_request_conflict"
      | "wallet_commit_conflict"
      | "persistence_write_incomplete"
      | "retryable_concurrency_conflict"
  ) {
    super("Online wallet payout request could not be persisted atomically");
    this.name = "OnlineWalletPayoutRequestPersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  payoutRequestId: string;
  walletId: string;
  astrologerUserId: string;
  amountMinor: number;
  destination: CreateOnlineWalletPayoutRequestCommand["destination"];
  requestAuthority: CreateOnlineWalletPayoutRequestCommand["requestAuthority"];
  occurredAt: string;
}>;

type AvailableSourceRow = Readonly<{
  allocationId: string;
  rootLotId: string;
  amountMinor: string;
  orderId: string;
}>;

/**
 * Performs the one financially meaningful request-time move: selected v2 available source
 * positions become immutable payout-pending children. It performs no bank I/O; a later manual
 * execution confirmation owns the transfer fact.
 */
export function createDrizzleOnlineWalletPayoutRequestUnitOfWork(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutRequestUnitOfWork {
  return Object.freeze({
    async createOnlineWalletPayoutRequest(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) => persist(transaction, normalized));
      } catch (error) {
        if (error instanceof OnlineWalletPayoutRequestPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletPayoutRequestUnitOfWork);
}

function normalizeCommand(command: CreateOnlineWalletPayoutRequestCommand): NormalizedCommand {
  if (
    !identifier(command.payoutRequestId, 160) ||
    !uuid(command.walletId) ||
    !uuid(command.astrologerUserId)
  ) {
    fail("invalid_command");
  }
  if (command.currency !== "RUB") fail("invalid_command");
  const amountMinor = safePositiveMinor(command.amountMinor);
  const occurredAt = instant(command.occurredAt);
  const destination = command.destination;
  if (
    destination.kind !== "sealed_payout_destination_snapshot" ||
    !uuid(destination.payoutMethodId) ||
    !Number.isSafeInteger(destination.payoutMethodVersion) ||
    destination.payoutMethodVersion <= 0 ||
    (destination.destinationKind !== "bank_card" && destination.destinationKind !== "bank_account") ||
    !digest(destination.beneficiaryFingerprint) ||
    !boundedText(destination.redactedDisplay, 8, 180) ||
    !boundedText(destination.sealedDestinationRef, 12, 4096)
  ) {
    fail("invalid_command");
  }
  const requestAuthority = command.requestAuthority;
  if (
    !identifier(requestAuthority.authorityId, 200) ||
    !positiveRevision(requestAuthority.authorityVersion) ||
    !digest(requestAuthority.authorityDigest)
  ) {
    fail("invalid_command");
  }
  return Object.freeze({
    payoutRequestId: command.payoutRequestId,
    walletId: command.walletId,
    astrologerUserId: command.astrologerUserId,
    amountMinor,
    destination,
    requestAuthority,
    occurredAt: occurredAt.toISOString()
  });
}

async function persist(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<OnlineWalletPayoutRequestCommitReceipt> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${command.walletId}, 0))`
  );
  const [head] = await transaction
    .select()
    .from(financeOnlineWalletHeads)
    .where(eq(financeOnlineWalletHeads.id, command.walletId))
    .limit(2)
    .for("update");
  if (
    !head ||
    head.astrologerUserId !== command.astrologerUserId ||
    head.currency !== "RUB" ||
    !head.lastCommitmentDigest
  ) {
    fail("wallet_scope_mismatch");
  }
  const previousCommitmentDigest = head.lastCommitmentDigest;

  const replay = await readReplay(transaction, command, head);
  if (replay) return replay;
  await assertPayoutMethod(transaction, command);

  const availableSources = await readAvailableSources(transaction, command.walletId);
  let plan: ReturnType<typeof createOnlineWalletPayoutRequestPlan>;
  try {
    plan = createOnlineWalletPayoutRequestPlan({
      payoutRequestId: command.payoutRequestId,
      amountMinor: command.amountMinor,
      availableSources: availableSources.map((source) => ({
        allocationId: source.allocationId,
        rootLotId: source.rootLotId,
        amountMinor: safePositiveMinor(source.amountMinor)
      }))
    });
  } catch {
    fail("insufficient_available_balance");
  }
  const sourcesByAllocation = new Map(availableSources.map((source) => [source.allocationId, source]));
  const journal = createOnlineWalletPayoutRequestJournal({
    payoutRequestId: command.payoutRequestId,
    astrologerUserId: command.astrologerUserId,
    occurredAt: command.occurredAt,
    postedAt: command.occurredAt,
    consumptions: plan.consumptions.map((consumption) => {
      const source = sourcesByAllocation.get(consumption.allocationId);
      if (!source) fail("persistence_write_incomplete");
      return { ...consumption, orderId: source.orderId };
    })
  });
  const journalReceipt = await writeOnlineWalletAstrologerJournal(transaction, {
    journal,
    astrologerUserId: command.astrologerUserId
  });
  const mutationId = randomUUID();
  const nextWalletRevision = (BigInt(head.revision) + 1n).toString();
  const commitmentDigest = digestFinanceCanonicalValueV1({
    kind: "online_wallet_mutation",
    version: 2,
    mutationId,
    operationKind: "payout_requested",
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    previousCommitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    journalTransactionDigest: journalReceipt.canonicalDigest,
    payoutRequestId: command.payoutRequestId,
    amountMinor: String(command.amountMinor),
    allocationIds: plan.consumptions.map((consumption) => consumption.allocationId)
  });
  await transaction.insert(financeOnlineWalletMutations).values({
    mutationId,
    walletId: head.id,
    expectedWalletRevision: head.revision,
    nextWalletRevision,
    operationKind: "payout_requested",
    previousCommitmentDigest,
    commitmentDigest,
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: instant(command.occurredAt),
    committedAt: instant(command.occurredAt)
  });

  const consumptionRows = plan.consumptions.map((consumption) => ({
    consumptionId: randomUUID(),
    mutationId,
    rootLotId: consumption.rootLotId,
    walletId: head.id,
    sourceKind: "allocation" as const,
    sourceAllocationId: consumption.allocationId,
    disposedMinor: "0",
    dispositionKind: "none" as const
  }));
  await transaction.insert(financeOnlinePayableSourceConsumptions).values(consumptionRows);
  const outputs = plan.consumptions.flatMap((consumption, ordinal) => {
    const sourceConsumption = consumptionRows[ordinal];
    if (!sourceConsumption) fail("persistence_write_incomplete");
    return [
      {
        allocationId: consumption.payoutAllocationId,
        rootLotId: consumption.rootLotId,
        walletId: head.id,
        amountMinor: String(consumption.payoutPendingMinor),
        bucket: "payout_pending" as const,
        returnBucket: "available" as const,
        sourceConsumptionId: sourceConsumption.consumptionId
      },
      ...(consumption.availableRemainderMinor > 0
        ? [
            {
              allocationId: `online-wallet-available:${randomUUID()}`,
              rootLotId: consumption.rootLotId,
              walletId: head.id,
              amountMinor: String(consumption.availableRemainderMinor),
              bucket: "available" as const,
              returnBucket: null,
              sourceConsumptionId: sourceConsumption.consumptionId
            }
          ]
        : [])
    ];
  });
  await transaction.insert(financeOnlinePayableSourceAllocations).values(outputs);
  await transaction.insert(financeOnlinePayoutRequests).values({
    id: command.payoutRequestId,
    authorizationAggregateId: randomUUID(),
    walletId: head.id,
    walletMutationId: mutationId,
    astrologerUserId: command.astrologerUserId,
    currency: "RUB",
    immutableAmountMinor: String(command.amountMinor),
    status: "requested",
    version: "1",
    payoutMethodId: command.destination.payoutMethodId,
    payoutMethodVersion: command.destination.payoutMethodVersion,
    destinationKind: command.destination.destinationKind,
    beneficiaryFingerprint: command.destination.beneficiaryFingerprint,
    redactedDisplay: command.destination.redactedDisplay,
    sealedDestinationRef: command.destination.sealedDestinationRef,
    requestedAt: instant(command.occurredAt),
    createdAt: instant(command.occurredAt),
    updatedAt: instant(command.occurredAt)
  });
  await transaction.insert(financeOnlinePayoutStateTransitions).values({
    payoutRequestId: command.payoutRequestId,
    payoutVersion: "1",
    previousStatus: null,
    status: "requested",
    transitionKind: "requested",
    actorUserId: command.astrologerUserId,
    authorityId: command.requestAuthority.authorityId,
    authorityVersion: command.requestAuthority.authorityVersion,
    authorityDigest: command.requestAuthority.authorityDigest,
    occurredAt: instant(command.occurredAt),
    createdAt: instant(command.occurredAt)
  });
  await transaction.insert(financeOnlinePayoutRequestAllocations).values(
    plan.consumptions.map((consumption, ordinal) => ({
      payoutRequestId: command.payoutRequestId,
      sourceAllocationId: consumption.allocationId,
      payoutPendingAllocationId: consumption.payoutAllocationId,
      rootLotId: consumption.rootLotId,
      amountMinor: String(consumption.payoutPendingMinor),
      ordinal
    }))
  );
  const [updated] = await transaction
    .update(financeOnlineWalletHeads)
    .set({
      revision: nextWalletRevision,
      availableMinor: (BigInt(head.availableMinor) - BigInt(command.amountMinor)).toString(),
      payoutPendingMinor: (BigInt(head.payoutPendingMinor) + BigInt(command.amountMinor)).toString(),
      lastCommitmentId: mutationId,
      lastCommitmentDigest: commitmentDigest
    })
    .where(
      and(
        eq(financeOnlineWalletHeads.id, head.id),
        eq(financeOnlineWalletHeads.revision, head.revision),
        eq(financeOnlineWalletHeads.lastCommitmentDigest, previousCommitmentDigest)
      )
    )
    .returning({ id: financeOnlineWalletHeads.id });
  if (!updated) fail("wallet_commit_conflict");
  return Object.freeze({
    kind: "online_wallet_payout_request_commit_receipt",
    effect: "applied_once",
    payoutRequestId: command.payoutRequestId,
    walletId: head.id,
    walletRevision: nextWalletRevision,
    payoutVersion: "1",
    mutationId,
    journalTransactionId: journalReceipt.journalTransactionId
  });
}

async function readReplay(
  transaction: FinanceTransaction,
  command: NormalizedCommand,
  head: typeof financeOnlineWalletHeads.$inferSelect
): Promise<OnlineWalletPayoutRequestCommitReceipt | null> {
  const [row] = await transaction
    .select({
      walletId: financeOnlinePayoutRequests.walletId,
      walletMutationId: financeOnlinePayoutRequests.walletMutationId,
      astrologerUserId: financeOnlinePayoutRequests.astrologerUserId,
      amountMinor: financeOnlinePayoutRequests.immutableAmountMinor,
      currency: financeOnlinePayoutRequests.currency,
      payoutMethodId: financeOnlinePayoutRequests.payoutMethodId,
      payoutMethodVersion: financeOnlinePayoutRequests.payoutMethodVersion,
      destinationKind: financeOnlinePayoutRequests.destinationKind,
      beneficiaryFingerprint: financeOnlinePayoutRequests.beneficiaryFingerprint,
      redactedDisplay: financeOnlinePayoutRequests.redactedDisplay,
      sealedDestinationRef: financeOnlinePayoutRequests.sealedDestinationRef,
      payoutVersion: financeOnlinePayoutRequests.version,
      walletRevision: financeOnlineWalletMutations.nextWalletRevision,
      journalTransactionId: financeOnlineWalletMutations.journalTransactionId,
      operationKind: financeOnlineWalletMutations.operationKind
    })
    .from(financeOnlinePayoutRequests)
    .innerJoin(
      financeOnlineWalletMutations,
      eq(financeOnlineWalletMutations.mutationId, financeOnlinePayoutRequests.walletMutationId)
    )
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("share");
  if (!row) return null;
  if (
    row.walletId !== command.walletId ||
    row.astrologerUserId !== command.astrologerUserId ||
    row.amountMinor !== String(command.amountMinor) ||
    row.currency !== "RUB" ||
    row.payoutMethodId !== command.destination.payoutMethodId ||
    row.payoutMethodVersion !== command.destination.payoutMethodVersion ||
    row.destinationKind !== command.destination.destinationKind ||
    row.beneficiaryFingerprint !== command.destination.beneficiaryFingerprint ||
    row.redactedDisplay !== command.destination.redactedDisplay ||
    row.sealedDestinationRef !== command.destination.sealedDestinationRef ||
    row.operationKind !== "payout_requested" ||
    head.id !== row.walletId
  ) {
    fail("payout_request_conflict");
  }
  return Object.freeze({
    kind: "online_wallet_payout_request_commit_receipt",
    effect: "replayed",
    payoutRequestId: command.payoutRequestId,
    walletId: row.walletId,
    walletRevision: row.walletRevision,
    payoutVersion: row.payoutVersion,
    mutationId: row.walletMutationId,
    journalTransactionId: row.journalTransactionId
  });
}

async function assertPayoutMethod(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<void> {
  const result = await transaction.execute<{
    ownerUserId: string;
    method: string;
    currency: string;
    methodVersion: string;
    destinationKind: string;
    beneficiaryFingerprint: string;
    redactedDisplay: string;
    sealedDestinationRef: string;
  }>(sql`
    select method.astrologer_user_id as "ownerUserId", method.method, method.currency,
           method.version as "methodVersion",
           version.destination_kind as "destinationKind",
           version.beneficiary_fingerprint as "beneficiaryFingerprint",
           version.redacted_display as "redactedDisplay",
           version.sealed_destination_ref as "sealedDestinationRef"
      from payout_methods method
      join payout_method_versions version
        on version.payout_method_id = method.id
       and version.version = ${command.destination.payoutMethodVersion}
     where method.id = ${command.destination.payoutMethodId}
     for share
  `);
  const row = result.rows[0];
  if (
    !row ||
    row.ownerUserId !== command.astrologerUserId ||
    row.method !== "manual_bank_transfer" ||
    row.currency !== "RUB" ||
    row.methodVersion !== String(command.destination.payoutMethodVersion) ||
    row.destinationKind !== command.destination.destinationKind ||
    row.beneficiaryFingerprint !== command.destination.beneficiaryFingerprint ||
    row.redactedDisplay !== command.destination.redactedDisplay ||
    row.sealedDestinationRef !== command.destination.sealedDestinationRef
  ) {
    fail("payout_method_mismatch");
  }
}

async function readAvailableSources(
  transaction: FinanceTransaction,
  walletId: string
): Promise<readonly AvailableSourceRow[]> {
  const result = await transaction.execute<AvailableSourceRow>(sql`
    select allocation.allocation_id as "allocationId", allocation.root_lot_id as "rootLotId",
           allocation.amount_minor::text as "amountMinor", receipt.order_id as "orderId"
      from finance_online_payable_source_allocations allocation
      join finance_online_sale_capture_root_lots root on root.lot_id = allocation.root_lot_id
      join finance_online_sale_capture_receipts receipt on receipt.receipt_id = root.receipt_id
     where allocation.wallet_id = ${walletId}
       and allocation.bucket = 'available'
       and not exists (
         select 1 from finance_online_payable_source_consumptions consumption
          where consumption.source_kind = 'allocation'
            and consumption.source_allocation_id = allocation.allocation_id
       )
       -- A provider-authoritative chargeback freezes only its exact captured source. Other
       -- available client orders remain payable; a later principal-allocation decision may not
       -- be bypassed by moving this root into payout-pending.
       and not exists (
         select 1 from finance_online_wallet_chargeback_cases chargeback
          where chargeback.wallet_id = allocation.wallet_id
            and chargeback.root_lot_id = allocation.root_lot_id
            and chargeback.status = 'provisional_loss'
       )
     order by allocation.allocation_id
     for update of allocation
  `);
  return Object.freeze(result.rows.map((row) => Object.freeze(row)));
}

function identifier(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maximum;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function digest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function boundedText(value: string, minimum: number, maximum: number): boolean {
  return value.trim() === value && value.length >= minimum && value.length <= maximum;
}

function positiveRevision(value: string): boolean {
  return /^(?:[1-9][0-9]*)$/.test(value);
}

function safePositiveMinor(value: string): number {
  if (!/^(?:[1-9][0-9]*)$/.test(value)) fail("invalid_command");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) fail("invalid_command");
  return number;
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

function fail(reason: ConstructorParameters<typeof OnlineWalletPayoutRequestPersistenceError>[0]): never {
  throw new OnlineWalletPayoutRequestPersistenceError(reason);
}
