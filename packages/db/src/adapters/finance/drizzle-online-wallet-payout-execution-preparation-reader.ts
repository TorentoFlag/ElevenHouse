import type {
  OnlineWalletPayoutApprovalReceiptRef,
  OnlineWalletPayoutExecutionPreparationReader
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import { financeBankExposures } from "../../schema/finance/bank-liquidity.schema";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import {
  financeOnlinePayoutApprovalReceipts,
  financeOnlinePayoutRequests
} from "../../schema/finance/online-payouts.schema";
import { financeOnlineWalletHeads } from "../../schema/finance/online-sale-capture.schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

/**
 * Reads the exact, persisted facts for a V2 manual-payout authorization ceremony. This is a
 * preparation-only port: the execution writer locks and revalidates every fact before mutation.
 */
export function createDrizzleOnlineWalletPayoutExecutionPreparationReader(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutExecutionPreparationReader {
  return Object.freeze({
    async findPayoutExecutionPreparation({ payoutRequestId }) {
      const rows = await input.database
        .select({
          payoutRequestId: financeOnlinePayoutRequests.id,
          authorizationAggregateId: financeOnlinePayoutRequests.authorizationAggregateId,
          payoutVersion: financeOnlinePayoutRequests.version,
          payoutStatus: financeOnlinePayoutRequests.status,
          walletId: financeOnlinePayoutRequests.walletId,
          walletRevision: financeOnlineWalletHeads.revision,
          astrologerUserId: financeOnlinePayoutRequests.astrologerUserId,
          amountMinor: financeOnlinePayoutRequests.immutableAmountMinor,
          currency: financeOnlinePayoutRequests.currency,
          approvalReceiptId: financeOnlinePayoutApprovalReceipts.receiptId,
          approvalDigest: financeOnlinePayoutApprovalReceipts.canonicalDigest,
          bankExposureId: financeBankExposures.exposureId,
          bankExposureVersion: financeBankExposures.version,
          bankCashPoolId: financeBankExposures.bankCashPoolId
        })
        .from(financeOnlinePayoutRequests)
        .innerJoin(
          financeOnlineWalletHeads,
          eq(financeOnlineWalletHeads.id, financeOnlinePayoutRequests.walletId)
        )
        .innerJoin(
          financeOnlinePayoutApprovalReceipts,
          eq(financeOnlinePayoutApprovalReceipts.payoutRequestId, financeOnlinePayoutRequests.id)
        )
        .innerJoin(
          financeBankExposures,
          and(
            eq(financeBankExposures.exposureId, financeOnlinePayoutApprovalReceipts.bankExposureId),
            eq(financeBankExposures.bankCashPoolId, financeOnlinePayoutApprovalReceipts.bankCashPoolId),
            eq(financeBankExposures.currency, financeOnlinePayoutApprovalReceipts.currency)
          )
        )
        .where(eq(financeOnlinePayoutRequests.id, payoutRequestId))
        .limit(2);
      if (rows.length > 1) throw new OnlineWalletPayoutExecutionPreparationReadError("payout_facts_conflict");
      const row = rows[0];
      if (!row) return null;
      if (
        row.currency !== "RUB" ||
        (row.payoutStatus !== "approved" && row.payoutStatus !== "processing_manual")
      ) {
        return null;
      }
      return Object.freeze({
        payoutRequestId: row.payoutRequestId,
        authorizationAggregateId: row.authorizationAggregateId,
        payoutVersion: row.payoutVersion,
        payoutStatus: row.payoutStatus,
        walletId: row.walletId,
        walletRevision: row.walletRevision,
        astrologerUserId: row.astrologerUserId,
        amountMinor: row.amountMinor,
        currency: "RUB" as const,
        approval: Object.freeze({
          kind: "online_wallet_payout_approval_receipt" as const,
          receiptId: row.approvalReceiptId,
          canonicalDigest: row.approvalDigest
          // The branded reference can only originate at this trusted persistence boundary.
        }) as unknown as OnlineWalletPayoutApprovalReceiptRef,
        bankExposureId: row.bankExposureId,
        bankExposureVersion: row.bankExposureVersion,
        bankCashPoolId: row.bankCashPoolId
      });
    },
    async findBankTransferEvidence({ artifactId, bankCashPoolId, currency }) {
      const rows = await input.database
        .select({ artifactId: financeArtifacts.id, sha256Digest: financeArtifacts.sha256Digest })
        .from(financeArtifacts)
        .where(
          and(
            eq(financeArtifacts.id, artifactId),
            eq(financeArtifacts.artifactClass, "bank_transfer_evidence"),
            eq(financeArtifacts.bindingKind, "bank_cash_pool"),
            eq(financeArtifacts.bankCashPoolId, bankCashPoolId),
            eq(financeArtifacts.currency, currency)
          )
        )
        .limit(2);
      if (rows.length > 1) throw new OnlineWalletPayoutExecutionPreparationReadError("evidence_facts_conflict");
      const row = rows[0];
      return row
        ? Object.freeze({
            artifactId: row.artifactId,
            sha256Digest: row.sha256Digest as `sha256:${string}`
          })
        : null;
    }
  } satisfies OnlineWalletPayoutExecutionPreparationReader);
}

export class OnlineWalletPayoutExecutionPreparationReadError extends Error {
  readonly code = "online_wallet_payout_execution_preparation_read_error";

  constructor(readonly reason: "payout_facts_conflict" | "evidence_facts_conflict") {
    super("Online wallet payout execution preparation facts are inconsistent");
    this.name = "OnlineWalletPayoutExecutionPreparationReadError";
  }
}
