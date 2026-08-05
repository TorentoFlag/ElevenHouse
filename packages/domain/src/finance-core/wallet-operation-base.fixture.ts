import { createFinanceLedgerAccountRef } from "./ledger-chart";
import {
  createUnverifiedWalletProjectionLimitPolicySnapshot,
  type WalletProjectionDecoderEnvelope
} from "./wallet-operation-projection";

export const sha = (character: string) => `sha256:${character.repeat(64)}`;

export const walletOperationLinks = Object.freeze({
  originalSaleId: "order-1",
  componentId: "payable-order-1",
  payableLotId: "lot-order-1-available",
  payoutAllocationId: "payout-allocation-1"
});
export const links = walletOperationLinks;

export const walletProjectionDecoderEnvelope: WalletProjectionDecoderEnvelope = Object.freeze({
  maxEconomicEdges: 64,
  maxAuthorityRefs: 16,
  maxJournalEntries: 4,
  maxDecimalDigits: 128
});

export const availableAccount = createFinanceLedgerAccountRef({
  code: "astrologer_available",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
export const payoutPendingAccount = createFinanceLedgerAccountRef({
  code: "astrologer_payout_pending",
  astrologerUserId: "astrologer-1",
  currency: "RUB"
});
export const outboundAccount = createFinanceLedgerAccountRef({
  code: "bank_outbound_clearing",
  bankCashPoolId: "bank-pool-rub-1",
  currency: "RUB"
});

export function balances(overrides: Record<string, string> = {}) {
  return {
    pendingMinor: "0",
    availableMinor: "0",
    reservedMinor: "0",
    payoutPendingMinor: "0",
    refundPendingMinor: "0",
    recoveryReceivableMinor: "0",
    ...overrides
  };
}

export function projectionLimitPolicy(overrides: Readonly<Record<string, unknown>> = {}) {
  return createUnverifiedWalletProjectionLimitPolicySnapshot(
    {
      policyId: "wallet-projection-standard",
      version: "3",
      effectiveAt: "2026-08-01T00:00:00Z",
      maxEconomicEdgesPerOperation: "64",
      maxAuthorityRefsPerOperation: "16",
      ...overrides
    },
    walletProjectionDecoderEnvelope
  );
}

export function wallet(revision: string, balanceOverrides: Record<string, string>) {
  return {
    walletId: "wallet-astrologer-1-rub",
    revision,
    astrologerUserId: "astrologer-1",
    currency: "RUB",
    balances: balances(balanceOverrides)
  };
}
