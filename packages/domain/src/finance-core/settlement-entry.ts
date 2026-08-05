import {
  exactSettlementRecord,
  losslessInt64Decimal,
  nullableLosslessInt64Decimal,
  nullableOpaqueSettlementValue,
  nullableSettlementInstantValue,
  opaqueSettlementValue,
  settlementPayloadDigest
} from "./settlement-codec";
import type { LosslessSettlementEntry } from "./settlement-cursor-types";
import { createProviderSettlementEntryKey } from "./settlement-identity";

const ledgerEntryKeys = [
  "key",
  "amountMinor",
  "currency",
  "direction",
  "entryType",
  "referenceType",
  "referenceId",
  "feeAmountMinor",
  "balanceAfterMinor",
  "occurredAt",
  "organizationId",
  "terminalId",
  "bankTerminalId",
  "bankCode",
  "bankRrn",
  "bankAuthCode",
  "bankInternalReference",
  "settlementStatus",
  "rawPayloadDigest"
] as const;

export function createLosslessSettlementEntry(input: unknown): LosslessSettlementEntry {
  const fields = exactSettlementRecord(input, ledgerEntryKeys);
  return Object.freeze({
    key: createProviderSettlementEntryKey(fields.key),
    amountMinor: losslessInt64Decimal(fields.amountMinor),
    currency: opaqueSettlementValue(fields.currency),
    direction: opaqueSettlementValue(fields.direction),
    entryType: opaqueSettlementValue(fields.entryType),
    referenceType: opaqueSettlementValue(fields.referenceType),
    referenceId: opaqueSettlementValue(fields.referenceId),
    feeAmountMinor: nullableLosslessInt64Decimal(fields.feeAmountMinor),
    balanceAfterMinor: nullableLosslessInt64Decimal(fields.balanceAfterMinor),
    occurredAt: nullableSettlementInstantValue(fields.occurredAt),
    organizationId: nullableOpaqueSettlementValue(fields.organizationId),
    terminalId: nullableOpaqueSettlementValue(fields.terminalId),
    bankTerminalId: nullableOpaqueSettlementValue(fields.bankTerminalId),
    bankCode: nullableOpaqueSettlementValue(fields.bankCode),
    bankRrn: nullableOpaqueSettlementValue(fields.bankRrn),
    bankAuthCode: nullableOpaqueSettlementValue(fields.bankAuthCode),
    bankInternalReference: nullableOpaqueSettlementValue(fields.bankInternalReference),
    settlementStatus: nullableOpaqueSettlementValue(fields.settlementStatus),
    rawPayloadDigest: settlementPayloadDigest(fields.rawPayloadDigest)
  });
}
