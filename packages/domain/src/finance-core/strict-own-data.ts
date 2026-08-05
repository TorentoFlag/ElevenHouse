import { types as nodeUtilTypes } from "node:util";

export type StrictOwnDataFailureReason =
  | "invalid_container"
  | "proxy"
  | "symbol_key"
  | "unexpected_key"
  | "missing_key"
  | "accessor"
  | "sparse_array"
  | "array_limit"
  | "invalid_limit";

export type StrictOwnDataFailure = (reason: StrictOwnDataFailureReason) => never;

export function readStrictOwnDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
  fail: StrictOwnDataFailure
): Readonly<Record<Keys[number], unknown>> {
  if (typeof value !== "object" || value === null) return fail("invalid_container");
  rejectProxy(value, fail);
  if (Array.isArray(value)) return fail("invalid_container");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail("invalid_container");
  if (Object.getOwnPropertySymbols(value).length !== 0) return fail("symbol_key");

  const expected = new Set(expectedKeys);
  if (expected.size !== expectedKeys.length) return fail("invalid_container");
  const ownNames = Object.getOwnPropertyNames(value);
  for (const key of ownNames) {
    if (!expected.has(key)) return fail("unexpected_key");
  }
  if (ownNames.length !== expectedKeys.length) return fail("missing_key");

  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return fail("missing_key");
    if (!("value" in descriptor) || !descriptor.enumerable) return fail("accessor");
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true
    });
  }
  return Object.freeze(copy) as Readonly<Record<Keys[number], unknown>>;
}

export function readStrictOwnDataArray(
  value: unknown,
  maxItems: number,
  fail: StrictOwnDataFailure
): readonly unknown[] {
  if (!Number.isSafeInteger(maxItems) || maxItems < 0) return fail("invalid_limit");
  if (typeof value !== "object" || value === null) return fail("invalid_container");
  rejectProxy(value, fail);
  if (!Array.isArray(value)) return fail("invalid_container");
  if (Object.getPrototypeOf(value) !== Array.prototype) return fail("invalid_container");
  if (Object.getOwnPropertySymbols(value).length !== 0) return fail("symbol_key");
  if (value.length > maxItems) return fail("array_limit");

  const expectedNames = new Set<string>(["length"]);
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    expectedNames.add(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return fail("sparse_array");
    if (!("value" in descriptor) || !descriptor.enumerable) return fail("accessor");
    copy.push(descriptor.value);
  }
  if (Object.getOwnPropertyNames(value).some((key) => !expectedNames.has(key))) {
    return fail("unexpected_key");
  }
  return Object.freeze(copy);
}

function rejectProxy(value: object, fail: StrictOwnDataFailure): void {
  if (nodeUtilTypes.isProxy(value)) fail("proxy");
}
