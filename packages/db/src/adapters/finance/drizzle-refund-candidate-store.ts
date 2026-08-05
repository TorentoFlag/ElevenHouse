import { and, desc, eq, inArray } from "drizzle-orm";
import {
  RefundCandidateAlreadyOpenError,
  RefundCandidateNotFoundError,
  createRefundCandidateReview,
  type RefundCandidate,
  type RefundCandidateReview,
  type RefundCandidateStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleAuditLogStore } from "../../adapters/audit-log";
import { financeRefundCandidateReviews, financeRefundCandidates } from "../../schema";
import {
  executeIdempotentFinanceCommand,
  hasPostgresConstraintViolation
} from "./drizzle-finance-command-store";

const openCandidateConstraint = "finance_refund_candidates_one_open_order_unique";

/**
 * Persists only a client review candidate plus its finance-command idempotency receipt. It has no
 * ArcPay, wallet, refund-case, ledger or outbox write path.
 */
export function createDrizzleRefundCandidateStore(
  database: ElevenHouseDatabase
): RefundCandidateStore {
  return Object.freeze({
    async executeSubmitCandidate(command, create) {
      try {
        return await executeIdempotentFinanceCommand({
          database,
          command,
          create: async (transaction) => {
            const candidate = await create();
            const [row] = await transaction
              .insert(financeRefundCandidates)
              .values({
                id: candidate.id,
                orderId: candidate.orderId,
                clientUserId: candidate.clientUserId,
                statement: candidate.statement,
                status: candidate.status,
                version: String(candidate.version),
                resolvedRefundCaseId: null,
                submittedAt: new Date(candidate.submittedAt),
                resolvedAt: null,
                createdAt: new Date(candidate.submittedAt),
                updatedAt: new Date(candidate.updatedAt)
              })
              .returning();
            if (!row) throw new Error("Expected refund candidate insert to return a row");
            return {
              result: { refundCandidateId: row.id },
              value: toRefundCandidate(row)
            };
          },
          replay: async (result) => {
            const candidateId = readCandidateId(result);
            const [row] = await database
              .select()
              .from(financeRefundCandidates)
              .where(eq(financeRefundCandidates.id, candidateId))
              .limit(1);
            return row ? toRefundCandidate(row) : null;
          }
        });
      } catch (error) {
        if (hasPostgresConstraintViolation(error, "23505", openCandidateConstraint)) {
          throw new RefundCandidateAlreadyOpenError();
        }
        throw error;
      }
    },
    async listByOrderAndClient(input) {
      const rows = await database
        .select()
        .from(financeRefundCandidates)
        .where(
          and(
            eq(financeRefundCandidates.orderId, input.orderId),
            eq(financeRefundCandidates.clientUserId, input.clientUserId)
          )
        )
        .orderBy(desc(financeRefundCandidates.createdAt), desc(financeRefundCandidates.id));
      return rows.map(toRefundCandidate);
    },
    async listForAdmin(input) {
      const predicate =
        input.statuses && input.statuses.length > 0
          ? inArray(financeRefundCandidates.status, input.statuses)
          : undefined;
      const rows = await database
        .select()
        .from(financeRefundCandidates)
        .where(predicate)
        .orderBy(desc(financeRefundCandidates.updatedAt), desc(financeRefundCandidates.id))
        .limit(input.limit);
      return rows.map(toRefundCandidate);
    },
    async executeReviewCandidate(command, input) {
      return executeIdempotentFinanceCommand({
        database,
        command,
        create: async (transaction) => {
          const [candidateRow] = await transaction
            .select()
            .from(financeRefundCandidates)
            .where(eq(financeRefundCandidates.id, input.candidateId))
            .limit(1)
            .for("update");
          if (!candidateRow) throw new RefundCandidateNotFoundError();

          const reviewed = createRefundCandidateReview({
            ...input,
            candidate: toRefundCandidate(candidateRow)
          });
          const [updatedCandidate] = await transaction
            .update(financeRefundCandidates)
            .set({
              status: reviewed.candidate.status,
              version: String(reviewed.candidate.version),
              updatedAt: new Date(reviewed.candidate.updatedAt)
            })
            .where(
              and(
                eq(financeRefundCandidates.id, input.candidateId),
                eq(financeRefundCandidates.version, String(input.expectedVersion))
              )
            )
            .returning();
          if (!updatedCandidate) {
            throw new Error("Refund candidate version changed while its row lock was held");
          }
          const [reviewRow] = await transaction
            .insert(financeRefundCandidateReviews)
            .values({
              id: reviewed.review.id,
              candidateId: reviewed.review.candidateId,
              candidateVersion: String(reviewed.review.candidateVersion),
              actorUserId: reviewed.review.actorUserId,
              action: reviewed.review.action,
              note: reviewed.review.note,
              refundCaseId: null,
              reviewedAt: new Date(reviewed.review.reviewedAt),
              createdAt: new Date(reviewed.review.reviewedAt)
            })
            .returning();
          if (!reviewRow) throw new Error("Expected refund candidate review insert to return a row");
          await createDrizzleAuditLogStore(transaction).createEntry({
            actorUserId: input.actorUserId,
            action: "finance.refund_candidate.reviewed",
            targetType: "finance_refund_candidate",
            targetId: input.candidateId,
            occurredAt: input.now,
            metadata: {
              reviewId: reviewRow.id,
              action: reviewRow.action,
              candidateVersion: Number(reviewRow.candidateVersion),
              orderId: updatedCandidate.orderId
            }
          });
          const value = Object.freeze({
            candidate: toRefundCandidate(updatedCandidate),
            review: toRefundCandidateReview(reviewRow)
          });
          return {
            result: { refundCandidateId: value.candidate.id, refundCandidateReviewId: value.review.id },
            value
          };
        },
        replay: async (result) => {
          const candidateId = readCandidateId(result);
          const reviewId = readReviewId(result);
          const [[candidateRow], [reviewRow]] = await Promise.all([
            database
              .select()
              .from(financeRefundCandidates)
              .where(eq(financeRefundCandidates.id, candidateId))
              .limit(1),
            database
              .select()
              .from(financeRefundCandidateReviews)
              .where(eq(financeRefundCandidateReviews.id, reviewId))
              .limit(1)
          ]);
          return candidateRow && reviewRow
            ? Object.freeze({ candidate: toRefundCandidate(candidateRow), review: toRefundCandidateReview(reviewRow) })
            : null;
        }
      });
    }
  } satisfies RefundCandidateStore);
}

function toRefundCandidateReview(
  row: typeof financeRefundCandidateReviews.$inferSelect
): RefundCandidateReview {
  const candidateVersion = Number(row.candidateVersion);
  if (!Number.isSafeInteger(candidateVersion) || candidateVersion < 1) {
    throw new Error("Persisted refund candidate review has an invalid version");
  }
  if (row.action !== "claimed" && row.action !== "rejected") {
    throw new Error("Persisted refund candidate review has an unsupported action");
  }
  if (row.refundCaseId !== null) {
    throw new Error("Queue review cannot contain a refund-case decision reference");
  }
  return Object.freeze({
    id: row.id,
    candidateId: row.candidateId,
    candidateVersion,
    actorUserId: row.actorUserId,
    action: row.action,
    note: row.note,
    refundCaseId: null,
    reviewedAt: row.reviewedAt.toISOString()
  });
}

function toRefundCandidate(row: typeof financeRefundCandidates.$inferSelect): RefundCandidate {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Persisted refund candidate has an invalid version");
  }
  if (
    row.status !== "submitted" &&
    row.status !== "under_review" &&
    row.status !== "rejected" &&
    row.status !== "resolved"
  ) {
    throw new Error("Persisted refund candidate has an invalid status");
  }
  return Object.freeze({
    id: row.id,
    orderId: row.orderId,
    clientUserId: row.clientUserId,
    statement: row.statement,
    status: row.status,
    version,
    submittedAt: row.submittedAt.toISOString(),
    resolvedRefundCaseId: row.resolvedRefundCaseId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  });
}

function readCandidateId(result: Record<string, unknown>): string {
  const candidateId = result.refundCandidateId;
  if (typeof candidateId !== "string" || candidateId.length === 0) {
    throw new Error("Persisted refund candidate idempotency result is incomplete");
  }
  return candidateId;
}

function readReviewId(result: Record<string, unknown>): string {
  const reviewId = result.refundCandidateReviewId;
  if (typeof reviewId !== "string" || reviewId.length === 0) {
    throw new Error("Persisted refund candidate review idempotency result is incomplete");
  }
  return reviewId;
}
