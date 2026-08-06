import type { OnlineWalletPayoutApprovalPreparationReader } from "@elevenhouse/domain/finance-core";
import { eq } from "drizzle-orm";

import { financeOnlinePayoutRequests } from "../../schema/finance/online-payouts.schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

/** Reads only the immutable payout facts which are safe to bind into a server-derived approval. */
export function createDrizzleOnlineWalletPayoutApprovalPreparationReader(input: Readonly<{
  database: FinanceDatabase;
}>): OnlineWalletPayoutApprovalPreparationReader {
  return Object.freeze({
    async findPayoutApprovalPreparation({ payoutRequestId }) {
      const rows = await input.database
        .select({
          payoutRequestId: financeOnlinePayoutRequests.id,
          authorizationAggregateId: financeOnlinePayoutRequests.authorizationAggregateId,
          payoutVersion: financeOnlinePayoutRequests.version,
          payoutStatus: financeOnlinePayoutRequests.status,
          astrologerUserId: financeOnlinePayoutRequests.astrologerUserId,
          amountMinor: financeOnlinePayoutRequests.immutableAmountMinor,
          currency: financeOnlinePayoutRequests.currency,
          beneficiaryFingerprint: financeOnlinePayoutRequests.beneficiaryFingerprint
        })
        .from(financeOnlinePayoutRequests)
        .where(eq(financeOnlinePayoutRequests.id, payoutRequestId))
        .limit(2);
      if (rows.length > 1) throw new OnlineWalletPayoutApprovalPreparationReadError("payout_facts_conflict");
      const row = rows[0];
      if (!row || row.payoutStatus !== "under_review" || row.currency !== "RUB") return null;
      return Object.freeze({
        ...row,
        payoutStatus: "under_review" as const,
        currency: "RUB" as const,
        beneficiaryFingerprint: row.beneficiaryFingerprint as `sha256:${string}`
      });
    }
  } satisfies OnlineWalletPayoutApprovalPreparationReader);
}

export class OnlineWalletPayoutApprovalPreparationReadError extends Error {
  readonly code = "online_wallet_payout_approval_preparation_read_error";

  constructor(readonly reason: "payout_facts_conflict") {
    super("Online wallet payout approval preparation facts are inconsistent");
    this.name = "OnlineWalletPayoutApprovalPreparationReadError";
  }
}
