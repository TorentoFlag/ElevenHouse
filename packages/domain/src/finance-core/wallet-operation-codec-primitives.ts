import { Temporal } from "@js-temporal/polyfill";
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import { createFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import {
  readWalletOperationExactDataRecord,
  walletOperationFail
} from "./wallet-operation-codec-boundary";
import type { WalletProjectionDecoderEnvelope } from "./wallet-operation-snapshot-types";

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const canonicalSignedIntegerPattern = /^(?:0|[1-9][0-9]*|-[1-9][0-9]*)$/;
const canonicalUnsignedIntegerPattern = /^(?:0|[1-9][0-9]*)$/;

export function walletOperationSha256(value: unknown): string {
  return digestFinanceCanonicalValueV1(value);
}

export function normalizeWalletOperationSourceKey(input: unknown): FinanceSourceKey {
  try {
    const fields = readWalletOperationExactDataRecord(input, ["kind", "sourceId", "operation"]);
    return createFinanceSourceKey({
      kind: fields.kind,
      sourceId: fields.sourceId,
      operation: fields.operation
    });
  } catch {
    walletOperationFail("invalid_field");
  }
}

export function normalizeWalletOperationIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    walletOperationFail("invalid_field");
  }
  return value;
}

export function normalizeWalletOperationNullableIdentifier(value: unknown): string | null {
  return value === null ? null : normalizeWalletOperationIdentifier(value);
}

export function normalizeWalletOperationDigest(value: unknown): string {
  if (typeof value !== "string" || value.length !== 71 || !digestPattern.test(value)) {
    walletOperationFail("invalid_field");
  }
  return value;
}

export function normalizeWalletOperationUnsignedDecimal(
  value: unknown,
  envelope: WalletProjectionDecoderEnvelope
): string {
  if (typeof value !== "string") walletOperationFail("invalid_field");
  if (value.length > envelope.maxDecimalDigits) {
    walletOperationFail("decoder_envelope_exceeded");
  }
  if (!canonicalUnsignedIntegerPattern.test(value)) walletOperationFail("invalid_field");
  return value;
}

export function normalizeWalletOperationSignedDecimal(
  value: unknown,
  envelope: WalletProjectionDecoderEnvelope
): string {
  if (typeof value !== "string") walletOperationFail("invalid_field");
  const digitCount = value.length - (value.charCodeAt(0) === 45 ? 1 : 0);
  if (digitCount > envelope.maxDecimalDigits) {
    walletOperationFail("decoder_envelope_exceeded");
  }
  if (!canonicalSignedIntegerPattern.test(value)) walletOperationFail("invalid_field");
  return value;
}

export function walletOperationUnsignedDecimalFitsSafeMaximum(
  value: string,
  maximum: number
): boolean {
  const canonicalMaximum = maximum.toString();
  return (
    value.length < canonicalMaximum.length ||
    (value.length === canonicalMaximum.length && value <= canonicalMaximum)
  );
}

export function normalizeWalletOperationInstant(value: unknown): string {
  if (typeof value !== "string") walletOperationFail("invalid_field");
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    walletOperationFail("invalid_field");
  }
}

export function projectWalletOperationRecord<const Keys extends readonly string[]>(
  record: Record<string, unknown>,
  keys: Keys
): Record<Keys[number], unknown> {
  const projected: Record<string, unknown> = {};
  for (const key of keys) projected[key] = record[key];
  return projected as Record<Keys[number], unknown>;
}
