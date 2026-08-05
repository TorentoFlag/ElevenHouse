import {
  exactSettlementRecord,
  losslessInt64Decimal,
  nullableOpaqueSettlementValue,
  nullableSettlementInstantValue,
  opaqueSettlementValue,
  settlementPayloadDigest
} from "./settlement-codec";
import type { LosslessSettlementPayout } from "./settlement-cursor-types";
import { createProviderSettlementPayoutKey } from "./settlement-identity";

const payoutKeys = [
  "key",
  "amountMinor",
  "currency",
  "status",
  "payoutMethod",
  "bankCode",
  "bankTerminalId",
  "providerBankPayoutId",
  "bankPayoutStatus",
  "initiatedAt",
  "completedAt",
  "failedReason",
  "rawPayloadDigest"
] as const;

export function createLosslessSettlementPayout(input: unknown): LosslessSettlementPayout {
  const fields = exactSettlementRecord(input, payoutKeys);
  return Object.freeze({
    key: createProviderSettlementPayoutKey(fields.key),
    amountMinor: losslessInt64Decimal(fields.amountMinor),
    currency: opaqueSettlementValue(fields.currency),
    status: opaqueSettlementValue(fields.status),
    payoutMethod: nullableOpaqueSettlementValue(fields.payoutMethod),
    bankCode: nullableOpaqueSettlementValue(fields.bankCode),
    bankTerminalId: nullableOpaqueSettlementValue(fields.bankTerminalId),
    providerBankPayoutId: nullableOpaqueSettlementValue(fields.providerBankPayoutId),
    bankPayoutStatus: nullableOpaqueSettlementValue(fields.bankPayoutStatus),
    initiatedAt: nullableSettlementInstantValue(fields.initiatedAt),
    completedAt: nullableSettlementInstantValue(fields.completedAt),
    failedReason: nullableOpaqueSettlementValue(fields.failedReason),
    rawPayloadDigest: settlementPayloadDigest(fields.rawPayloadDigest)
  });
}
