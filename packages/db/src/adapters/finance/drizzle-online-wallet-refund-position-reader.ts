import type {
  ApprovedOnlineWalletRefundCaseReader,
  OnlineWalletRefundPositionReader
} from "@elevenhouse/domain/finance-core";
import { and, desc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeOnlineSaleCaptureApplications } from "../../schema/finance/online-sale-capture.schema";
import { financeOnlineWalletRefundApplications } from "../../schema/finance/online-wallet-refund-applications.schema";
import { financeOnlineWalletRefundCases } from "../../schema/finance/online-wallet-refund-cases.schema";

/**
 * V2-only prior cumulative position. It includes terminal blocked refund outcomes because ArcPay
 * has already performed that refund; a later provider refund must advance from the provider's
 * actual cumulative amount rather than silently replay the blocked delta.
 */
export function createDrizzleOnlineWalletRefundPositionReader(
  database: ElevenHouseDatabase
): OnlineWalletRefundPositionReader {
  return Object.freeze({
    async findRefundPosition(input) {
      const providerPaymentId = identifier(input.providerPaymentId);
      const providerAccount = input.providerAccount;
      const [capture] = await database
        .select({ economicPaymentIntentId: financeOnlineSaleCaptureApplications.economicPaymentIntentId })
        .from(financeOnlineSaleCaptureApplications)
        .where(
          and(
            eq(
              financeOnlineSaleCaptureApplications.providerAccountSeriesId,
              providerAccount.seriesId
            ),
            eq(
              financeOnlineSaleCaptureApplications.providerAccountId,
              providerAccount.providerAccountId
            ),
            eq(
              financeOnlineSaleCaptureApplications.providerIdentityVersion,
              providerAccount.identityVersion
            ),
            eq(financeOnlineSaleCaptureApplications.providerPaymentId, providerPaymentId)
          )
        )
        .limit(2);
      if (!capture) return null;
      const [previous] = await database
        .select({ cumulativeRefundedMinor: financeOnlineWalletRefundApplications.cumulativeRefundedMinor })
        .from(financeOnlineWalletRefundApplications)
        .where(
          and(
            eq(
              financeOnlineWalletRefundApplications.providerAccountSeriesId,
              providerAccount.seriesId
            ),
            eq(financeOnlineWalletRefundApplications.providerAccountId, providerAccount.providerAccountId),
            eq(
              financeOnlineWalletRefundApplications.providerIdentityVersion,
              providerAccount.identityVersion
            ),
            eq(financeOnlineWalletRefundApplications.providerPaymentId, providerPaymentId)
          )
        )
        .orderBy(desc(financeOnlineWalletRefundApplications.cumulativeRefundedMinor))
        .limit(1);
      return Object.freeze({
        economicPaymentIntentId: capture.economicPaymentIntentId,
        previousCumulativeRefundedMinor: previous?.cumulativeRefundedMinor ?? "0"
      });
    }
  } satisfies OnlineWalletRefundPositionReader);
}

/** Reads the one approved case whose frozen cumulative position matches a canonical refund. */
export function createDrizzleApprovedOnlineWalletRefundCaseReader(
  database: ElevenHouseDatabase
): ApprovedOnlineWalletRefundCaseReader {
  return Object.freeze({
    async findApprovedRefundCase(input) {
      const [refundCase] = await database
        .select({ refundCaseId: financeOnlineWalletRefundCases.refundCaseId })
        .from(financeOnlineWalletRefundCases)
        .where(
          and(
            eq(
              financeOnlineWalletRefundCases.providerAccountSeriesId,
              input.providerAccount.seriesId
            ),
            eq(
              financeOnlineWalletRefundCases.providerAccountId,
              input.providerAccount.providerAccountId
            ),
            eq(
              financeOnlineWalletRefundCases.providerIdentityVersion,
              input.providerAccount.identityVersion
            ),
            eq(
              financeOnlineWalletRefundCases.economicPaymentIntentId,
              input.economicPaymentIntentId
            ),
            eq(financeOnlineWalletRefundCases.providerPaymentId, input.providerPaymentId),
            eq(
              financeOnlineWalletRefundCases.previousCumulativeRefundedMinor,
              input.previousCumulativeRefundedMinor
            ),
            eq(
              financeOnlineWalletRefundCases.approvedCumulativeRefundedMinor,
              input.cumulativeRefundedMinor
            ),
            eq(financeOnlineWalletRefundCases.status, "approved")
          )
        )
        .limit(2);
      return refundCase ? Object.freeze(refundCase) : null;
    }
  } satisfies ApprovedOnlineWalletRefundCaseReader);
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    // eslint-disable-next-line no-control-regex -- Provider identifier grammar rejects ASCII C0/DEL.
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError("providerPaymentId must be a bounded provider identifier");
  }
  return value;
}
