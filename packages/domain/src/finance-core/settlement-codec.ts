import { Temporal } from "@js-temporal/polyfill";
import {
  createProviderAccountIdentityBinding,
  type ProviderAccountIdentityBinding
} from "./provider-account-binding";
import {
  financeSettlementStreamValues,
  FinanceSettlementCursorIntegrityError,
  type FinanceSettlementStream
} from "./settlement-cursor-types";
import { readStrictOwnDataRecord } from "./strict-own-data";

const streams = new Set<string>(financeSettlementStreamValues);
const int64Minimum = -9_223_372_036_854_775_808n;
const int64Maximum = 9_223_372_036_854_775_807n;

export function exactSettlementRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  return readStrictOwnDataRecord(value, expectedKeys, fail);
}

export function settlementIdentifier(value: unknown, maximumLength = 200): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    fail();
  }
  return value;
}

export function opaqueSettlementValue(value: unknown): string {
  return settlementIdentifier(value, 500);
}

export function nullableOpaqueSettlementValue(value: unknown): string | null {
  return value === null ? null : opaqueSettlementValue(value);
}

export function losslessInt64Decimal(value: unknown): string {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]{0,18})$/.test(value)) fail();
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    fail();
  }
  if (parsed < int64Minimum || parsed > int64Maximum || parsed.toString() !== value) fail();
  return value;
}

export function nullableLosslessInt64Decimal(value: unknown): string | null {
  return value === null ? null : losslessInt64Decimal(value);
}

export function settlementPayloadDigest(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail();
  return value;
}

export function settlementInstant(value: unknown): Temporal.Instant {
  if (typeof value !== "string" || value.trim() !== value) fail();
  try {
    return Temporal.Instant.from(value);
  } catch {
    fail();
  }
}

export function nullableSettlementInstantValue(value: unknown): string | null {
  if (value === null) return null;
  settlementInstant(value);
  return value as string;
}

export function settlementProviderAccount(value: unknown): ProviderAccountIdentityBinding {
  try {
    return createProviderAccountIdentityBinding(value);
  } catch {
    fail();
  }
}

export function settlementStream(value: unknown): FinanceSettlementStream {
  if (typeof value !== "string" || !streams.has(value)) fail();
  return value as FinanceSettlementStream;
}

export function positiveSafeInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) fail();
  return Number(value);
}

export function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail();
  return Number(value);
}

export function assertSettlementExpectedVersion(current: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || expected !== current) fail();
}

export function fail(): never {
  throw new FinanceSettlementCursorIntegrityError();
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}
