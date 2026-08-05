import {
  financeNumeric38Maximum,
  financeNumeric38Minimum,
  financeSignedInt64Maximum,
  financeSignedInt64Minimum
} from "../../schema/finance/finance-values";

const canonicalSignedDecimalPattern = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const canonicalUnsignedDecimalPattern = /^(?:0|[1-9][0-9]*)$/;
const canonicalPositiveDecimalPattern = /^[1-9][0-9]*$/;

const signedInt64Minimum = BigInt(financeSignedInt64Minimum);
const signedInt64Maximum = BigInt(financeSignedInt64Maximum);
const numeric38Minimum = BigInt(financeNumeric38Minimum);
const numeric38Maximum = BigInt(financeNumeric38Maximum);

export type FinanceRowCodecReason =
  | "decimal_string_required"
  | "non_canonical_decimal"
  | "signed_int64_out_of_range"
  | "numeric_38_out_of_range"
  | "unsigned_decimal_required"
  | "positive_decimal_required";

export class FinanceRowCodecError extends Error {
  readonly code = "finance_row_codec_error";

  constructor(readonly reason: FinanceRowCodecReason) {
    super("Finance database value violates the exact decimal-string contract");
    this.name = "FinanceRowCodecError";
  }
}

export function decodeFinanceSignedInt64(value: unknown): string {
  const decimal = canonicalSignedDecimal(value);
  const parsed = BigInt(decimal);
  if (parsed < signedInt64Minimum || parsed > signedInt64Maximum) {
    throw new FinanceRowCodecError("signed_int64_out_of_range");
  }
  return decimal;
}

export function encodeFinanceSignedInt64(value: unknown): string {
  return decodeFinanceSignedInt64(domainDecimal(value));
}

export function decodeFinanceNumeric38(value: unknown): string {
  const decimal = canonicalSignedDecimal(value);
  const parsed = BigInt(decimal);
  if (parsed < numeric38Minimum || parsed > numeric38Maximum) {
    throw new FinanceRowCodecError("numeric_38_out_of_range");
  }
  return decimal;
}

export function encodeFinanceNumeric38(value: unknown): string {
  return decodeFinanceNumeric38(domainDecimal(value));
}

export function decodeFinanceUnsignedRevision(value: unknown): string {
  if (typeof value !== "string") {
    throw new FinanceRowCodecError("decimal_string_required");
  }
  if (!canonicalUnsignedDecimalPattern.test(value)) {
    throw new FinanceRowCodecError("unsigned_decimal_required");
  }
  return decodeFinanceNumeric38(value);
}

export function decodeFinancePositiveRevision(value: unknown): string {
  if (typeof value !== "string") {
    throw new FinanceRowCodecError("decimal_string_required");
  }
  if (!canonicalPositiveDecimalPattern.test(value)) {
    throw new FinanceRowCodecError("positive_decimal_required");
  }
  return decodeFinanceNumeric38(value);
}

function canonicalSignedDecimal(value: unknown): string {
  if (typeof value !== "string") {
    throw new FinanceRowCodecError("decimal_string_required");
  }
  if (!canonicalSignedDecimalPattern.test(value)) {
    throw new FinanceRowCodecError("non_canonical_decimal");
  }
  return value;
}

/**
 * Database reads remain string-only: accepting a JavaScript number there could silently lose
 * precision. Domain money is deliberately bigint, however, so write-boundary encoders turn only
 * that exact integer representation into the canonical wire string before applying the same
 * numeric range checks.
 */
function domainDecimal(value: unknown): string | unknown {
  return typeof value === "bigint" ? value.toString(10) : value;
}
