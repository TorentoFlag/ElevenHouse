import {
  createOnlineWalletPayoutStateTransitionPlan,
  type OnlineWalletPayoutReviewCommitReceipt,
  type OnlineWalletPayoutReviewUnitOfWork,
  type TransitionOnlineWalletPayoutCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import {
  financeOnlinePayoutRequests,
  financeOnlinePayoutStateTransitions
} from "../../schema/finance/online-payouts.schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";

export class OnlineWalletPayoutReviewPersistenceError extends Error {
  readonly code = "online_wallet_payout_review_persistence_error";

  constructor(
    readonly reason:
      | "invalid_command"
      | "payout_not_found"
      | "payout_version_conflict"
      | "payout_transition_invalid"
      | "maker_checker_violation"
      | "authority_replay_conflict"
      | "persistence_write_incomplete"
      | "retryable_concurrency_conflict"
  ) {
    super("Online wallet payout review could not be persisted");
    this.name = "OnlineWalletPayoutReviewPersistenceError";
  }
}

type NormalizedCommand = TransitionOnlineWalletPayoutCommand;

/**
 * Review/approval has no wallet movement. It is still an optimistic, append-only transition so
 * the later manual execution command can bind itself to the exact reviewer/approver history.
 */
export function createDrizzleOnlineWalletPayoutReviewUnitOfWork(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutReviewUnitOfWork {
  return Object.freeze({
    async transitionOnlineWalletPayout(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => persist(transaction, normalized));
      } catch (error) {
        if (error instanceof OnlineWalletPayoutReviewPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletPayoutReviewUnitOfWork);
}

function normalize(command: TransitionOnlineWalletPayoutCommand): NormalizedCommand {
  if (
    !identifier(command.payoutRequestId, 160) ||
    !positiveRevision(command.expectedPayoutVersion) ||
    !uuid(command.actorUserId) ||
    !identifier(command.authority.authorityId, 200) ||
    !positiveRevision(command.authority.authorityVersion) ||
    !digest(command.authority.authorityDigest) ||
    (command.adminNote !== null && !boundedText(command.adminNote, 1, 2000)) ||
    !instant(command.occurredAt)
  ) {
    fail("invalid_command");
  }
  return command;
}

async function persist(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<OnlineWalletPayoutReviewCommitReceipt> {
  const [payout] = await transaction
    .select()
    .from(financeOnlinePayoutRequests)
    .where(eq(financeOnlinePayoutRequests.id, command.payoutRequestId))
    .limit(2)
    .for("update");
  if (!payout) fail("payout_not_found");

  const replay = await readAuthorityReplay(transaction, command);
  if (replay) return replay;
  if (payout.version !== command.expectedPayoutVersion) fail("payout_version_conflict");
  let plan: ReturnType<typeof createOnlineWalletPayoutStateTransitionPlan>;
  try {
    plan = createOnlineWalletPayoutStateTransitionPlan({
      payoutRequestId: payout.id,
      previousStatus: payout.status as Parameters<typeof createOnlineWalletPayoutStateTransitionPlan>[0]["previousStatus"],
      expectedVersion: payout.version,
      nextStatus: command.nextStatus
    });
  } catch {
    fail("payout_transition_invalid");
  }
  if (command.actorUserId === payout.astrologerUserId) fail("maker_checker_violation");
  if (command.nextStatus === "approved") {
    const [review] = await transaction
      .select({ actorUserId: financeOnlinePayoutStateTransitions.actorUserId })
      .from(financeOnlinePayoutStateTransitions)
      .where(
        and(
          eq(financeOnlinePayoutStateTransitions.payoutRequestId, payout.id),
          eq(financeOnlinePayoutStateTransitions.payoutVersion, payout.version),
          eq(financeOnlinePayoutStateTransitions.status, "under_review")
        )
      )
      .limit(2)
      .for("share");
    if (!review || review.actorUserId === command.actorUserId) fail("maker_checker_violation");
  }
  await transaction.insert(financeOnlinePayoutStateTransitions).values({
    payoutRequestId: payout.id,
    payoutVersion: plan.nextVersion,
    previousStatus: plan.previousStatus,
    status: command.nextStatus,
    transitionKind: plan.transitionKind,
    actorUserId: command.actorUserId,
    authorityId: command.authority.authorityId,
    authorityVersion: command.authority.authorityVersion,
    authorityDigest: command.authority.authorityDigest,
    adminNote: command.adminNote,
    failureReason: null,
    occurredAt: new Date(command.occurredAt),
    createdAt: new Date(command.occurredAt)
  });
  const [updated] = await transaction
    .update(financeOnlinePayoutRequests)
    .set({
      status: command.nextStatus,
      version: plan.nextVersion,
      updatedAt: new Date(command.occurredAt)
    })
    .where(
      and(
        eq(financeOnlinePayoutRequests.id, payout.id),
        eq(financeOnlinePayoutRequests.status, plan.previousStatus),
        eq(financeOnlinePayoutRequests.version, plan.expectedVersion)
      )
    )
    .returning({ id: financeOnlinePayoutRequests.id });
  if (!updated) fail("payout_version_conflict");
  return Object.freeze({
    kind: "online_wallet_payout_review_commit_receipt",
    effect: "applied_once",
    payoutRequestId: payout.id,
    previousStatus: plan.previousStatus,
    status: command.nextStatus,
    payoutVersion: plan.nextVersion
  });
}

async function readAuthorityReplay(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<OnlineWalletPayoutReviewCommitReceipt | null> {
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
    transition.payoutRequestId !== command.payoutRequestId ||
    transition.actorUserId !== command.actorUserId ||
    transition.status !== command.nextStatus ||
    transition.previousStatus === null
  ) {
    fail("authority_replay_conflict");
  }
  return Object.freeze({
    kind: "online_wallet_payout_review_commit_receipt",
    effect: "replayed",
    payoutRequestId: transition.payoutRequestId,
    previousStatus: transition.previousStatus as OnlineWalletPayoutReviewCommitReceipt["previousStatus"],
    status: transition.status as OnlineWalletPayoutReviewCommitReceipt["status"],
    payoutVersion: transition.payoutVersion
  });
}

function identifier(value: string, maximum: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maximum;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function positiveRevision(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function digest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function boundedText(value: string, minimum: number, maximum: number): boolean {
  return value.trim() === value && value.length >= minimum && value.length <= maximum;
}

function instant(value: string): Date | null {
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : null;
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: ConstructorParameters<typeof OnlineWalletPayoutReviewPersistenceError>[0]): never {
  throw new OnlineWalletPayoutReviewPersistenceError(reason);
}
