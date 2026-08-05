import type { WalletOperationProjectionDiscrepancy } from "./wallet-operation-comparison-types";
import { walletOperationFail } from "./wallet-operation-codec-boundary";
import { addWalletOperationDiscrepancy } from "./wallet-operation-discrepancy";
import type {
  WalletBalanceSnapshot,
  WalletLotEconomicEdge,
  WalletStoredSnapshot
} from "./wallet-operation-snapshot-types";
import {
  findWalletBalanceDefinitionByBucket,
  walletBalanceKeys
} from "./wallet-operation-wallet-model";

export function projectExpectedBalanceDeltas(
  edges: readonly WalletLotEconomicEdge[]
): WalletBalanceSnapshot {
  const deltas: Record<keyof WalletBalanceSnapshot, bigint> = {
    pendingMinor: 0n,
    availableMinor: 0n,
    reservedMinor: 0n,
    payoutPendingMinor: 0n,
    refundPendingMinor: 0n,
    recoveryReceivableMinor: 0n
  };
  for (const edge of edges) {
    const definition = findWalletBalanceDefinitionByBucket(edge.bucket);
    if (!definition) walletOperationFail("invalid_field");
    const amount = BigInt(edge.amount.amountMinor);
    deltas[definition.balance] += edge.side === definition.normalSide ? amount : -amount;
  }
  return Object.freeze({
    pendingMinor: deltas.pendingMinor.toString(),
    availableMinor: deltas.availableMinor.toString(),
    reservedMinor: deltas.reservedMinor.toString(),
    payoutPendingMinor: deltas.payoutPendingMinor.toString(),
    refundPendingMinor: deltas.refundPendingMinor.toString(),
    recoveryReceivableMinor: deltas.recoveryReceivableMinor.toString()
  });
}

export function addBalanceDeltaDiscrepancies(
  previousWallet: WalletStoredSnapshot,
  nextWallet: WalletStoredSnapshot,
  expectedDeltas: WalletBalanceSnapshot,
  discrepancies: WalletOperationProjectionDiscrepancy[]
): void {
  for (const balance of walletBalanceKeys) {
    const previousMinor = previousWallet.balances[balance];
    const nextMinor = nextWallet.balances[balance];
    const actualDeltaMinor = (BigInt(nextMinor) - BigInt(previousMinor)).toString();
    const expectedDeltaMinor = expectedDeltas[balance];
    if (actualDeltaMinor !== expectedDeltaMinor) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "wallet_balance_delta_mismatch",
        balance,
        previousMinor,
        nextMinor,
        expectedDeltaMinor,
        actualDeltaMinor
      });
    }
  }
}
