import { Temporal } from "@js-temporal/polyfill";
import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import { createFinanceSourceKey, type FinanceSourceKey } from "../finance-source-key";
import {
  FinancePostingIntegrityError,
  type FinancePostingIntegrityReason
} from "./posting-integrity-error";
import { assertFinancePostingNotProxy, readExactDataRecord } from "./posting-structural-codec";

export function readFinancePostingIdentifier(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.trim() !== input ||
    input.length === 0 ||
    input.length > 200
  ) {
    throw new FinancePostingIntegrityError("invalid_identifier");
  }
  return input;
}

export function readFinancePostingVersion(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) <= 0) {
    throw new FinancePostingIntegrityError("invalid_version");
  }
  return input as number;
}

export function readFinancePostingMoney(input: unknown): Money {
  const value = readExactDataRecord(input, ["amountMinor", "currency"]);
  if (
    value.currency !== "RUB" ||
    !Number.isSafeInteger(value.amountMinor) ||
    (value.amountMinor as number) <= 0
  ) {
    throw new FinancePostingIntegrityError("invalid_money");
  }
  return Object.freeze({ amountMinor: value.amountMinor as number, currency: "RUB" });
}

export function readFinancePostingDigest(input: unknown): FinanceAuthorizationPayloadHash {
  if (typeof input !== "string" || !/^sha256:[0-9a-f]{64}$/.test(input)) {
    throw new FinancePostingIntegrityError("invalid_digest");
  }
  return input as FinanceAuthorizationPayloadHash;
}

export function readFinancePostingInstant(input: unknown): string {
  if (typeof input !== "string") throw new FinancePostingIntegrityError("invalid_instant");
  try {
    return Temporal.Instant.from(input).toString();
  } catch {
    throw new FinancePostingIntegrityError("invalid_instant");
  }
}

export function compareFinancePostingInstants(left: string, right: string): number {
  try {
    return Temporal.Instant.compare(Temporal.Instant.from(left), Temporal.Instant.from(right));
  } catch {
    throw new FinancePostingIntegrityError("invalid_instant");
  }
}

export function assertFinancePostingInstantEqual(
  left: string,
  right: string,
  reason: FinancePostingIntegrityReason
): void {
  if (compareFinancePostingInstants(left, right) !== 0) {
    throw new FinancePostingIntegrityError(reason);
  }
}

export function assertFinancePostingMoneyEqual(
  left: Money,
  right: Money,
  reason: FinancePostingIntegrityReason
): void {
  if (left.currency !== right.currency || left.amountMinor !== right.amountMinor) {
    throw new FinancePostingIntegrityError(reason);
  }
}

export function readFinancePostingUnsignedDecimal(input: unknown, maximumDigits: number): string {
  if (!Number.isSafeInteger(maximumDigits) || maximumDigits <= 0) {
    throw new FinancePostingIntegrityError("decoder_envelope_required");
  }
  if (typeof input !== "string") {
    throw new FinancePostingIntegrityError("invalid_version");
  }
  if (input.length > maximumDigits) {
    throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(input)) {
    throw new FinancePostingIntegrityError("invalid_version");
  }
  return input;
}

export function readPositiveFinancePostingDecimal(input: unknown, maximumDigits: number): string {
  const value = readFinancePostingUnsignedDecimal(input, maximumDigits);
  if (BigInt(value) === 0n) throw new FinancePostingIntegrityError("invalid_version");
  return value;
}

export function readFinancePostingSourceKey(input: unknown): FinanceSourceKey {
  try {
    if (typeof input !== "object" || input === null) {
      throw new FinancePostingIntegrityError("invalid_shape");
    }
    assertFinancePostingNotProxy(input);
    const fields = readExactDataRecord(input, ["kind", "sourceId", "operation"]);
    try {
      return createFinanceSourceKey(fields);
    } catch {
      throw new FinancePostingIntegrityError("source_mismatch");
    }
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("invalid_shape");
  }
}

export function sameFinancePostingSourceKey(
  left: FinanceSourceKey,
  right: FinanceSourceKey
): boolean {
  return (
    left.kind === right.kind &&
    left.sourceId === right.sourceId &&
    left.operation === right.operation
  );
}

export function sameCanonicalFinancePostingValue(left: unknown, right: unknown): boolean {
  return hashFinanceCommandPayload(left) === hashFinanceCommandPayload(right);
}
