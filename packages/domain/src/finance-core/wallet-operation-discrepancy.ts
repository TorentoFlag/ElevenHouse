import type { WalletOperationProjectionDiscrepancy } from "./wallet-operation-comparison-types";

export function addWalletOperationDiscrepancy(
  discrepancies: WalletOperationProjectionDiscrepancy[],
  discrepancy: WalletOperationProjectionDiscrepancy
): void {
  discrepancies.push(Object.freeze(discrepancy));
}
