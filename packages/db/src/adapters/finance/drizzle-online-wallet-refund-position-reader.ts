import type { OnlineWalletRefundPositionReader } from "@elevenhouse/domain/finance-core";
import { and, desc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeOnlineSaleCaptureApplications } from "../../schema/finance/online-sale-capture.schema";
import { financeOnlineWalletRefundApplications } from "../../schema/finance/online-wallet-refund-applications.schema";

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
