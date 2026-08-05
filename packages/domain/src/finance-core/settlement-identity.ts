import {
  exactSettlementRecord,
  positiveSafeInteger,
  settlementIdentifier,
  settlementProviderAccount,
  settlementStream
} from "./settlement-codec";
import type {
  FinanceSettlementCursorKey,
  ProviderSettlementEntryKey,
  ProviderSettlementPayoutKey,
  SettlementPageCheckpointKey
} from "./settlement-cursor-types";

export function createSettlementCursorKey(input: unknown): FinanceSettlementCursorKey {
  const fields = exactSettlementRecord(input, ["providerAccount", "stream"]);
  return Object.freeze({
    providerAccount: settlementProviderAccount(fields.providerAccount),
    stream: settlementStream(fields.stream)
  });
}

export function serializeSettlementCursorKey(input: unknown): string {
  const key = createSettlementCursorKey(input);
  return JSON.stringify([
    key.providerAccount.seriesId,
    key.providerAccount.providerAccountId,
    key.providerAccount.identityVersion,
    key.stream
  ]);
}

export function createSettlementPageCheckpointKey(input: unknown): SettlementPageCheckpointKey {
  const fields = exactSettlementRecord(input, [
    "cursorKey",
    "windowGeneration",
    "providerPageCursor"
  ]);
  return Object.freeze({
    cursorKey: createSettlementCursorKey(fields.cursorKey),
    windowGeneration: positiveSafeInteger(fields.windowGeneration, Number.MAX_SAFE_INTEGER),
    providerPageCursor:
      fields.providerPageCursor === null
        ? null
        : settlementIdentifier(fields.providerPageCursor, 1_000)
  });
}

export function serializeSettlementPageCheckpointKey(input: unknown): string {
  const key = createSettlementPageCheckpointKey(input);
  return JSON.stringify([
    key.cursorKey.providerAccount.seriesId,
    key.cursorKey.providerAccount.providerAccountId,
    key.cursorKey.providerAccount.identityVersion,
    key.cursorKey.stream,
    key.windowGeneration,
    key.providerPageCursor
  ]);
}

export function createProviderSettlementEntryKey(input: unknown): ProviderSettlementEntryKey {
  const fields = exactSettlementRecord(input, ["providerAccount", "providerEntryId"]);
  return Object.freeze({
    providerAccount: settlementProviderAccount(fields.providerAccount),
    providerEntryId: settlementIdentifier(fields.providerEntryId)
  });
}

export function serializeProviderSettlementEntryKey(input: unknown): string {
  const key = createProviderSettlementEntryKey(input);
  return JSON.stringify([
    key.providerAccount.seriesId,
    key.providerAccount.providerAccountId,
    key.providerAccount.identityVersion,
    key.providerEntryId
  ]);
}

export function createProviderSettlementPayoutKey(input: unknown): ProviderSettlementPayoutKey {
  const fields = exactSettlementRecord(input, ["providerAccount", "providerPayoutId"]);
  return Object.freeze({
    providerAccount: settlementProviderAccount(fields.providerAccount),
    providerPayoutId: settlementIdentifier(fields.providerPayoutId)
  });
}

export function serializeProviderSettlementPayoutKey(input: unknown): string {
  const key = createProviderSettlementPayoutKey(input);
  return JSON.stringify([
    key.providerAccount.seriesId,
    key.providerAccount.providerAccountId,
    key.providerAccount.identityVersion,
    key.providerPayoutId
  ]);
}
