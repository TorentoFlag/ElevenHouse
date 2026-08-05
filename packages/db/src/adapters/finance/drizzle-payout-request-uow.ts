import {
  digestFinanceCanonicalValueV1,
  type CreatePayoutRequestCommand,
  type PayoutRequestCommitReceipt,
  type PayoutRequestUnitOfWork
} from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financePayoutRequestAllocations,
  financePayoutRequests
} from "../../schema/finance/payouts.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  commitSealedWalletJournalMutationInTransaction,
  issuePersistenceTransactionBoundaryRef,
  SealedWalletJournalCommitPersistenceError
} from "./drizzle-sealed-wallet-journal-commit-uow";
import { prepareWalletJournalMutation } from "./wallet-row-mapper";

export type PayoutRequestPersistenceReason =
  | "invalid_command"
  | "payout_authority_mismatch"
  | "payout_allocation_mismatch"
  | "wallet_commit_conflict"
  | "payout_request_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class PayoutRequestPersistenceError extends Error {
  readonly code = "payout_request_persistence_error";

  constructor(readonly reason: PayoutRequestPersistenceReason) {
    super("Payout request could not be persisted atomically");
    this.name = "PayoutRequestPersistenceError";
  }
}

/**
 * Stores the immutable payout aggregate before sealing its authoritative wallet/journal move in
 * the same PostgreSQL transaction. This boundary deliberately has no ArcPay I/O: ArcPay is the
 * company acquiring rail and never the astrologer payout rail.
 */
export function createDrizzlePayoutRequestUnitOfWork(input: {
  readonly database: ElevenHouseDatabase;
}): PayoutRequestUnitOfWork {
  return Object.freeze({
    async createPayoutRequest(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) => persist(transaction, normalized));
      } catch (error) {
        if (error instanceof PayoutRequestPersistenceError) throw error;
        if (error instanceof SealedWalletJournalCommitPersistenceError)
          fail("wallet_commit_conflict");
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514")
          fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies PayoutRequestUnitOfWork);
}

type NormalizedCommand = ReturnType<typeof normalizeCommand>;

function normalizeCommand(command: CreatePayoutRequestCommand) {
  let prepared: ReturnType<typeof prepareWalletJournalMutation>;
  try {
    prepared = prepareWalletJournalMutation(command.walletJournalMutation);
  } catch {
    fail("invalid_command");
  }
  if (
    !sameIdentifier(command.payoutRequestId, prepared.operationId) ||
    !sameIdentifier(command.walletId, prepared.walletId) ||
    !sameIdentifier(command.astrologerUserId, prepared.astrologerUserId) ||
    command.expectedWalletRevision !== prepared.expectedWalletRevision ||
    command.currency !== prepared.currency ||
    command.operationEnvelope.policyId !==
      command.walletJournalMutation.operationEnvelope.policyId ||
    command.operationEnvelope.policyVersion !==
      command.walletJournalMutation.operationEnvelope.policyVersion ||
    command.operationEnvelope.policyDigest !==
      command.walletJournalMutation.operationEnvelope.policyDigest ||
    prepared.receipt.operationKind !== "payout_requested" ||
    prepared.receipt.sourceKey.kind !== "payout" ||
    prepared.receipt.sourceKey.operation !== "requested" ||
    prepared.receipt.sourceKey.sourceId !== command.payoutRequestId
  ) {
    fail("invalid_command");
  }

  const authority = prepared.authorities.filter(
    (value) => value.authorityKind === "payout_request"
  );
  if (authority.length !== 1 || !authority[0]) fail("payout_authority_mismatch");
  const payoutAuthority = authority[0];

  const allocations = prepared.effects
    .filter(
      (effect) =>
        effect.bucket === "payout_pending" &&
        effect.side === "credit" &&
        effect.payoutAllocationId !== null
    )
    .map((effect, ordinal) => {
      const lineage = prepared.lineage.find(
        (entry) => entry.relation === "created" && entry.lotId === effect.payableLotId
      );
      if (
        !lineage?.parentLotId ||
        lineage.amountMinor !== effect.amountMinor ||
        !effect.payoutAllocationId
      ) {
        fail("payout_allocation_mismatch");
      }
      return Object.freeze({
        payoutAllocationId: effect.payoutAllocationId,
        sourceLotId: lineage.parentLotId,
        payoutPendingLotId: effect.payableLotId,
        amountMinor: effect.amountMinor,
        ordinal
      });
    });
  if (
    allocations.length === 0 ||
    new Set(allocations.map((row) => row.payoutAllocationId)).size !== allocations.length
  ) {
    fail("payout_allocation_mismatch");
  }
  const total = allocations.reduce((sum, allocation) => sum + BigInt(allocation.amountMinor), 0n);
  if (
    total.toString() !== command.amountMinor ||
    command.amountMinor !== prepared.transaction.totalCreditMinor
  ) {
    fail("payout_allocation_mismatch");
  }
  const allocationSetDigest = digestFinanceCanonicalValueV1(
    [...allocations]
      .sort((left, right) => left.payoutAllocationId.localeCompare(right.payoutAllocationId))
      .map(({ payoutAllocationId, sourceLotId, payoutPendingLotId, amountMinor }) => ({
        payoutAllocationId,
        sourceLotId,
        payoutPendingLotId,
        amountMinor
      }))
  );
  return Object.freeze({ command, prepared, payoutAuthority, allocations, allocationSetDigest });
}

async function persist(
  transaction: FinanceTransaction,
  normalized: NormalizedCommand
): Promise<PayoutRequestCommitReceipt> {
  const { command, prepared, payoutAuthority, allocations, allocationSetDigest } = normalized;
  const now = new Date(prepared.receipt.occurredAt);
  if (!Number.isFinite(now.getTime())) fail("invalid_command");
  const [payout] = await transaction
    .insert(financePayoutRequests)
    .values({
      id: command.payoutRequestId,
      walletId: command.walletId,
      astrologerUserId: command.astrologerUserId,
      currency: command.currency,
      immutableAmountMinor: command.amountMinor,
      status: "requested",
      version: "1",
      payoutMethodId: command.destination.payoutMethodId,
      payoutMethodVersion: command.destination.payoutMethodVersion,
      destinationKind: command.destination.destinationKind,
      beneficiaryFingerprint: command.destination.beneficiaryFingerprint,
      redactedDisplay: command.destination.redactedDisplay,
      encryptedDestinationRef: command.destination.encryptedDestinationRef,
      payoutAuthorityId: payoutAuthority.authorityId,
      payoutAuthorityVersion: payoutAuthority.authorityVersion,
      payoutAuthorityDigest: payoutAuthority.canonicalDigest,
      allocationSetDigest,
      allocationCount: allocations.length,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    })
    .returning({ id: financePayoutRequests.id, version: financePayoutRequests.version });
  if (!payout || payout.id !== command.payoutRequestId || payout.version !== "1") {
    fail("payout_request_conflict");
  }
  await transaction.insert(financePayoutRequestAllocations).values(
    allocations.map((allocation) => ({
      payoutRequestId: command.payoutRequestId,
      ...allocation
    }))
  );
  const walletJournalCommitReceipt = await commitSealedWalletJournalMutationInTransaction(
    transaction,
    command.walletJournalMutation,
    null
  );
  const persistenceTransactionBoundaryRef =
    await issuePersistenceTransactionBoundaryRef(transaction);
  return Object.freeze({
    kind: "payout_request_commit_receipt" as const,
    payoutRequestId: command.payoutRequestId,
    payoutVersion: 1,
    immutableAmountMinor: command.amountMinor,
    currency: command.currency,
    beneficiaryFingerprint: command.destination.beneficiaryFingerprint,
    payoutAllocationSetDigest: allocationSetDigest,
    payoutAllocationCount: allocations.length,
    walletJournalCommitReceipt,
    persistenceTransactionBoundaryRef,
    committedAt: now.toISOString()
  }) as unknown as PayoutRequestCommitReceipt;
}

function sameIdentifier(value: string, expected: string): boolean {
  return value === expected && value.length > 0 && value === value.trim() && value.length <= 160;
}

function postgresCode(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<object>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function fail(reason: PayoutRequestPersistenceReason): never {
  throw new PayoutRequestPersistenceError(reason);
}
