import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import { readExactDataRecord, readFinancePostingIdentifier } from "./posting-codec";
import type { ChargebackRecoveryCollectionRow } from "./chargeback-recovery-posting-types";

export function readChargebackRecoveryCollectionRow(
  input: unknown
): ChargebackRecoveryCollectionRow {
  const fields = readExactDataRecord(input, [
    "exposureId",
    "amount",
    "receiptPayableEffectId",
    "receiptPayableComponentId",
    "receiptRecoveryEffectId",
    "receiptRecoveryComponentId"
  ]);
  return Object.freeze({
    exposureId: readFinancePostingIdentifier(fields.exposureId),
    amount: readChargebackUnsignedMoney(fields.amount),
    receiptPayableEffectId: readFinancePostingIdentifier(fields.receiptPayableEffectId),
    receiptPayableComponentId: readFinancePostingIdentifier(fields.receiptPayableComponentId),
    receiptRecoveryEffectId: readFinancePostingIdentifier(fields.receiptRecoveryEffectId),
    receiptRecoveryComponentId: readFinancePostingIdentifier(fields.receiptRecoveryComponentId)
  });
}
