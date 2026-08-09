import type {
  OnlineWalletRefundApprovalPreparationReader
} from "@elevenhouse/domain/finance-core";
import { and, desc, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeOnlineSaleCaptureApplications,
  financeOnlineSaleCaptureReceipts,
  financeOnlineWalletHeads
} from "../../schema/finance/online-sale-capture.schema";
import { financeOnlineWalletRefundApplications } from "../../schema/finance/online-wallet-refund-applications.schema";
import { financeOnlineWalletRefundCases } from "../../schema/finance/online-wallet-refund-cases.schema";
import { financeProviderOperationSourceHeads } from "../../schema/finance/provider-operations.schema";
import {
  financeRefundCandidateReviews,
  financeRefundCandidates
} from "../../schema/finance/refund-candidates.schema";

type RefundApprovalReadExecutor = Pick<ElevenHouseDatabase, "select">;

export class OnlineWalletRefundApprovalPreparationReadError extends Error {
  constructor(readonly code: string) {
    super("Online-wallet refund approval preparation could not be resolved");
  }
}

/**
 * Resolves the exact V2 graph from persisted rows. It intentionally returns no candidate for
 * incomplete, concurrent or legacy-only payment state; the admin route must fail closed instead
 * of manufacturing an approval command from browser fields.
 */
export function createDrizzleOnlineWalletRefundApprovalPreparationReader(
  database: RefundApprovalReadExecutor
): OnlineWalletRefundApprovalPreparationReader {
  return Object.freeze({
    async findForApproval(input) {
      const refundCandidateId = uuid(input.refundCandidateId);
      const [candidate] = await database
        .select()
        .from(financeRefundCandidates)
        .where(eq(financeRefundCandidates.id, refundCandidateId))
        .limit(2);
      if (!candidate || candidate.status !== "under_review") return null;
      const candidateVersion = revision(candidate.version);
      const [review] = await database
        .select()
        .from(financeRefundCandidateReviews)
        .where(
          and(
            eq(financeRefundCandidateReviews.candidateId, candidate.id),
            eq(financeRefundCandidateReviews.candidateVersion, candidate.version),
            eq(financeRefundCandidateReviews.action, "claimed")
          )
        )
        .limit(2);
      if (!review) return null;

      const captures = await database
        .select({ capture: financeOnlineSaleCaptureApplications, receipt: financeOnlineSaleCaptureReceipts })
        .from(financeOnlineSaleCaptureApplications)
        .innerJoin(
          financeOnlineSaleCaptureReceipts,
          eq(
            financeOnlineSaleCaptureApplications.onlineSaleReceiptId,
            financeOnlineSaleCaptureReceipts.receiptId
          )
        )
        .where(sql`${financeOnlineSaleCaptureReceipts.orderId} = ${candidate.orderId}::text`)
        .limit(2);
      const captureRow = captures[0];
      if (captures.length !== 1 || !captureRow) return null;
      const capture = captureRow.capture;
      if (capture.currency !== "RUB" || captureRow.receipt.walletId !== capture.onlineWalletId) return null;

      const [wallet] = await database
        .select()
        .from(financeOnlineWalletHeads)
        .where(eq(financeOnlineWalletHeads.id, capture.onlineWalletId))
        .limit(2);
      if (!wallet || wallet.currency !== "RUB" || !wallet.lastCommitmentDigest) return null;

      const activeCases = await database
        .select({ refundCaseId: financeOnlineWalletRefundCases.refundCaseId })
        .from(financeOnlineWalletRefundCases)
        .where(
          and(
            eq(
              financeOnlineWalletRefundCases.providerAccountSeriesId,
              capture.providerAccountSeriesId
            ),
            eq(financeOnlineWalletRefundCases.providerAccountId, capture.providerAccountId),
            eq(
              financeOnlineWalletRefundCases.providerIdentityVersion,
              capture.providerIdentityVersion
            ),
            eq(financeOnlineWalletRefundCases.providerPaymentId, capture.providerPaymentId),
            eq(financeOnlineWalletRefundCases.status, "approved")
          )
        )
        .limit(1);
      if (activeCases.length !== 0) return null;

      const refundApplications = await database
        .select({ cumulativeRefundedMinor: financeOnlineWalletRefundApplications.cumulativeRefundedMinor })
        .from(financeOnlineWalletRefundApplications)
        .where(
          and(
            eq(
              financeOnlineWalletRefundApplications.providerAccountSeriesId,
              capture.providerAccountSeriesId
            ),
            eq(financeOnlineWalletRefundApplications.providerAccountId, capture.providerAccountId),
            eq(
              financeOnlineWalletRefundApplications.providerIdentityVersion,
              capture.providerIdentityVersion
            ),
            eq(financeOnlineWalletRefundApplications.providerPaymentId, capture.providerPaymentId)
          )
        )
        .orderBy(desc(financeOnlineWalletRefundApplications.committedAt));
      const previousCumulativeRefundedMinor = maximumMinor(
        refundApplications.map((row) => row.cumulativeRefundedMinor)
      );

      const sourceHeads = await database
        .select({ headVersion: financeProviderOperationSourceHeads.headVersion })
        .from(financeProviderOperationSourceHeads)
        .where(
          and(
            eq(financeProviderOperationSourceHeads.seriesId, capture.providerAccountSeriesId),
            eq(financeProviderOperationSourceHeads.providerAccountId, capture.providerAccountId),
            eq(
              financeProviderOperationSourceHeads.providerIdentityVersion,
              capture.providerIdentityVersion
            ),
            eq(financeProviderOperationSourceHeads.purpose, "client_order"),
            eq(financeProviderOperationSourceHeads.sourceId, candidate.orderId),
            eq(financeProviderOperationSourceHeads.operationKind, "refund")
          )
        )
        .limit(2);
      if (sourceHeads.length > 1) {
        throw new OnlineWalletRefundApprovalPreparationReadError("provider_operation_source_head_ambiguous");
      }
      const sourceHead = sourceHeads[0];
      return Object.freeze({
        refundCandidateId: candidate.id,
        refundCandidateVersion: candidateVersion,
        refundCandidateReviewId: review.id,
        orderId: candidate.orderId,
        captureApplicationId: capture.id,
        walletId: wallet.id,
        walletRevision: wallet.revision,
        economicPaymentIntentId: capture.economicPaymentIntentId,
        economicPaymentVersion: revision(capture.economicPaymentVersion),
        providerAccount: Object.freeze({
          seriesId: capture.providerAccountSeriesId,
          providerAccountId: capture.providerAccountId,
          identityVersion: capture.providerIdentityVersion
        }),
        providerPaymentId: capture.providerPaymentId,
        grossAmountMinor: minor(capture.amountMinor),
        previousCumulativeRefundedMinor,
        providerOperationSourceVersion: sourceHead ? revision(sourceHead.headVersion) : 0
      });
    }
  } satisfies OnlineWalletRefundApprovalPreparationReader);
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new TypeError("refundCandidateId must be a UUID");
  }
  return value;
}

function revision(value: unknown): number {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 1) throw new TypeError("Persisted revision is invalid");
  return result;
}

function minor(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError("Persisted minor amount is invalid");
  }
  return value;
}

function maximumMinor(values: readonly unknown[]): string {
  let maximum = 0n;
  for (const value of values) {
    const parsed = BigInt(minor(value));
    if (parsed > maximum) maximum = parsed;
  }
  return maximum.toString();
}
