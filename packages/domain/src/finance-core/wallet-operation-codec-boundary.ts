import { types as nodeUtilTypes } from "node:util";
import {
  WalletOperationProjectionIntegrityError,
  type WalletOperationProjectionIntegrityReason
} from "./wallet-operation-comparison-types";
import type { WalletProjectionDecoderEnvelope } from "./wallet-operation-snapshot-types";
import { readStrictOwnDataArray, readStrictOwnDataRecord } from "./strict-own-data";

const envelopeKeys = [
  "maxEconomicEdges",
  "maxAuthorityRefs",
  "maxJournalEntries",
  "maxDecimalDigits"
] as const;

export function normalizeWalletProjectionDecoderEnvelope(
  input: unknown
): WalletProjectionDecoderEnvelope {
  if (input === undefined || input === null) walletOperationFail("decoder_envelope_required");
  const fields = readWalletOperationExactDataRecord(input, envelopeKeys);
  if (
    !Number.isSafeInteger(fields.maxEconomicEdges) ||
    (fields.maxEconomicEdges as number) < 0 ||
    !Number.isSafeInteger(fields.maxAuthorityRefs) ||
    (fields.maxAuthorityRefs as number) < 0 ||
    !Number.isSafeInteger(fields.maxJournalEntries) ||
    (fields.maxJournalEntries as number) < 0 ||
    !Number.isSafeInteger(fields.maxDecimalDigits) ||
    (fields.maxDecimalDigits as number) < 0
  ) {
    walletOperationFail("invalid_field");
  }
  return Object.freeze({
    maxEconomicEdges: fields.maxEconomicEdges as number,
    maxAuthorityRefs: fields.maxAuthorityRefs as number,
    maxJournalEntries: fields.maxJournalEntries as number,
    maxDecimalDigits: fields.maxDecimalDigits as number
  });
}

export function readWalletOperationExactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  try {
    return readStrictOwnDataRecord(value, expectedKeys, () => walletOperationFail("invalid_shape"));
  } catch (error) {
    if (error instanceof WalletOperationProjectionIntegrityError) throw error;
    walletOperationFail("invalid_shape");
  }
}

export function readWalletOperationOwnDataProperty(value: unknown, propertyName: string): unknown {
  try {
    if (value !== null && typeof value === "object" && nodeUtilTypes.isProxy(value)) {
      walletOperationFail("invalid_shape");
    }
    if (!isPlainRecord(value)) walletOperationFail("invalid_shape");
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      walletOperationFail("invalid_shape");
    }
    return descriptor.value;
  } catch (error) {
    if (error instanceof WalletOperationProjectionIntegrityError) throw error;
    walletOperationFail("invalid_shape");
  }
}

export function readWalletOperationExactDataArray(
  value: unknown,
  minimum: number,
  policyMaximum: string,
  envelopeMaximum: number
): readonly unknown[] {
  try {
    const result = readStrictOwnDataArray(value, envelopeMaximum, (reason) => {
      if (reason === "array_limit") walletOperationFail("decoder_envelope_exceeded");
      walletOperationFail("invalid_shape");
    });
    if (result.length < minimum) walletOperationFail("invalid_shape");
    if (!canonicalUnsignedDecimalIsAtMost(result.length.toString(), policyMaximum)) {
      walletOperationFail("limit_policy_exceeded");
    }
    return result;
  } catch (error) {
    if (error instanceof WalletOperationProjectionIntegrityError) throw error;
    walletOperationFail("invalid_shape");
  }
}

export function walletOperationIntegrityBoundary<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof WalletOperationProjectionIntegrityError) throw error;
    throw new WalletOperationProjectionIntegrityError("invalid_field");
  }
}

export function walletOperationFail(reason: WalletOperationProjectionIntegrityReason): never {
  throw new WalletOperationProjectionIntegrityError(reason);
}

function canonicalUnsignedDecimalIsAtMost(value: string, maximum: string): boolean {
  return value.length < maximum.length || (value.length === maximum.length && value <= maximum);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
