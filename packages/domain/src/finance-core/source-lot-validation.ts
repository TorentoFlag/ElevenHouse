import { Temporal } from "@js-temporal/polyfill";
import { types as nodeUtilTypes } from "node:util";
import type { Money } from "../money";
import {
  PayableSourceLotIntegrityError,
  type PayableSourceLotIntegrityReason
} from "./source-lot-types";
import { readStrictOwnDataArray } from "./strict-own-data";

export function money(
  value: unknown,
  positive: boolean,
  reason: PayableSourceLotIntegrityReason
): Money {
  const fields = exactDataRecord(value, ["amountMinor", "currency"]);
  if (fields.currency !== "RUB") fail(reason);
  return Object.freeze({
    amountMinor: integer(fields.amountMinor, positive ? 1 : 0, Number.MAX_SAFE_INTEGER, reason),
    currency: "RUB"
  });
}

export function sameMoney(left: Money, right: Money): boolean {
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}

export function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200
  ) {
    fail("invalid_field");
  }
  return value;
}

export function nullableIdentifier(value: unknown): string | null {
  return value === null ? null : identifier(value);
}

export function positiveVersion(value: unknown, reason: PayableSourceLotIntegrityReason): number {
  return integer(value, 1, Number.MAX_SAFE_INTEGER, reason);
}

export function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  reason: PayableSourceLotIntegrityReason
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(reason);
  }
  return value as number;
}

export function instant(value: unknown): string {
  if (typeof value !== "string") fail("invalid_field");
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    return fail("invalid_field");
  }
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function dataRecord(value: unknown): Record<string, unknown> {
  try {
    if (!isPlainRecord(value)) fail("invalid_shape");
    const projected = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") fail("invalid_shape");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        fail("invalid_shape");
      }
      projected[key] = descriptor.value;
    }
    return Object.freeze(projected);
  } catch (error) {
    if (error instanceof PayableSourceLotIntegrityError) throw error;
    return fail("invalid_shape");
  }
}

export function exactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Record<Keys[number], unknown> {
  const projected = dataRecord(value);
  assertExactKeys(projected, expectedKeys);
  return projected as Record<Keys[number], unknown>;
}

export function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): void {
  const keys = Reflect.ownKeys(value);
  const expected = new Set(expectedKeys);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    fail("invalid_shape");
  }
}

export function exactDataArray(value: unknown): readonly unknown[] {
  return readStrictOwnDataArray(value, Number.MAX_SAFE_INTEGER, () => fail("invalid_shape"));
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  try {
    if (nodeUtilTypes.isProxy(value) || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function fail(reason: PayableSourceLotIntegrityReason): never {
  throw new PayableSourceLotIntegrityError(reason);
}
